import axios from 'axios';
import dotenv from 'dotenv';
import { Op } from 'sequelize';
import { Metric } from '../models';
import { errorMessage } from '../utils/errorMessage';

dotenv.config();

/** One sample of a Prometheus metric */
export interface MetricPoint {
  labels: Record<string, string>;
  value: number;
}

/** Parsed Prometheus metrics, by metric name */
export type ParsedMetrics = Record<string, MetricPoint[]>;

export type MetricsSummary = {
  timestamp: string;
  http: {
    requestsTotal: number;
    responseStatus: StatusCodeTotals;
    avgRequestDuration: number;
  };
  system: {
    cpuSeconds: number;
    memoryBytes: number;
    goroutines: number;
  };
  tls: {
    handshakesTotal: number;
    certificatesTotal: number;
  };
};

export interface StatusCodeTotals {
  '2xx': number;
  '3xx': number;
  '4xx': number;
  '5xx': number;
}

export interface MetricsSnapshotResult {
  success: boolean;
  id: number;
  timestamp: Date;
}

/**
 * Service for interacting with Caddy's Metrics API
 */
export class MetricsService {
  apiUrl: string;
  cacheTime: number;
  metricsCache: { data: string | null; timestamp: number };

  constructor() {
    this.apiUrl = process.env.CADDY_API_URL || 'http://localhost:2019';
    this.cacheTime = 10000; // 10 seconds cache
    this.metricsCache = {
      data: null,
      timestamp: 0
    };
  }

  /**
   * Get raw metrics from Caddy
   * @returns Raw metrics in Prometheus format
   */
  async getRawMetrics(): Promise<string> {
    try {
      // Check cache first
      const now = Date.now();
      if (this.metricsCache.data && (now - this.metricsCache.timestamp) < this.cacheTime) {
        return this.metricsCache.data;
      }

      const response = await axios.get<string>(`${this.apiUrl}/metrics`);

      // Update cache
      this.metricsCache.data = response.data;
      this.metricsCache.timestamp = now;

      return response.data;
    } catch (error) {
      console.error('Failed to get metrics from Caddy:', errorMessage(error));
      throw new Error(`Failed to get metrics: ${errorMessage(error)}`);
    }
  }

  /**
   * Parse Prometheus format metrics into structured data
   * @param rawMetrics - Raw metrics in Prometheus format
   * @returns Structured metrics data
   */
  parseMetrics(rawMetrics: string): ParsedMetrics {
    const metrics: ParsedMetrics = {};
    const lines = rawMetrics.split('\n');

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || line.trim() === '') {
        continue;
      }

      // Parse metric line
      try {
        // Extract metric name, labels, and value
        const metricMatch = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)((?:{.+?})?)(?:\s+)([0-9.eE+-]+)(?:\s+(\d+))?$/);

        if (metricMatch) {
          const [, name, labelsStr, value] = metricMatch;

          // Parse labels if present
          const labels: Record<string, string> = {};
          if (labelsStr) {
            const labelsMatch = labelsStr.match(/{(.+?)}/);
            if (labelsMatch) {
              const labelPairs = labelsMatch[1].split(',');
              for (const pair of labelPairs) {
                const [key, val] = pair.split('=');
                if (key && val) {
                  // Remove quotes from label value
                  labels[key.trim()] = val.trim().replace(/^"(.*)"$/, '$1');
                }
              }
            }
          }

          // Group metrics by name
          if (!metrics[name]) {
            metrics[name] = [];
          }

          metrics[name].push({
            labels,
            value: parseFloat(value)
          });
        }
      } catch (error) {
        console.warn(`Failed to parse metric line: ${line}`, error);
      }
    }

    return metrics;
  }

  /**
   * Get structured metrics data
   */
  async getMetrics(): Promise<ParsedMetrics> {
    const rawMetrics = await this.getRawMetrics();
    return this.parseMetrics(rawMetrics);
  }

  /**
   * Get specific metric by name
   * @param metricName - Name of the metric to retrieve
   * @returns Array of metric data points
   */
  async getMetricByName(metricName: string): Promise<MetricPoint[]> {
    const metrics = await this.getMetrics();
    return metrics[metricName] || [];
  }

  /**
   * Get HTTP request metrics
   */
  async getHttpMetrics(): Promise<ParsedMetrics> {
    const metrics = await this.getMetrics();

    // Filter metrics related to HTTP
    const httpMetrics: ParsedMetrics = {};
    for (const [name, data] of Object.entries(metrics)) {
      if (name.includes('http')) {
        httpMetrics[name] = data;
      }
    }

    return httpMetrics;
  }

  /**
   * Get system metrics (CPU, memory, etc.)
   */
  async getSystemMetrics(): Promise<ParsedMetrics> {
    const metrics = await this.getMetrics();

    // Filter metrics related to system resources
    const systemMetrics: ParsedMetrics = {};
    const systemMetricNames = [
      'process_cpu_seconds_total',
      'process_resident_memory_bytes',
      'process_virtual_memory_bytes',
      'process_open_fds',
      'process_max_fds',
      'go_goroutines',
      'go_threads'
    ];

    for (const name of systemMetricNames) {
      if (metrics[name]) {
        systemMetrics[name] = metrics[name];
      }
    }

    return systemMetrics;
  }

  /**
   * Get TLS metrics
   */
  async getTlsMetrics(): Promise<ParsedMetrics> {
    const metrics = await this.getMetrics();

    // Filter metrics related to TLS
    const tlsMetrics: ParsedMetrics = {};
    for (const [name, data] of Object.entries(metrics)) {
      if (name.includes('tls')) {
        tlsMetrics[name] = data;
      }
    }

    return tlsMetrics;
  }

  /**
   * Save current metrics to database for historical data
   */
  async saveMetricsSnapshot(): Promise<MetricsSnapshotResult> {
    try {
      const metrics = await this.getMetrics();
      const summary = await this.getMetricsSummary();

      const snapshot = await Metric.create({
        timestamp: new Date(),
        metrics_data: metrics,
        summary: summary
      });

      return {
        success: true,
        id: snapshot.id,
        timestamp: snapshot.timestamp
      };
    } catch (error) {
      console.error('Failed to save metrics snapshot:', error);
      throw new Error(`Failed to save metrics snapshot: ${errorMessage(error)}`);
    }
  }

  /**
   * Get historical metrics data from database
   * @param limit - Maximum number of snapshots to retrieve
   * @returns Historical metrics data
   */
  async getHistoricalMetrics(limit = 10): Promise<Array<{
    id: number;
    timestamp: Date;
    metrics: Record<string, unknown>;
    summary: Record<string, unknown> | null;
    createdAt: Date;
  }>> {
    try {
      const metrics = await Metric.findAll({
        order: [['timestamp', 'DESC']],
        limit: limit,
        attributes: ['id', 'timestamp', 'metrics_data', 'summary', 'createdAt']
      });

      return metrics.map(m => ({
        id: m.id,
        timestamp: m.timestamp,
        metrics: m.metrics_data,
        summary: m.summary,
        createdAt: m.createdAt
      }));
    } catch (error) {
      console.error('Failed to get historical metrics:', error);
      throw new Error(`Failed to get historical metrics: ${errorMessage(error)}`);
    }
  }

  /**
   * Delete old metrics snapshots to prevent database bloat
   * @param daysToKeep - Number of days of metrics to keep
   * @returns Number of deleted records
   */
  async cleanupOldMetrics(daysToKeep = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const deletedCount = await Metric.destroy({
        where: {
          timestamp: {
            [Op.lt]: cutoffDate
          }
        }
      });

      console.log(`Cleaned up ${deletedCount} old metrics snapshots older than ${daysToKeep} days`);
      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old metrics:', error);
      throw new Error(`Failed to cleanup old metrics: ${errorMessage(error)}`);
    }
  }

  /**
   * Get summary of key metrics
   */
  async getMetricsSummary(): Promise<MetricsSummary> {
    try {
      const metrics = await this.getMetrics();

      // Extract key metrics for summary
      const summary: MetricsSummary = {
        timestamp: new Date().toISOString(),
        http: {
          requestsTotal: this.sumMetricValues(metrics['caddy_http_requests_total'] || []),
          responseStatus: this.groupByStatusCode(metrics['caddy_http_response_status_count_total'] || []),
          avgRequestDuration: this.calculateAverage(metrics['caddy_http_request_duration_seconds_sum'] || [])
        },
        system: {
          cpuSeconds: this.getMetricValue(metrics['process_cpu_seconds_total'] || []),
          memoryBytes: this.getMetricValue(metrics['process_resident_memory_bytes'] || []),
          goroutines: this.getMetricValue(metrics['go_goroutines'] || [])
        },
        tls: {
          handshakesTotal: this.sumMetricValues(metrics['caddy_tls_handshakes_total'] || []),
          certificatesTotal: this.sumMetricValues(metrics['caddy_tls_certificates_total'] || [])
        }
      };

      return summary;
    } catch (error) {
      console.error('Failed to get metrics summary:', error);
      throw new Error(`Failed to get metrics summary: ${errorMessage(error)}`);
    }
  }

  /**
   * Sum values of a metric across all labels
   * @param metricData - Array of metric data points
   * @returns Sum of metric values
   */
  sumMetricValues(metricData: MetricPoint[]): number {
    return metricData.reduce((sum, item) => sum + item.value, 0);
  }

  /**
   * Get the first metric value (for single-value metrics)
   * @param metricData - Array of metric data points
   * @returns First metric value or 0 if not available
   */
  getMetricValue(metricData: MetricPoint[]): number {
    return metricData.length > 0 ? metricData[0].value : 0;
  }

  /**
   * Calculate average of metric values
   * @param metricData - Array of metric data points
   * @returns Average of metric values
   */
  calculateAverage(metricData: MetricPoint[]): number {
    if (metricData.length === 0) return 0;
    return this.sumMetricValues(metricData) / metricData.length;
  }

  /**
   * Group HTTP response metrics by status code
   * @param metricData - Array of metric data points
   * @returns Metrics grouped by status code
   */
  groupByStatusCode(metricData: MetricPoint[]): StatusCodeTotals {
    const result: StatusCodeTotals = {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0
    };

    for (const item of metricData) {
      if (item.labels && item.labels.status_code) {
        const statusCode = parseInt(item.labels.status_code);
        if (statusCode >= 200 && statusCode < 300) result['2xx'] += item.value;
        else if (statusCode >= 300 && statusCode < 400) result['3xx'] += item.value;
        else if (statusCode >= 400 && statusCode < 500) result['4xx'] += item.value;
        else if (statusCode >= 500) result['5xx'] += item.value;
      }
    }

    return result;
  }

  /**
   * Schedule periodic metrics snapshots
   * @param intervalMinutes - Interval in minutes between snapshots
   */
  scheduleMetricsSnapshots(intervalMinutes = 60): void {
    // Create snapshot at startup
    this.saveMetricsSnapshot().catch(error => {
      console.error('Failed to create initial metrics snapshot:', error);
    });

    // Schedule periodic snapshots
    const intervalMs = intervalMinutes * 60 * 1000;
    setInterval(() => {
      this.saveMetricsSnapshot().catch(error => {
        console.error('Failed to create scheduled metrics snapshot:', error);
      });
    }, intervalMs);

    console.log(`Scheduled metrics snapshots every ${intervalMinutes} minutes`);
  }

  /**
   * Schedule periodic cleanup of old metrics
   * @param cleanupIntervalHours - Interval in hours between cleanup runs
   * @param daysToKeep - Number of days of metrics to keep
   */
  scheduleMetricsCleanup(cleanupIntervalHours = 24, daysToKeep = 30): void {
    // Run cleanup at startup
    this.cleanupOldMetrics(daysToKeep).catch(error => {
      console.error('Failed to run initial metrics cleanup:', error);
    });

    // Schedule periodic cleanup
    const intervalMs = cleanupIntervalHours * 60 * 60 * 1000;
    setInterval(() => {
      this.cleanupOldMetrics(daysToKeep).catch(error => {
        console.error('Failed to run scheduled metrics cleanup:', error);
      });
    }, intervalMs);

    console.log(`Scheduled metrics cleanup every ${cleanupIntervalHours} hours (keeping ${daysToKeep} days)`);
  }
}

export const metricsService = new MetricsService();
