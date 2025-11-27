const axios = require('axios');
const { Metric } = require('../models');
const { Op } = require('sequelize');
require('dotenv').config();

/**
 * Service for interacting with Caddy's Metrics API
 */
class MetricsService {
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
   * @returns {Promise<string>} Raw metrics in Prometheus format
   */
  async getRawMetrics() {
    try {
      // Check cache first
      const now = Date.now();
      if (this.metricsCache.data && (now - this.metricsCache.timestamp) < this.cacheTime) {
        return this.metricsCache.data;
      }
      
      const response = await axios.get(`${this.apiUrl}/metrics`);
      
      // Update cache
      this.metricsCache.data = response.data;
      this.metricsCache.timestamp = now;
      
      return response.data;
    } catch (error) {
      console.error('Failed to get metrics from Caddy:', error.message);
      throw new Error(`Failed to get metrics: ${error.message}`);
    }
  }
  
  /**
   * Parse Prometheus format metrics into structured data
   * @param {string} rawMetrics - Raw metrics in Prometheus format
   * @returns {Object} Structured metrics data
   */
  parseMetrics(rawMetrics) {
    const metrics = {};
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
          const labels = {};
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
   * @returns {Promise<Object>} Structured metrics data
   */
  async getMetrics() {
    const rawMetrics = await this.getRawMetrics();
    return this.parseMetrics(rawMetrics);
  }
  
  /**
   * Get specific metric by name
   * @param {string} metricName - Name of the metric to retrieve
   * @returns {Promise<Array>} Array of metric data points
   */
  async getMetricByName(metricName) {
    const metrics = await this.getMetrics();
    return metrics[metricName] || [];
  }
  
  /**
   * Get HTTP request metrics
   * @returns {Promise<Object>} HTTP request metrics
   */
  async getHttpMetrics() {
    const metrics = await this.getMetrics();
    
    // Filter metrics related to HTTP
    const httpMetrics = {};
    for (const [name, data] of Object.entries(metrics)) {
      if (name.includes('http')) {
        httpMetrics[name] = data;
      }
    }
    
    return httpMetrics;
  }
  
  /**
   * Get system metrics (CPU, memory, etc.)
   * @returns {Promise<Object>} System metrics
   */
  async getSystemMetrics() {
    const metrics = await this.getMetrics();
    
    // Filter metrics related to system resources
    const systemMetrics = {};
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
   * @returns {Promise<Object>} TLS metrics
   */
  async getTlsMetrics() {
    const metrics = await this.getMetrics();
    
    // Filter metrics related to TLS
    const tlsMetrics = {};
    for (const [name, data] of Object.entries(metrics)) {
      if (name.includes('tls')) {
        tlsMetrics[name] = data;
      }
    }
    
    return tlsMetrics;
  }
  
  /**
   * Save current metrics to database for historical data
   * @returns {Promise<Object>} Save result
   */
  async saveMetricsSnapshot() {
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
      throw new Error(`Failed to save metrics snapshot: ${error.message}`);
    }
  }
  
  /**
   * Get historical metrics data from database
   * @param {number} limit - Maximum number of snapshots to retrieve
   * @returns {Promise<Array>} Historical metrics data
   */
  async getHistoricalMetrics(limit = 10) {
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
      throw new Error(`Failed to get historical metrics: ${error.message}`);
    }
  }
  
  /**
   * Delete old metrics snapshots to prevent database bloat
   * @param {number} daysToKeep - Number of days of metrics to keep
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupOldMetrics(daysToKeep = 30) {
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
      throw new Error(`Failed to cleanup old metrics: ${error.message}`);
    }
  }
  
  /**
   * Get summary of key metrics
   * @returns {Promise<Object>} Summary of key metrics
   */
  async getMetricsSummary() {
    try {
      const metrics = await this.getMetrics();
      
      // Extract key metrics for summary
      const summary = {
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
      throw new Error(`Failed to get metrics summary: ${error.message}`);
    }
  }
  
  /**
   * Sum values of a metric across all labels
   * @param {Array} metricData - Array of metric data points
   * @returns {number} Sum of metric values
   */
  sumMetricValues(metricData) {
    return metricData.reduce((sum, item) => sum + item.value, 0);
  }
  
  /**
   * Get the first metric value (for single-value metrics)
   * @param {Array} metricData - Array of metric data points
   * @returns {number} First metric value or 0 if not available
   */
  getMetricValue(metricData) {
    return metricData.length > 0 ? metricData[0].value : 0;
  }
  
  /**
   * Calculate average of metric values
   * @param {Array} metricData - Array of metric data points
   * @returns {number} Average of metric values
   */
  calculateAverage(metricData) {
    if (metricData.length === 0) return 0;
    return this.sumMetricValues(metricData) / metricData.length;
  }
  
  /**
   * Group HTTP response metrics by status code
   * @param {Array} metricData - Array of metric data points
   * @returns {Object} Metrics grouped by status code
   */
  groupByStatusCode(metricData) {
    const result = {
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
   * @param {number} intervalMinutes - Interval in minutes between snapshots
   */
  scheduleMetricsSnapshots(intervalMinutes = 60) {
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
   * @param {number} cleanupIntervalHours - Interval in hours between cleanup runs
   * @param {number} daysToKeep - Number of days of metrics to keep
   */
  scheduleMetricsCleanup(cleanupIntervalHours = 24, daysToKeep = 30) {
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

module.exports = new MetricsService();
