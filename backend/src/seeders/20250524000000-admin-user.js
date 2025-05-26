const argon2 = require('argon2');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!'; // Should be changed in production
    const hashedPassword = await argon2.hash(adminPassword);

    await queryInterface.bulkInsert('users', [
      {
        id: uuidv4(),
        email: process.env.ADMIN_EMAIL || 'admin@caddymanager.local',
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        failedLoginAttempts: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', {
      email: process.env.ADMIN_EMAIL || 'admin@caddymanager.local',
    });
  }
};
