const { sequelize } = require('./config/database');
const { initializeAdmin } = require('./services/setupService');
const { templateService } = require('./services/templateService');
const backupService = require('./services/backupService');
const { metricsService } = require('./services/metricsService');
const { migrationService } = require('./services/migrationService');
const { isLeader } = require('./utils/clusterRole');
const { app, startServer } = require('./app');

// Update app.js to include the routes
// Routes are now registered in app.js

/**
 * One-time and background work. Runs in a single process, or in the leader worker in
 * cluster mode: other workers would repeat the migrations and run every scheduler,
 * Docker watcher and Git auto-sync again (MODERNIZATION.md 0.25).
 */
const runLeaderTasks = async () => {
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

  // Keep the certificate list and expiry dates current
  require('./services/certificateService').scheduleCertificateSync(6);

  // TODO: Initialize Kubernetes discovery service if enabled
  // if (process.env.ENABLE_K8S_DISCOVERY === 'true') {
  //   const k8sDiscoveryService = require('./services/kubernetesDiscoveryService');
  //   await k8sDiscoveryService.initialize();
  //   await k8sDiscoveryService.startWatching();
  // }
};

// Initialize the environment, the leader's background work, and the server
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

    if (isLeader()) {
      await runLeaderTasks();
    } else {
      console.log(`Worker ${process.pid} serves requests only; the leader runs migrations and background jobs`);
    }

    // Start the server
    await startServer();

    // Tell the cluster primary that the database is ready for the other workers
    if (process.send) {
      process.send({ type: 'ready' });
    }
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
};

// Run initialization
initialize();
