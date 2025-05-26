import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { configureRoutes } from './api/routes';
import { initDatabase } from './config/database';
import MonitoringService from './services/monitoringService';

const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }),
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
});
app.use(limiter);

// Set up routes and WebSocket server
const server = configureRoutes(app);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  const startServer = async (): Promise<void> => {
    try {
      // Initialize database connection
      await initDatabase();

      // Start the server
      server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });

      // Graceful shutdown handling
      const shutdown = (): void => {
        console.log('Shutting down server...');

        // Stop monitoring service
        const monitoringService = MonitoringService.getInstance();
        monitoringService.stop();

        // Close server
        server.close(() => {
          console.log('Server closed');
          process.exit(0);
        });

        // Force close after 10s
        setTimeout(() => {
          console.error('Could not close connections in time, forcefully shutting down');
          process.exit(1);
        }, 10000);
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  };

  void startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default app;
