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
const discoveryRoutes = require('./api/discovery/routes');
const gitRoutes = require('./api/git/routes');

// Create Express app
const app = express();

// Trust proxy - required when behind NGINX/reverse proxy
// This allows Express to trust X-Forwarded-* headers from the proxy
app.set('trust proxy', 1);

// Set up middleware
app.use(helmet()); // Security headers

// CORS - restrict to explicit origins
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://localhost:8080']);
app.use(cors({
  origin: corsOrigins.length > 0 ? corsOrigins : false,
  credentials: true
}));

app.use(express.json({ limit: '10mb' })); // Parse JSON bodies with size limit
app.use(morgan('dev')); // Request logging

// Rate limiting
const { apiLimiter } = require('./middleware/rateLimiter');
app.use('/api', apiLimiter); // Apply to all API routes (covers /api and /api/v1)

// CSRF Protection (double-submit cookie pattern)
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');

app.use(cookieParser());

const isProduction = process.env.NODE_ENV === 'production';
const csrfCookieName = isProduction ? '__Host-x-csrf-token' : 'x-csrf-token';
const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || process.env.JWT_SECRET || 'dev-csrf-secret',
  getSessionIdentifier: (req) => req.cookies?.auth_token || req.headers?.authorization || 'anonymous',
  cookieName: csrfCookieName,
  cookieOptions: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  },
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] || req.headers['csrf-token'],
});

// Apply CSRF protection to all API routes that mutate state
app.use('/api', doubleCsrfProtection);

// Endpoint to get CSRF token
const csrfTokenHandler = (req, res) => {
  const csrfToken = generateCsrfToken(req, res);
  res.json({ csrfToken });
};
app.get('/api/csrf-token', csrfTokenHandler);
app.get('/api/v1/csrf-token', csrfTokenHandler);

// Error handler for CSRF
app.use((err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN' && err.message !== 'invalid csrf token' && err.message !== 'misconfigured csrf') return next(err);
  res.status(403).json({
    error: {
      message: 'Invalid CSRF token',
      status: 403
    }
  });
});

// Basic route for health check (liveness)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness probe — verifies database connectivity
app.get('/ready', async (req, res) => {
  try {
    const dbReady = await testConnection();
    if (dbReady) {
      res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ status: 'not ready', reason: 'database unavailable' });
    }
  } catch {
    res.status(503).json({ status: 'not ready', reason: 'database check failed' });
  }
});

// API routes — mounted under both /api (legacy) and /api/v1 (versioned)
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/proxies', proxyRoutes);
apiRouter.use('/templates', templateRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/backups', backupRoutes);
apiRouter.use('/metrics', metricsRoutes);
apiRouter.use('/audit', auditRoutes);
apiRouter.use('/features', featuresRoutes);
apiRouter.use('/discovery', discoveryRoutes);
apiRouter.use('/git', gitRoutes);

app.use('/api/v1', apiRouter);
app.use('/api', apiRouter); // backward compatible

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: 'Internal Server Error',
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

    // Warn if CF_API_TOKEN is not set — helpful for deployments
    // where Caddy has the token but the backend was not given it.
    if (!process.env.CF_API_TOKEN) {
      console.warn('CF_API_TOKEN is not set in the backend environment.');
      console.warn('If you intend to use Cloudflare DNS challenges, set CF_API_TOKEN for the backend (for example in docker-compose or .env).');
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
