import { Op } from 'sequelize';
import { SSLCertificate } from '../models/SSLCertificate';
import { AlertThreshold, AlertInstance } from '../models/alerts';
import { IAlertCondition, AlertType } from '../types/alerts';
import { NotificationService } from './NotificationService';

interface IMetricData {
  proxyId: string;
  metricType: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

interface ISSLCertData {
  domain: string;
  validTo: string;
  issuer?: string;
}

export class AlertService {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  private evaluateCondition(value: number, condition: IAlertCondition): boolean {
    const { operator, value: threshold } = condition;

    switch (operator) {
      case '>':
        return value > threshold;
      case '<':
        return value < threshold;
      case '==':
        return value === threshold;
      case '>=':
        return value >= threshold;
      case '<=':
        return value <= threshold;
      default:
        return false;
    }
  }

  async checkMetricAlerts(metric: IMetricData): Promise<void> {
    // Find all active alert thresholds for this metric
    const thresholds = await AlertThreshold.findAll({
      where: {
        proxyId: metric.proxyId,
        type: AlertType.METRIC_THRESHOLD,
        enabled: true,
        conditions: {
          metric: metric.metricType,
        },
      },
    });

    for (const threshold of thresholds) {
      const condition = threshold.conditions;
      const isTriggered = this.evaluateCondition(metric.value, condition);

      if (!isTriggered) {
        continue;
      }

      // Check frequency if specified
      if (condition.frequency) {
        const lastAlert = await AlertInstance.findOne({
          where: {
            thresholdId: threshold.id,
            createdAt: {
              [Op.gt]: new Date(Date.now() - condition.frequency * 1000),
            },
          },
          order: [['createdAt', 'DESC']],
        });

        if (lastAlert) {
          continue;
        }
      }

      // Create alert instance
      const alert = await AlertInstance.create({
        thresholdId: threshold.id,
        proxyId: metric.proxyId,
        type: threshold.type,
        severity: threshold.severity,
        message: `${metric.metricType} value ${metric.value} ${condition.operator} ${condition.value}`,
        details: {
          metric: metric.metricType,
          value: metric.value,
          threshold: condition.value,
          tags: metric.tags,
        },
        timestamp: new Date(),
      });

      // Send notifications
      try {
        await this.notificationService.sendNotification(alert);
      } catch (error) {
        console.error('Failed to send notifications:', error);
      }
    }
  }

  async checkSSLAlerts(): Promise<void> {
    // Find all active SSL alert thresholds
    const thresholds = await AlertThreshold.findAll({
      where: {
        type: AlertType.SSL_EXPIRY,
        enabled: true,
      },
    });

    for (const threshold of thresholds) {
      const condition = threshold.conditions;
      const daysUntilExpiry = condition.value;

      const proxyCertificates = await SSLCertificate.findAll({
        where: {
          proxyId: threshold.proxyId,
        },
      });

      for (const cert of proxyCertificates) {
        const certData = cert.get() as ISSLCertData;
        const expiryDate = new Date(certData.validTo);
        const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        if (daysLeft > daysUntilExpiry) {
          continue;
        }

        // Check frequency if specified
        if (condition.frequency) {
          const lastAlert = await AlertInstance.findOne({
            where: {
              thresholdId: threshold.id,
              proxyId: threshold.proxyId,
              type: AlertType.SSL_EXPIRY,
              'details.domain': certData.domain,
              createdAt: {
                [Op.gt]: new Date(Date.now() - condition.frequency * 1000),
              },
            },
            order: [['createdAt', 'DESC']],
          });

          if (lastAlert) {
            continue;
          }
        }

        // Create alert instance
        const alert = await AlertInstance.create({
          thresholdId: threshold.id,
          proxyId: threshold.proxyId,
          type: threshold.type,
          severity: threshold.severity,
          message: `SSL Certificate for ${certData.domain} will expire in ${daysLeft} days`,
          details: {
            domain: certData.domain,
            expiryDate: certData.validTo,
            daysLeft,
            issuer: certData.issuer,
          },
          timestamp: new Date(),
        });

        // Send notifications
        try {
          await this.notificationService.sendNotification(alert);
        } catch (error) {
          console.error('Failed to send notifications:', error);
        }
      }
    }
  }
}
