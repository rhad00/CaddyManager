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

export interface AlertCondition {
  metric?: string;
  operator: '>' | '<' | '==' | '>=' | '<=';
  value: number;
  duration?: number;
  frequency?: number;
}

export interface EmailConfig {
  recipients: string[];
  subject?: string;
  template?: string;
}

export interface SlackConfig {
  webhook: string;
  channel?: string;
  username?: string;
}

export interface AlertNotification {
  type: 'email' | 'slack';
  config: EmailConfig | SlackConfig;
  enabled: boolean;
}

export interface AlertThreshold {
  id: string;
  proxyId: string;
  name: string;
  type: AlertType;
  severity: AlertSeverity;
  conditions: AlertCondition;
  enabled: boolean;
  notifications: AlertNotification[];
  createdAt: string;
  updatedAt: string;
}

export interface AlertInstance {
  id: string;
  thresholdId: string;
  proxyId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
  timestamp: string;
  resolved: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}
