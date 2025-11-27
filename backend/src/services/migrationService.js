const { Sequelize } = require('sequelize');
const { sequelize } = require('../config/database');
const path = require('path');
const fs = require('fs').promises;

/**
 * Service for running database migrations
 */
class MigrationService {
  constructor() {
    this.migrationsPath = path.join(__dirname, '../migrations');
  }

  /**
   * Create SequelizeMeta table if it doesn't exist
   * This table tracks which migrations have been run
   */
  async ensureMetaTable() {
    const [results] = await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
        "name" VARCHAR(255) NOT NULL PRIMARY KEY
      );
    `);
    return results;
  }

  /**
   * Get list of migrations that have already been run
   */
  async getExecutedMigrations() {
    try {
      const [results] = await sequelize.query(
        'SELECT name FROM "SequelizeMeta" ORDER BY name ASC'
      );
      return results.map(r => r.name);
    } catch (error) {
      // Table might not exist yet
      return [];
    }
  }

  /**
   * Get list of all migration files
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files
        .filter(f => f.endsWith('.js'))
        .sort();
    } catch (error) {
      console.log('No migrations directory found');
      return [];
    }
  }

  /**
   * Run pending migrations
   */
  async runMigrations() {
    try {
      console.log('Checking for pending migrations...');

      // Ensure meta table exists
      await this.ensureMetaTable();

      // Get executed and available migrations
      const executedMigrations = await this.getExecutedMigrations();
      const migrationFiles = await this.getMigrationFiles();

      // Find pending migrations
      const pendingMigrations = migrationFiles.filter(
        file => !executedMigrations.includes(file)
      );

      if (pendingMigrations.length === 0) {
        console.log('No pending migrations');
        return { success: true, migrationsRun: 0 };
      }

      console.log(`Found ${pendingMigrations.length} pending migration(s)`);

      // Run each pending migration
      for (const migrationFile of pendingMigrations) {
        console.log(`Running migration: ${migrationFile}`);
        
        const migrationPath = path.join(this.migrationsPath, migrationFile);
        const migration = require(migrationPath);

        // Start transaction
        const transaction = await sequelize.transaction();

        try {
          // Run the migration
          await migration.up(sequelize.getQueryInterface(), Sequelize);

          // Record migration as executed
          await sequelize.query(
            'INSERT INTO "SequelizeMeta" (name) VALUES (?)',
            {
              replacements: [migrationFile],
              transaction
            }
          );

          await transaction.commit();
          console.log(`Migration ${migrationFile} completed successfully`);
        } catch (error) {
          await transaction.rollback();
          console.error(`Migration ${migrationFile} failed:`, error);
          throw error;
        }
      }

      return { 
        success: true, 
        migrationsRun: pendingMigrations.length,
        migrations: pendingMigrations
      };
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  }

  /**
   * Rollback the last migration
   */
  async rollbackLastMigration() {
    try {
      const executedMigrations = await this.getExecutedMigrations();
      
      if (executedMigrations.length === 0) {
        console.log('No migrations to rollback');
        return { success: true, rolledBack: null };
      }

      const lastMigration = executedMigrations[executedMigrations.length - 1];
      console.log(`Rolling back migration: ${lastMigration}`);

      const migrationPath = path.join(this.migrationsPath, lastMigration);
      const migration = require(migrationPath);

      const transaction = await sequelize.transaction();

      try {
        // Run the down migration
        await migration.down(sequelize.getQueryInterface(), Sequelize);

        // Remove from meta table
        await sequelize.query(
          'DELETE FROM "SequelizeMeta" WHERE name = ?',
          {
            replacements: [lastMigration],
            transaction
          }
        );

        await transaction.commit();
        console.log(`Migration ${lastMigration} rolled back successfully`);

        return { success: true, rolledBack: lastMigration };
      } catch (error) {
        await transaction.rollback();
        console.error(`Rollback of ${lastMigration} failed:`, error);
        throw error;
      }
    } catch (error) {
      console.error('Rollback error:', error);
      throw error;
    }
  }
}

module.exports = new MigrationService();
