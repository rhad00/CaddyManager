module.exports = {
  async up(queryInterface, Sequelize) {
    const { v4: uuidv4 } = require('uuid');
    const argon2 = require('argon2');
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    // Use the same argon2 options as the User model
    const hashedPassword = await argon2.hash(adminPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });
    const now = new Date().toISOString();

    try {
      // First, check if user already exists
      const existingUser = await queryInterface.sequelize.query(
        'SELECT id FROM users WHERE email = ?',
        {
          replacements: [process.env.ADMIN_EMAIL || 'admin@caddymanager.local'],
          type: queryInterface.sequelize.QueryTypes.SELECT
        }
      );

      if (existingUser.length > 0) {
        console.log('Admin user already exists, skipping creation');
        return;
      }

      // Insert with explicit table structure matching
      await queryInterface.sequelize.query(`
        INSERT INTO users 
        (id, email, password, role, isActive, failedLoginAttempts, createdAt, updatedAt) 
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `, {
        replacements: [
          uuidv4(),
          process.env.ADMIN_EMAIL || 'admin@caddymanager.local',
          hashedPassword,
          'admin',
          1,
          0
        ],
        type: queryInterface.sequelize.QueryTypes.INSERT
      });

      console.log('Admin user created successfully');
    } catch (error) {
      console.error('Failed to create admin user:', error);
      if (error.name === 'SequelizeValidationError') {
        console.error('Validation errors:', error.errors);
      }
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', {
      email: process.env.ADMIN_EMAIL || 'admin@caddymanager.local',
    });
  }
};
