import { Proxy } from '../models/Proxy';
import { Metric, MetricType } from '../models/Metric';
import { HealthCheck, HealthStatus } from '../models/HealthCheck';
import { SSLCertificate, CertificateStatus } from '../models/SSLCertificate';
import { WebSocket } from 'ws';
import axios from 'axios';
import https from 'https';
import tls from 'tls';

interface IMonitoringOptions {
  healthCheckInterval: number; // milliseconds
  metricCollectionInterval: number; // milliseconds
  sslCheckInterval: number; // milliseconds
}

class MonitoringService {
  private static instance: MonitoringService;
  private webSocketClients: Set<WebSocket>;
  private options: IMonitoringOptions;
  private healthCheckTimer?: NodeJS.Timeout;
  private metricCollectionTimer?: NodeJS.Timeout;
  private sslMonitoringTimer?: NodeJS.Timeout;

  private constructor() {
    this.webSocketClients = new Set();
    this.options = {
      healthCheckInterval: 60000, // 1 minute
      metricCollectionInterval: 10000, // 10 seconds
      sslCheckInterval: 86400000, // 24 hours
    };
  }

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  // Start all monitoring activities
  async startMonitoring(): Promise<void> {
    await Promise.all([
      this.startHealthChecks(),
      this.startMetricCollection(),
      this.startSSLMonitoring(),
    ]);
  }

  // Health Check Methods
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      void this.runHealthChecks();
    }, this.options.healthCheckInterval);
  }

  private async runHealthChecks(): Promise<void> {
    try {
      const proxies = await Proxy.findAll({ where: { isActive: true } });
      await Promise.all(proxies.map(proxy => this.performHealthCheck(proxy)));
    } catch (error) {
      console.error('Error running health checks:', error);
    }
  }

  private async performHealthCheck(proxy: Proxy): Promise<void> {
    let status = HealthStatus.UNKNOWN;
    let responseTime: number | undefined;
    let errorMessage: string | undefined;

    try {
      const domains = proxy.config.domains.map(d => d.name);
      const results = await Promise.all(domains.map(domain => this.checkDomain(domain)));

      // If any domain is unhealthy, mark the proxy as unhealthy
      if (results.some(r => !r.healthy)) {
        status = HealthStatus.UNHEALTHY;
        errorMessage = results
          .filter(r => !r.healthy)
          .map(r => r.error)
          .join('; ');
      } else {
        status = HealthStatus.HEALTHY;
        responseTime = Math.max(...results.map(r => r.responseTime));
      }
    } catch (error) {
      status = HealthStatus.UNHEALTHY;
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }

    // Update health check record
    await HealthCheck.create({
      proxyId: proxy.id,
      status,
      lastCheck: new Date(),
      responseTime,
      errorMessage,
    });

    // Notify clients if status changed
    this.notifyClients('health-check', {
      proxyId: proxy.id,
      status,
      timestamp: new Date(),
    });
  }

  private async checkDomain(domain: string): Promise<{
    healthy: boolean;
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();
    try {
      await axios.get(`https://${domain}`, {
        httpsAgent: new https.Agent({
          rejectUnauthorized: false, // Allow self-signed certificates
        }),
        timeout: 5000, // 5 second timeout
        validateStatus: status => status < 500, // Consider 4xx as "healthy" as it means the server is responding
      });
      return {
        healthy: true,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Metric Collection Methods
  private startMetricCollection(): void {
    this.metricCollectionTimer = setInterval(() => {
      void this.runMetricCollection();
    }, this.options.metricCollectionInterval);
  }

  private async runMetricCollection(): Promise<void> {
    try {
      const proxies = await Proxy.findAll({ where: { isActive: true } });
      await Promise.all(proxies.map(proxy => this.collectMetrics(proxy)));
    } catch (error) {
      console.error('Error collecting metrics:', error);
    }
  }

  private async collectMetrics(proxy: Proxy): Promise<void> {
    const timestamp = new Date();

    try {
      // Collect various metrics
      const metrics = this.gatherProxyMetrics();

      // Store metrics
      await Promise.all(
        Object.entries(metrics).map(([type, value]) =>
          Metric.create({
            proxyId: proxy.id,
            timestamp,
            metricType: type as MetricType,
            value,
          }),
        ),
      );

      // Notify clients
      this.notifyClients('metrics-update', {
        proxyId: proxy.id,
        metrics,
        timestamp,
      });
    } catch (error) {
      console.error(`Error collecting metrics for proxy ${proxy.id}:`, error);
    }
  }

  private gatherProxyMetrics(): Record<MetricType, number> {
    // This would integrate with Caddy's API or other monitoring tools
    // For now, returning mock data
    return {
      [MetricType.REQUEST_TIME]: Math.random() * 100,
      [MetricType.ERROR_RATE]: Math.random() * 1,
      [MetricType.BANDWIDTH_IN]: Math.random() * 1000,
      [MetricType.BANDWIDTH_OUT]: Math.random() * 1000,
      [MetricType.CPU_USAGE]: Math.random() * 100,
      [MetricType.MEMORY_USAGE]: Math.random() * 100,
      [MetricType.CONNECTION_COUNT]: Math.floor(Math.random() * 100),
    };
  }

  // SSL Certificate Monitoring Methods
  private startSSLMonitoring(): void {
    this.sslMonitoringTimer = setInterval(() => {
      void this.runSSLMonitoring();
    }, this.options.sslCheckInterval);
  }

  private async runSSLMonitoring(): Promise<void> {
    try {
      const proxies = await Proxy.findAll({ where: { isActive: true } });
      await Promise.all(proxies.map(proxy => this.checkSSLCertificates(proxy)));
    } catch (error) {
      console.error('Error monitoring SSL certificates:', error);
    }
  }

  private async checkSSLCertificates(proxy: Proxy): Promise<void> {
    const domains = proxy.config.domains;

    for (const domain of domains) {
      try {
        const certInfo = await this.getCertificateInfo(domain.name);

        await SSLCertificate.upsert({
          proxyId: proxy.id,
          domain: domain.name,
          issuer: certInfo.issuer,
          validFrom: certInfo.validFrom,
          validTo: certInfo.validTo,
          status: CertificateStatus.VALID, // Will be updated by model hooks
        });

        // Notify clients if certificate is expiring soon
        const cert = await SSLCertificate.findOne({
          where: { proxyId: proxy.id, domain: domain.name },
        });

        if (cert?.needsRenewal()) {
          this.notifyClients('ssl-alert', {
            proxyId: proxy.id,
            domain: domain.name,
            status: cert.status,
            daysUntilExpiration: cert.getDaysUntilExpiration(),
          });
        }
      } catch (error) {
        console.error(`Error checking SSL for ${domain.name}:`, error);

        await SSLCertificate.upsert({
          proxyId: proxy.id,
          domain: domain.name,
          status: CertificateStatus.INVALID,
          validFrom: new Date(),
          validTo: new Date(),
        });
      }
    }
  }

  private async getCertificateInfo(domain: string): Promise<{
    issuer: string;
    validFrom: Date;
    validTo: Date;
  }> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect(
        {
          host: domain,
          port: 443,
          servername: domain,
          rejectUnauthorized: false,
        },
        () => {
          const cert = socket.getPeerCertificate();
          socket.destroy();

          if (!cert) {
            reject(new Error('No certificate found'));
            return;
          }

          resolve({
            issuer: cert.subject.CN || 'Unknown',
            validFrom: new Date(cert.valid_from),
            validTo: new Date(cert.valid_to),
          });
        },
      );

      socket.on('error', (error: Error) => {
        socket.destroy();
        reject(error);
      });
    });
  }

  // WebSocket Management Methods
  addWebSocketClient(ws: WebSocket): void {
    this.webSocketClients.add(ws);
    ws.on('close', () => this.webSocketClients.delete(ws));
  }

  private notifyClients(event: string, data: unknown): void {
    const message = JSON.stringify({ event, data });
    this.webSocketClients.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    });
  }

  // Configuration Methods
  updateOptions(options: Partial<IMonitoringOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): IMonitoringOptions {
    return { ...this.options };
  }

  // Cleanup
  stop(): void {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.metricCollectionTimer) clearInterval(this.metricCollectionTimer);
    if (this.sslMonitoringTimer) clearInterval(this.sslMonitoringTimer);
  }
}

export default MonitoringService;
