import { Express } from 'express';
import { WebSocket as WS, Server as WebSocketServer } from 'ws';
import { createServer, IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';

interface IWebSocket extends WS {
  isAlive?: boolean;
  userId?: string;
}

interface IDecodedToken {
  userId: string;
  email: string;
  role: string;
}

interface IExtendedIncomingMessage extends IncomingMessage {
  userId?: string;
}

// Import route handlers
import authRoutes from './auth/routes';
import proxyRoutes from './proxies/routes';
import headerRoutes from './headers/routes';
import monitoringRoutes, { handleWebSocketConnection } from './monitoring/routes';
import { AuthService } from '../services/authService';

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

  // Add CORS middleware for WebSocket upgrade requests
  app.use('/api/v1/monitoring/ws', (req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
      'http://193.37.138.47:5173',
      'http://localhost:5173',
      'http://localhost:5174',
    ];

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    next();
  });

  // Create WebSocket server with specific path
  const wss = new WebSocketServer({
    server,
    path: '/api/v1/monitoring/ws',
    verifyClient: (
      { req }: { req: IExtendedIncomingMessage },
      callback: (result: boolean, code?: number, name?: string) => void,
    ): void => {
      // Extract authorization from URL parameters
      const parsedUrl = parseUrl(req.url || '', true);
      const authorization = parsedUrl.query.authorization as string | undefined;

      if (!authorization?.startsWith('Bearer ')) {
        console.error('WebSocket connection denied: No Bearer token provided');
        callback(false);
        return;
      }

      try {
        const token = authorization.split(' ')[1];
        const decoded = AuthService.verifyToken(token) as IDecodedToken;
        req.userId = decoded.userId;
        console.log('WebSocket connection authenticated for user:', decoded.userId);
        callback(true);
      } catch (error) {
        console.error('WebSocket connection denied: Invalid token', error);
        callback(false, 401, 'Unauthorized');
      }
    },
  });

  // Handle WebSocket connections
  wss.on('connection', (ws: IWebSocket, req) => {
    const userId = (req as { userId?: string }).userId;
    if (!userId) {
      console.error('No user ID found in WebSocket connection');
      ws.close();
      return;
    }

    console.log('WebSocket connection established for user:', userId);
    ws.userId = userId;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle connection with monitoring service
    handleWebSocketConnection(ws);
  });

  // Heartbeat check interval
  const interval = setInterval(() => {
    wss.clients.forEach((ws: IWebSocket) => {
      if (ws.isAlive === false) {
        console.log('Terminating stale WebSocket connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  // Clean up on server close
  wss.on('close', () => {
    clearInterval(interval);
  });

  // Handle WebSocket server errors
  wss.on('error', (error: Error) => {
    console.error('WebSocket server error:', error);
  });

  // Attach server to app for external access
  app.server = server;

  return server;
};
