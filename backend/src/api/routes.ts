import { Express } from 'express';
import { WebSocket, Server as WebSocketServer } from 'ws';
import { createServer } from 'http';

// Import route handlers
import authRoutes from './auth/routes';
import proxyRoutes from './proxies/routes';
import headerRoutes from './headers/routes';
import monitoringRoutes, { handleWebSocketConnection } from './monitoring/routes';

import { Server } from 'http';

export const configureRoutes = (app: Express): Server => {
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // API version prefix
  const apiV1 = '/api/v1';

  // Register routes
  app.use(`${apiV1}/auth`, authRoutes);
  app.use(`${apiV1}/proxies`, proxyRoutes);
  app.use(`${apiV1}/monitoring`, monitoringRoutes);
  app.use(`${apiV1}`, headerRoutes);

  // Create HTTP server instance
  const server = createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ server });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket) => {
    handleWebSocketConnection(ws);
  });

  // Attach server to app for external access
  app.server = server;

  return server;
};
