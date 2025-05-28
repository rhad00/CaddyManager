const { sequelize } = require('../config/database');
const User = require('./user');
const Proxy = require('./proxy');
const Header = require('./header');
const Middleware = require('./middleware');
const Template = require('./template');
const Backup = require('./backup');
const Certificate = require ('./certificate');
const CertificateAuthority = require('./certificateAuthority');
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
};
