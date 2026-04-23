const crypto = require('crypto');
const { sequelize, User } = require('../models');
require('dotenv').config();

/**
 * Generate a cryptographically secure random password
 * @param {number} length - Password length (default 20)
 * @returns {string} Random password
 */
const generateSecurePassword = (length = 20) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
};

/**
 * Initialize the admin user if it doesn't exist
 * This is called during application startup
 */
const initializeAdmin = async () => {
  try {
    // Check if admin user exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@caddymanager.local';
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    // Use transaction to ensure data consistency
    const transaction = await sequelize.transaction();
    
    try {
      // Check if any users exist
      const userCount = await User.count({ transaction });
      
      // If no users exist, create admin user
      if (userCount === 0) {
        // Generate a secure random password if none provided
        const password = adminPassword || generateSecurePassword();
        const isGenerated = !adminPassword;

        console.log('No users found. Creating default admin user...');
        
        await User.create({
          email: adminEmail,
          password_hash: password, // Will be hashed by model hook
          role: 'admin',
          status: 'active'
        }, { transaction });
        
        console.log(`Admin user created with email: ${adminEmail}`);
        if (isGenerated) {
          console.log('='.repeat(60));
          console.log('AUTO-GENERATED ADMIN PASSWORD (shown once only):');
          console.log(`  ${password}`);
          console.log('='.repeat(60));
          console.log('IMPORTANT: Save this password now! It will not be shown again.');
          console.log('Change it immediately after first login.');
        } else {
          console.log('IMPORTANT: Change the default admin password immediately!');
        }
      }
      
      await transaction.commit();
      return true;
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Failed to initialize admin user:', error);
    return false;
  }
};

module.exports = {
  initializeAdmin
};
