export enum AlertSeverity {
  CRITICAL = 'critical',
  WARNING = 'warning',
  INFO = 'info'
}

export interface AlertInstance {
  id: string;
  name: string;
  message: string;
  severity: AlertSeverity;
  proxyId: string;
  triggeredAt: string;
  acknowledged: boolean;
}

export interface AlertThreshold {
  id: string;
  name: string;
  metricName: string;
  condition: 'above' | 'below' | 'equals';
  value: number;
  duration: number;
  severity: AlertSeverity;
  enabled: boolean;
}

export type AlertsState = {
  alerts: AlertInstance[];
  thresholds: AlertThreshold[];
  loading: boolean;
  error: string | null;
};
