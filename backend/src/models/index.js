const { sequelize } = require('../config/database');
const User = require('./user');
const Proxy = require('./proxy');
const Header = require('./header');
const Middleware = require('./middleware');
const Template = require('./template');
const Backup = require('./backup');
const Certificate = require('./certificate');
const CertificateAuthority = require('./certificateAuthority');
const AuditLog = require('./auditLog');
const Metric = require('./metric');
const DiscoveredService = require('./discoveredService');
const GitRepository = require('./gitRepository');
const ConfigChange = require('./configChange');

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
};

// Call setupAssociations after models are defined
setupAssociations();

module.exports = {
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
};
