const { sequelize } = require('./config/database');
const { initializeAdmin } = require('./services/setupService');
const templateService = require('./services/templateService');
const backupService = require('./services/backupService');
const metricsService = require('./services/metricsService');
const { app, startServer } = require('./app');

// Update app.js to include the routes
const authRoutes = require('./api/auth/routes');
const proxyRoutes = require('./api/proxies/routes');
const userRoutes = require('./api/users/routes');
const templateRoutes = require('./api/templates/routes');
const backupRoutes = require('./api/backups/routes');
const metricsRoutes = require('./api/metrics/routes');

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/proxies', proxyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/metrics', metricsRoutes);

// Initialize database, admin user, and default templates
const initialize = async () => {
  try {
    // Sync database models
    await sequelize.sync({ alter: true });
    console.log('Database synchronized');
    
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
