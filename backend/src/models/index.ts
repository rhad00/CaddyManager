import { Sequelize } from 'sequelize-typescript';
import { User } from './User';
import { Proxy } from './Proxy';
import { HealthCheck } from './HealthCheck';
import { SSLCertificate } from './SSLCertificate';
import { Header } from './Header';
import { BasicAuth } from './BasicAuth';
import { IpRestriction } from './IpRestriction';
import { RateLimit } from './RateLimit';
import { SecurityHeader } from './SecurityHeader';
import { AlertThreshold } from './alerts/AlertThreshold';
import { AlertInstance } from './alerts/AlertInstance';
import { PathRule } from './PathRule';
import { Metric } from './Metric';

// All models should be listed here for proper initialization
const models = [
  User,
  Proxy,
  HealthCheck,
  SSLCertificate,
  Header,
  BasicAuth,
  IpRestriction,
  RateLimit,
  SecurityHeader,
  AlertThreshold,
  AlertInstance,
  PathRule,
  Metric,
];

export const initModels = (sequelize: Sequelize): void => {
  sequelize.addModels(models);
};

export {
  User,
  Proxy,
  HealthCheck,
  SSLCertificate,
  Header,
  BasicAuth,
  IpRestriction,
  RateLimit,
  SecurityHeader,
  AlertThreshold,
  AlertInstance,
  PathRule,
  Metric,
};
