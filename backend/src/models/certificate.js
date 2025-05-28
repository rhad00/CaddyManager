const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Certificate = sequelize.define('Certificate', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    domains: {
      type: DataTypes.TEXT,
      allowNull: false,
      description: 'Comma-separated list of domains'
    },
    issuer: {
      type: DataTypes.STRING,
      allowNull: false
    },
    valid_from: {
      type: DataTypes.DATE,
      allowNull: false
    },
    valid_to: {
      type: DataTypes.DATE,
      allowNull: false
    },
    certificate_pem: {
      type: DataTypes.TEXT,
      allowNull: true,
      description: 'PEM-encoded certificate'
    },
    private_key_pem: {
      type: DataTypes.TEXT,
      allowNull: true,
      description: 'PEM-encoded private key'
    },
    caddy_cert_id: {
      type: DataTypes.STRING,
      allowNull: true,
      description: 'Certificate ID in Caddy'
    },
    type: {
      type: DataTypes.ENUM('acme', 'uploaded', 'self-signed'),
      allowNull: false,
      defaultValue: 'acme'
    },
    auto_renew: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    status: {
      type: DataTypes.ENUM('valid', 'expired', 'revoked', 'pending'),
      allowNull: false,
      defaultValue: 'valid'
    }
  });

  return Certificate;
};
