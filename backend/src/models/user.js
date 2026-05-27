const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcrypt');
const { encrypt, decrypt } = require('../utils/encryption');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'read-only'),
    defaultValue: 'read-only',
    allowNull: false
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'locked'),
    defaultValue: 'active',
    allowNull: false
  },
  failed_login_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  reset_token: {
    type: DataTypes.STRING,
    allowNull: true
  },
  reset_token_expires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lockout_until: {
    type: DataTypes.DATE,
    allowNull: true
  },
  totp_secret: {
    type: DataTypes.STRING,
    allowNull: true
  },
  totp_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  totp_backup_codes: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt
  hooks: {
    beforeCreate: async (user) => {
      if (user.password_hash) {
        // Hash password before saving
        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash(user.password_hash, salt);
      }
      // Encrypt TOTP secret before persisting
      if (user.totp_secret) {
        user.totp_secret = encrypt(user.totp_secret);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password_hash')) {
        // Hash password before updating if it changed
        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash(user.password_hash, salt);
      }
      // Encrypt TOTP secret if it changed
      if (user.changed('totp_secret') && user.totp_secret) {
        user.totp_secret = encrypt(user.totp_secret);
      }
    },
    afterFind: (result) => {
      if (!result) return;
      const users = Array.isArray(result) ? result : [result];
      for (const user of users) {
        if (user && user.totp_secret) {
          user.totp_secret = decrypt(user.totp_secret);
        }
      }
    }
  }
});

// Instance method to check password
User.prototype.checkPassword = async function(password) {
  return await bcrypt.compare(password, this.password_hash);
};

module.exports = User;
