const { sequelize, User } = require('../models');
require('dotenv').config();

/**
 * Initialize the admin user if it doesn't exist
 * This is called during application startup
 */
const initializeAdmin = async () => {
  try {
    // Check if admin user exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@caddymanager.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';
    
    // Use transaction to ensure data consistency
    const transaction = await sequelize.transaction();
    
    try {
      // Check if any users exist
      const userCount = await User.count({ transaction });
      
      // If no users exist, create admin user
      if (userCount === 0) {
        console.log('No users found. Creating default admin user...');
        
        await User.create({
          email: adminEmail,
          password_hash: adminPassword, // Will be hashed by model hook
          role: 'admin',
          status: 'active'
        }, { transaction });
        
        console.log(`Default admin user created with email: ${adminEmail}`);
        console.log('IMPORTANT: Please change the default password immediately!');
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
