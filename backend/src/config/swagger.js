const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'CaddyManager API',
      version: '1.0.0',
      description:
        'REST API for CaddyManager — a web interface for managing Caddy Server reverse proxies. ' +
        'Authentication via Bearer JWT or X-API-Key header.',
      license: { name: 'MIT' },
      contact: { name: 'CaddyManager', url: 'https://github.com/rhad00/caddymanager' },
    },
    servers: [
      { url: '/api', description: 'Current server' },
      { url: 'http://localhost:3000/api', description: 'Local development' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from POST /api/auth/login',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key from My Account → API Keys',
        },
      },
      schemas: {
        Proxy: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            domains: { type: 'array', items: { type: 'string' } },
            upstream_url: { type: 'string' },
            ssl_type: { type: 'string', enum: ['acme', 'cloudflare', 'custom', 'none'] },
            enabled: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication and session management' },
      { name: '2FA', description: 'Two-factor authentication setup' },
      { name: 'Proxies', description: 'Reverse proxy configuration' },
      { name: 'Templates', description: 'Proxy configuration templates' },
      { name: 'Backups', description: 'Configuration backups' },
      { name: 'Certificates', description: 'TLS certificate management' },
      { name: 'Users', description: 'User management (admin only)' },
      { name: 'API Keys', description: 'Programmatic access keys' },
      { name: 'Alerts', description: 'Alert rules and notification channels' },
      { name: 'Logs', description: 'Access log viewer' },
      { name: 'Metrics', description: 'System metrics' },
      { name: 'Audit', description: 'Audit log' },
      { name: 'Git', description: 'Git integration and GitOps' },
      { name: 'Discovery', description: 'Docker auto-discovery' },
    ],
  },
  apis: [
    path.join(__dirname, '../api/**/*.js'),
  ],
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * Mount Swagger UI at /api/docs
 */
function setupSwagger(app) {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'CaddyManager API Docs',
      swaggerOptions: { persistAuthorization: true },
    })
  );

  // Raw OpenAPI JSON spec
  app.get('/api/docs/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

module.exports = { setupSwagger, swaggerSpec };
