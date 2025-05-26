import { Request } from 'express';
import { Metric } from '../models/Metric';
import { HealthCheck } from '../models/HealthCheck';
import { SSLCertificate } from '../models/SSLCertificate';

export interface IMonitoringOptions {
  healthCheckInterval: number; // milliseconds
  metricCollectionInterval: number; // milliseconds
  sslCheckInterval: number; // milliseconds
}

export interface IMonitoringResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface IUpdateOptionsRequest extends Request {
  body: Partial<IMonitoringOptions>;
}

export type MonitoringResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export interface IWebSocketMessage {
  type: 'metric' | 'health' | 'ssl';
  data: Metric | HealthCheck | SSLCertificate;
}
