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
    // Validate required environment variables
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      const required = ['JWT_SECRET'];
      const missing = required.filter(v => !process.env[v]);
      if (missing.length > 0) {
        console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
      }
    }

    if (!process.env.CADDY_API_URL) {
      console.warn('WARNING: CADDY_API_URL not set, defaulting to http://caddy:2019');
    }

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

    // Initialize Docker discovery service if enabled
    if (process.env.ENABLE_DOCKER_DISCOVERY === 'true') {
      console.log('Docker discovery enabled, initializing...');
      const dockerDiscoveryService = require('./services/dockerDiscoveryService');
      const dockerInitialized = await dockerDiscoveryService.initialize();
      if (dockerInitialized) {
        await dockerDiscoveryService.startWatching();
        console.log('Docker discovery service started successfully');
      } else {
        console.warn('Docker discovery service failed to initialize');
      }
    } else {
      console.log('Docker discovery is disabled (set ENABLE_DOCKER_DISCOVERY=true to enable)');
    }

    // Initialize Git service for GitOps and version control
    console.log('Initializing Git service...');
    const gitService = require('./services/gitService');
    await gitService.initialize();
    console.log('Git service initialized successfully');

    // Start alert scheduler
    const { startAlertScheduler } = require('./services/alertService');
    startAlertScheduler(15); // check every 15 minutes

    // TODO: Initialize Kubernetes discovery service if enabled
    // if (process.env.ENABLE_K8S_DISCOVERY === 'true') {
    //   const k8sDiscoveryService = require('./services/kubernetesDiscoveryService');
    //   await k8sDiscoveryService.initialize();
    //   await k8sDiscoveryService.startWatching();
    // }

    // Start the server
    startServer();
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
};

// Run initialization
initialize();
