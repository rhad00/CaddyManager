const { sequelize } = require('./config/database');
const { initializeAdmin } = require('./services/setupService');
const templateService = require('./services/templateService');
const backupService = require('./services/backupService');
const metricsService = require('./services/metricsService');
const migrationService = require('./services/migrationService');
const { app, startServer } = require('./app');

// Update app.js to include the routes
// Routes are now registered in app.js

// Initialize database, admin user, and default templates
const initialize = async () => {
  try {
    // Sync database models - only create tables if they don't exist
    // Use migrations for schema changes instead of alter: true
    await sequelize.sync();
    console.log('Database synchronized');

    // Run any pending migrations
    await migrationService.runMigrations();

    // Initialize admin user
    const adminInitialized = await initializeAdmin();
    if (adminInitialized) {
      console.log('Admin user initialized successfully');
    }

    // Initialize default templates
    const templatesInitialized = await templateService.initializeDefaultTemplates();
    if (templatesInitialized) {
      console.log('Default templates initialized successfully');
    }

    // Schedule automatic backups (every 24 hours)
    backupService.scheduleAutoBackups(24);

    // Initialize metrics snapshots (every hour)
    metricsService.scheduleMetricsSnapshots(60);

    // Synchronize proxy route indices
    const caddyService = require('./services/caddyService');
    await caddyService.initializeConfig();

    // Start the server
    startServer();
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
};

// Run initialization
initialize();
