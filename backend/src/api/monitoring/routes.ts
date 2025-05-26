import { Router, RequestHandler } from 'express';
import { WebSocket } from 'ws';
import MonitoringService from '../../services/monitoringService';
import { authenticate } from '../../middleware/authMiddleware';
import { IMonitoringOptions } from '../../types/monitoring';

const monitoringRouter = Router();
const monitoringService = MonitoringService.getInstance();

// Start monitoring when the routes are initialized
void monitoringService.startMonitoring().catch(error => {
  console.error('Failed to start monitoring service:', error);
});

// Get monitoring options
const getOptions: RequestHandler = (_req, res) => {
  try {
    const options = monitoringService.getOptions();
    res.json({
      success: true,
      data: options,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

// Update monitoring options
const updateOptions: RequestHandler = (req, res) => {
  try {
    const options = req.body as Partial<IMonitoringOptions>;
    monitoringService.updateOptions(options);
    const updatedOptions = monitoringService.getOptions();
    res.json({
      success: true,
      data: updatedOptions,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid options',
    });
  }
};

// Register routes
monitoringRouter.get(
  '/options',
  (req, res, next) => {
    Promise.resolve(authenticate(req, res, next)).catch(next);
  },
  getOptions,
);

monitoringRouter.put(
  '/options',
  (req, res, next) => {
    Promise.resolve(authenticate(req, res, next)).catch(next);
  },
  updateOptions,
);

// WebSocket connection handler
export function handleWebSocketConnection(ws: WebSocket): void {
  monitoringService.addWebSocketClient(ws);
}

export default monitoringRouter;
