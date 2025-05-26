import { Router, RequestHandler, NextFunction, Request, Response } from 'express';
import { WebSocket } from 'ws';
import MonitoringService from '../../services/monitoringService';
import { AlertThreshold } from '../../models/alerts/AlertThreshold';
import { AlertInstance } from '../../models/alerts/AlertInstance';
import { authenticate } from '../../middleware/authMiddleware';
import { IMonitoringOptions } from '../../types/monitoring';

// Helper function to wrap authentication middleware
const auth = (req: Request, res: Response, next: NextFunction): void => {
  void Promise.resolve(authenticate(req, res, next)).catch(next);
};

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
monitoringRouter.get('/options', auth, getOptions);

// Get all active alerts
const getAlertsHandler: RequestHandler = (_req, res, next) => {
  AlertInstance.findAll({
    where: { resolved: false },
    include: [AlertThreshold],
    order: [['createdAt', 'DESC']],
  })
    .then(alerts => {
      res.json({
        success: true,
        data: alerts,
      });
    })
    .catch(error => {
      next(error);
    });
};

const getThresholdsHandler: RequestHandler = (_req, res, next) => {
  AlertThreshold.findAll({
    order: [['createdAt', 'DESC']],
  })
    .then(thresholds => {
      res.json({
        success: true,
        data: thresholds,
      });
    })
    .catch(error => {
      next(error);
    });
};

monitoringRouter.get('/alerts', auth, getAlertsHandler);
monitoringRouter.get('/alerts/thresholds', auth, getThresholdsHandler);

monitoringRouter.put('/options', auth, updateOptions);

// WebSocket connection handler
export function handleWebSocketConnection(ws: WebSocket): void {
  monitoringService.addWebSocketClient(ws);
}

export default monitoringRouter;
