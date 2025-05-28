const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CertificateAuthority = sequelize.define('CertificateAuthority', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true,
      description: 'URL of the ACME directory'
    },
    type: {
      type: DataTypes.ENUM('acme', 'custom'),
      allowNull: false,
      defaultValue: 'acme'
    },
    certificate_pem: {
      type: DataTypes.TEXT,
      allowNull: true,
      description: 'PEM-encoded CA certificate'
    },
    trusted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      description: 'Email for ACME account'
    },
    acme_account_id: {
      type: DataTypes.STRING,
      allowNull: true,
      description: 'ACME account ID in Caddy'
    }
  });

  return CertificateAuthority;
};
