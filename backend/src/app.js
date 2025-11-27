require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { testConnection } = require('./config/database');

// Import routes
const authRoutes = require('./api/auth/routes');
const proxyRoutes = require('./api/proxies/routes');
const templateRoutes = require('./api/templates/routes');
const userRoutes = require('./api/users/routes');
const backupRoutes = require('./api/backups/routes');
const metricsRoutes = require('./api/metrics/routes');
const auditRoutes = require('./api/audit/routes');
const featuresRoutes = require('./api/features/routes');

// Create Express app
const app = express();

// Trust proxy - required when behind NGINX/reverse proxy
// This allows Express to trust X-Forwarded-* headers from the proxy
app.set('trust proxy', 1);

// Set up middleware
app.use(helmet()); // Security headers
app.use(cors()); // CORS support
app.use(express.json()); // Parse JSON bodies
app.use(morgan('dev')); // Request logging

// Rate limiting
const { apiLimiter } = require('./middleware/rateLimiter');
app.use('/api', apiLimiter); // Apply to all API routes

// CSRF Protection
const cookieParser = require('cookie-parser');
const csurf = require('csurf');

app.use(cookieParser());

// Configure CSRF
// Note: In a real production environment with a separate frontend, 
// you might need to adjust cookie settings (secure: true, sameSite: 'strict')
const csrfProtection = csurf({ cookie: true });

// Apply CSRF protection to all API routes that mutate state
app.use('/api', csrfProtection);

// Endpoint to get CSRF token
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Error handler for CSRF
app.use((err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') return next(err);
  res.status(403).json({
    error: {
      message: 'Invalid CSRF token',
      status: 403
    }
  });
});

// Basic route for health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/proxies', proxyRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/users', userRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/features', featuresRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Failed to connect to database. Server will not start.');
      process.exit(1);
    }

    // Warn if CLOUDFLARE_API_TOKEN is not set — helpful for deployments
    // where Caddy has the token but the backend was not given it.
    if (!process.env.CLOUDFLARE_API_TOKEN) {
      console.warn('CLOUDFLARE_API_TOKEN is not set in the backend environment.');
      console.warn('If you intend to use Cloudflare DNS challenges, set CLOUDFLARE_API_TOKEN for the backend (for example in docker-compose or .env).');
    }

    // Start listening
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Export app and startServer for use by other modules and tests
module.exports = { app, startServer };

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}
