export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum AlertType {
  METRIC_THRESHOLD = 'metric_threshold',
  SSL_EXPIRY = 'ssl_expiry',
  ERROR_RATE = 'error_rate',
  RESPONSE_TIME = 'response_time',
  HEALTH_CHECK = 'health_check',
}

export interface IMetricData {
  proxyId: string;
  metricType: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface IAlertThreshold {
  id: string;
  proxyId: string;
  name: string;
  type: AlertType;
  severity: AlertSeverity;
  conditions: IAlertCondition;
  enabled: boolean;
  notifications: IAlertNotification[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IAlertCondition {
  metric?: string;
  operator: '>' | '<' | '==' | '>=' | '<=';
  value: number;
  duration?: number; // Duration in seconds the condition must be true
  frequency?: number; // Minimum time between alerts in seconds
}

export interface IAlertNotification {
  type: 'email' | 'slack';
  config: IEmailConfig | ISlackConfig;
  enabled: boolean;
}

export interface IEmailConfig {
  recipients: string[];
  subject?: string;
  template?: string;
}

export interface ISlackConfig {
  webhook: string;
  channel?: string;
  username?: string;
}

export interface IAlertInstance {
  id: string;
  thresholdId: string;
  proxyId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
  timestamp: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}
