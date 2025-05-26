// Enums matching backend types
export enum MetricType {
  REQUEST_TIME = "request_time",
  ERROR_RATE = "error_rate",
  BANDWIDTH_IN = "bandwidth_in",
  BANDWIDTH_OUT = "bandwidth_out",
  CPU_USAGE = "cpu_usage",
  MEMORY_USAGE = "memory_usage",
  CONNECTION_COUNT = "connection_count",
}

export enum HealthStatus {
  HEALTHY = "healthy",
  UNHEALTHY = "unhealthy",
  DEGRADED = "degraded",
  UNKNOWN = "unknown",
}

export enum CertificateStatus {
  VALID = "valid",
  EXPIRING_SOON = "expiring_soon",
  EXPIRED = "expired",
  INVALID = "invalid",
}

export interface Metric {
  id: string;
  proxyId: string;
  timestamp: string;
  metricType: MetricType;
  value: number;
  tags?: Record<string, string>;
}

export interface HealthCheck {
  id: string;
  proxyId: string;
  status: HealthStatus;
  lastCheck: string;
  responseTime?: number;
  errorMessage?: string;
}

export interface SSLCertificate {
  id: string;
  proxyId: string;
  domain: string;
  issuer?: string;
  validFrom: string;
  validTo: string;
  status: CertificateStatus;
}

export interface MonitoringUpdate {
  type: "metric" | "health" | "ssl";
  data: Metric | HealthCheck | SSLCertificate;
}

export interface ProxyMetrics {
  [proxyId: string]: {
    [metricType in MetricType]?: {
      values: number[];
      timestamps: string[];
    };
  };
}

export interface ProxyHealth {
  [proxyId: string]: HealthCheck;
}

export interface ProxySSLCertificates {
  [proxyId: string]: SSLCertificate[];
}

export interface ChartDataPoint {
  timestamp: string;
  value: number;
}

export interface ChartData {
  label: string;
  data: ChartDataPoint[];
}
