import { Router, RequestHandler, NextFunction, Request, Response } from 'express';
import { WebSocket as WS } from 'ws';

interface IMonitoringWebSocket extends WS {
  userId?: string;
  isAlive?: boolean;
}
import MonitoringService from '../../services/monitoringService';
import { AlertThreshold } from '../../models/alerts/AlertThreshold';
import { AlertInstance } from '../../models/alerts/AlertInstance';
import { authenticate } from '../../middleware/authMiddleware';
import { IMonitoringOptions } from '../../types/monitoring';
import { IAlertInstance, IAlertThreshold } from '../../types/alerts';

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
const getAlertsHandler = (async (_req: Request, res: Response) => {
  try {
    const alerts = await AlertInstance.findAll({
      where: { resolved: false },
      include: [
        {
          model: AlertThreshold,
          attributes: ['id', 'name', 'type', 'severity', 'conditions'],
        },
      ],
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'message',
        'details',
        'timestamp',
        'acknowledgedAt',
        'acknowledgedBy',
        'createdAt',
      ],
    });

    // Transform the data to avoid circular references
    const safeAlerts = alerts.map(alert => {
      const plainAlert = alert.get({ plain: true }) as IAlertInstance;
      const threshold = alert.threshold?.get({ plain: true }) as IAlertThreshold | undefined;

      return {
        ...plainAlert,
        threshold: threshold || null,
      };
    });

    res.json({
      success: true,
      data: safeAlerts,
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch alerts';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
}) as RequestHandler;

const getThresholdsHandler = (async (_req: Request, res: Response) => {
  try {
    const thresholds = await AlertThreshold.findAll({
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      data: thresholds || [],
    });
  } catch (error) {
    console.error('Error fetching thresholds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert thresholds',
    });
  }
}) as RequestHandler;

monitoringRouter.get('/alerts', auth, getAlertsHandler);
monitoringRouter.get('/alerts/thresholds', auth, getThresholdsHandler);

monitoringRouter.put('/options', auth, updateOptions);

// WebSocket connection handler
export function handleWebSocketConnection(ws: IMonitoringWebSocket): void {
  monitoringService.addWebSocketClient(ws);
}

export default monitoringRouter;
