import { sequelize } from '../config/database';
import { User } from './user';
import { Proxy } from './proxy';
import { Header } from './header';
import { Middleware } from './middleware';
import { Template } from './template';
import { Backup } from './backup';
import { Certificate } from './certificate';
import { CertificateAuthority } from './certificateAuthority';
import { AuditLog } from './auditLog';
import { Metric } from './metric';
import { DiscoveredService } from './discoveredService';
import { GitRepository } from './gitRepository';
import { ConfigChange } from './configChange';
import { AlertRule } from './alertRule';
import { NotificationChannel } from './notificationChannel';
import { ApiKey } from './apiKey';

// Define associations after all models are loaded
const setupAssociations = () => {
  // User - Proxy associations
  Proxy.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

  // Proxy - Header associations
  Header.belongsTo(Proxy, { foreignKey: 'proxy_id', onDelete: 'CASCADE' });
  Proxy.hasMany(Header, { foreignKey: 'proxy_id', as: 'headers' });

  // Proxy - Middleware associations
  Middleware.belongsTo(Proxy, { foreignKey: 'proxy_id', onDelete: 'CASCADE' });
  Proxy.hasMany(Middleware, { foreignKey: 'proxy_id', as: 'middlewares' });

  // Backup - User associations
  Backup.belongsTo(User, { foreignKey: 'created_by', as: 'backupCreator' });

  // Certificate - User associations
  Certificate.belongsTo(User, { foreignKey: 'created_by', as: 'certCreator' });
  Certificate.belongsTo(CertificateAuthority, { foreignKey: 'ca_id', as: 'authority' });

  // CertificateAuthority - Certificate associations
  CertificateAuthority.hasMany(Certificate, { foreignKey: 'ca_id', as: 'certificates' });

  // AuditLog - User associations
  AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

  // DiscoveredService - Proxy associations
  DiscoveredService.belongsTo(Proxy, { foreignKey: 'proxy_id', as: 'proxy' });

  // ConfigChange - User associations
  ConfigChange.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

  // ConfigChange - GitRepository associations
  ConfigChange.belongsTo(GitRepository, { foreignKey: 'git_repository_id', as: 'repository' });
  GitRepository.hasMany(ConfigChange, { foreignKey: 'git_repository_id', as: 'changes' });

  // ApiKey - User associations
  ApiKey.belongsTo(User, { foreignKey: 'created_by', as: 'owner' });
  User.hasMany(ApiKey, { foreignKey: 'created_by', as: 'apiKeys' });
};

// Call setupAssociations after models are defined
setupAssociations();

export {
  sequelize,
  User,
  Proxy,
  Header,
  Middleware,
  Template,
  Backup,
  Certificate,
  CertificateAuthority,
  AuditLog,
  Metric,
  DiscoveredService,
  GitRepository,
  ConfigChange,
  AlertRule,
  NotificationChannel,
  ApiKey,
};
