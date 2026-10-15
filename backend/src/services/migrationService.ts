import path from 'path';
import { promises as fs } from 'fs';
import { Sequelize, type QueryInterface, type Transaction } from 'sequelize';
import { sequelize } from '../config/database';

/** A file in src/migrations */
interface Migration {
  up(queryInterface: QueryInterface, sequelize: typeof Sequelize, transaction?: Transaction): Promise<unknown>;
  /** Set by a migration that changes the routes generated for existing proxies */
  rebuildsCaddyConfig?: boolean;
  down(queryInterface: QueryInterface, sequelize: typeof Sequelize): Promise<unknown>;
}

export interface MigrationRunResult {
  success: boolean;
  migrationsRun: number;
  migrations?: string[];
  /** A migration changed how routes are generated: the saved Caddy config is stale */
  rebuildCaddyConfig?: boolean;
}

export interface MigrationRollbackResult {
  success: boolean;
  rolledBack: string | null;
}

/**
 * Service for running database migrations
 */
export class MigrationService {
  migrationsPath: string;

  constructor() {
    this.migrationsPath = path.join(__dirname, '../migrations');
  }

  /**
   * Create SequelizeMeta table if it doesn't exist
   * This table tracks which migrations have been run
   */
  async ensureMetaTable(): Promise<unknown> {
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
  async getExecutedMigrations(): Promise<string[]> {
    try {
      const [results] = await sequelize.query(
        'SELECT name FROM "SequelizeMeta" ORDER BY name ASC'
      );
      return (results as Array<{ name: string }>).map(r => r.name);
    } catch {
      // Table might not exist yet
      return [];
    }
  }

  /**
   * Get list of all migration files
   */
  async getMigrationFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files
        .filter(f => f.endsWith('.js'))
        .sort();
    } catch {
      console.log('No migrations directory found');
      return [];
    }
  }

  /**
   * Run pending migrations
   */
  async runMigrations(): Promise<MigrationRunResult> {
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

      let rebuildCaddyConfig = false;

      // Run each pending migration
      for (const migrationFile of pendingMigrations) {
        console.log(`Running migration: ${migrationFile}`);

        const migrationPath = path.join(this.migrationsPath, migrationFile);
        const migration = require(migrationPath) as Migration;

        // Start transaction
        const transaction = await sequelize.transaction();

        try {
          // Run the migration
          await migration.up(sequelize.getQueryInterface(), Sequelize, transaction);

          // Record migration as executed
          await sequelize.query(
            'INSERT INTO "SequelizeMeta" (name) VALUES (?)',
            {
              replacements: [migrationFile],
              transaction
            }
          );

          await transaction.commit();
          rebuildCaddyConfig = rebuildCaddyConfig || migration.rebuildsCaddyConfig === true;
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
        migrations: pendingMigrations,
        rebuildCaddyConfig
      };
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  }

  /**
   * Rollback the last migration
   */
  async rollbackLastMigration(): Promise<MigrationRollbackResult> {
    try {
      const executedMigrations = await this.getExecutedMigrations();

      if (executedMigrations.length === 0) {
        console.log('No migrations to rollback');
        return { success: true, rolledBack: null };
      }

      const lastMigration = executedMigrations[executedMigrations.length - 1];
      console.log(`Rolling back migration: ${lastMigration}`);

      const migrationPath = path.join(this.migrationsPath, lastMigration);
      const migration = require(migrationPath) as Migration;

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

export const migrationService = new MigrationService();
