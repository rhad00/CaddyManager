import { QueryInterface } from 'sequelize';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

export async function up(queryInterface: QueryInterface) {
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
}

export async function down(queryInterface: QueryInterface) {
  await queryInterface.bulkDelete('users', {
    email: process.env.ADMIN_EMAIL || 'admin@caddymanager.local',
  });
}
