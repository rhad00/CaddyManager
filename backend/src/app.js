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
const certificateRoutes = require('./api/certificates/routes');
const metricsRoutes = require('./api/metrics/routes');
const auditRoutes = require('./api/audit/routes');
const featuresRoutes = require('./api/features/routes');
const discoveryRoutes = require('./api/discovery/routes');
const gitRoutes = require('./api/git/routes');
const logsRoutes = require('./api/logs/routes');
const alertsRoutes = require('./api/alerts/routes');
const keysRoutes = require('./api/keys/routes');
const { setupSwagger } = require('./config/swagger');

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

const SENSITIVE_QUERY_PARAMS = ['token', 'password', 'secret', 'api_key', 'key', 'code', 'reset_token'];

const sanitizeRequestUrl = (url) => {
  if (!url || !url.includes('?')) {
    return url;
  }

  const [pathname, query] = url.split('?', 2);
  const params = new URLSearchParams(query);
  SENSITIVE_QUERY_PARAMS.forEach((paramName) => {
    if (params.has(paramName)) {
      params.set(paramName, '[REDACTED]');
    }
  });

  return `${pathname}?${params.toString()}`;
};

morgan.token('safe-url', (req) => sanitizeRequestUrl(req.originalUrl || req.url));
app.use(morgan(':method :safe-url :status :response-time ms - :res[content-length]')); // Request logging

// Rate limiting
const { apiLimiter, csrfTokenLimiter } = require('./middleware/rateLimiter');
app.use('/api', apiLimiter); // Apply to all API routes (covers /api and /api/v1)

// CSRF Protection (double-submit cookie pattern)
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');

app.use(cookieParser());

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.CSRF_SECRET) {
  console.error('FATAL: CSRF_SECRET environment variable is required in production');
  process.exit(1);
}

const csrfSecret = process.env.CSRF_SECRET || 'dev-csrf-secret';

const csrfCookieName = isProduction ? '__Host-x-csrf-token' : 'x-csrf-token';
const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => csrfSecret,
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

// Mount Swagger UI (must be before CSRF middleware, no auth required)
setupSwagger(app);

// Apply CSRF protection to all API routes that mutate state
app.use('/api', doubleCsrfProtection);

// Endpoint to get CSRF token (dedicated rate limiter on top of the global apiLimiter)
const csrfTokenHandler = (req, res) => {
  const csrfToken = generateCsrfToken(req, res);
  res.json({ csrfToken });
};
app.get('/api/csrf-token', csrfTokenLimiter, csrfTokenHandler);
app.get('/api/v1/csrf-token', csrfTokenLimiter, csrfTokenHandler);

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
apiRouter.use('/certificates', certificateRoutes);
apiRouter.use('/metrics', metricsRoutes);
apiRouter.use('/audit', auditRoutes);
apiRouter.use('/features', featuresRoutes);
apiRouter.use('/discovery', discoveryRoutes);
apiRouter.use('/git', gitRoutes);
apiRouter.use('/logs', logsRoutes);
apiRouter.use('/alerts', alertsRoutes);
apiRouter.use('/keys', keysRoutes);

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
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    // Handle SIGTERM (Docker/Kubernetes stop) and SIGINT (Ctrl-C).
    // This lets in-flight requests finish and closes the DB pool cleanly,
    // preventing config corruption on forced process termination.
    const gracefulShutdown = (signal) => {
      console.log(`[Shutdown] ${signal} received — draining connections…`);

      // Stop accepting new requests; wait for existing ones to finish.
      server.close(async () => {
        console.log('[Shutdown] HTTP server closed');
        try {
          const { sequelize: db } = require('./config/database');
          await db.close();
          console.log('[Shutdown] Database connection closed');
        } catch (err) {
          console.error('[Shutdown] Error closing database:', err.message);
        }
        console.log('[Shutdown] Exiting cleanly');
        process.exit(0);
      });

      // Force-exit if shutdown takes longer than 15 s (e.g. a hung request).
      setTimeout(() => {
        console.error('[Shutdown] Graceful shutdown timed out — forcing exit');
        process.exit(1);
      }, 15000).unref();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
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
