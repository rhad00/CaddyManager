import { createTransport, Transporter } from 'nodemailer';
import axios from 'axios';
import { IEmailConfig, ISlackConfig, AlertSeverity, IAlertNotification } from '../types/alerts';
import { AlertInstance } from '../models/alerts';

type SeverityColors = {
  [K in AlertSeverity]: string;
};

type SeverityEmojis = {
  [K in AlertSeverity]: string;
};

export class NotificationService {
  private emailTransport: Transporter;

  constructor() {
    this.emailTransport = createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendEmailNotification(config: IEmailConfig, alert: AlertInstance): Promise<void> {
    const { recipients, subject = 'Alert Notification', template } = config;
    const severityColors: SeverityColors = {
      [AlertSeverity.INFO]: '#3498db',
      [AlertSeverity.WARNING]: '#f1c40f',
      [AlertSeverity.CRITICAL]: '#e74c3c',
    };

    const defaultTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${severityColors[alert.severity]};">${alert.severity.toUpperCase()} Alert</h2>
        <p><strong>Alert Name:</strong> ${alert.threshold.name}</p>
        <p><strong>Message:</strong> ${alert.message}</p>
        <p><strong>Timestamp:</strong> ${alert.timestamp.toLocaleString()}</p>
        <p><strong>Details:</strong></p>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">
          ${JSON.stringify(alert.details, null, 2)}
        </pre>
      </div>
    `;

    try {
      await this.emailTransport.sendMail({
        from: process.env.SMTP_FROM,
        to: recipients.join(', '),
        subject,
        html: template || defaultTemplate,
      });
    } catch (error) {
      throw new Error(`Failed to send email notification: ${(error as Error).message}`);
    }
  }

  async sendSlackNotification(config: ISlackConfig, alert: AlertInstance): Promise<void> {
    const { webhook, channel, username = 'Alert Bot' } = config;

    const severityEmojis: SeverityEmojis = {
      [AlertSeverity.INFO]: ':information_source:',
      [AlertSeverity.WARNING]: ':warning:',
      [AlertSeverity.CRITICAL]: ':rotating_light:',
    };

    const message = {
      username,
      channel,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${severityEmojis[alert.severity]} ${alert.severity.toUpperCase()} Alert`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Alert Name:*\n${alert.threshold.name}`,
            },
            {
              type: 'mrkdwn',
              text: `*Timestamp:*\n${alert.timestamp.toLocaleString()}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Message:*\n${alert.message}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Details:*\n\`\`\`${JSON.stringify(alert.details, null, 2)}\`\`\``,
          },
        },
      ],
    };

    try {
      await axios.post(webhook, message);
    } catch (error) {
      throw new Error(`Failed to send Slack notification: ${(error as Error).message}`);
    }
  }

  async sendNotification(alert: AlertInstance): Promise<void> {
    const notifications = alert.threshold.notifications.filter(
      (n: IAlertNotification) => n.enabled,
    );

    await Promise.all(
      notifications.map(async (notification: IAlertNotification) => {
        try {
          if (notification.type === 'email') {
            await this.sendEmailNotification(notification.config as IEmailConfig, alert);
          } else if (notification.type === 'slack') {
            await this.sendSlackNotification(notification.config as ISlackConfig, alert);
          }
        } catch (error) {
          console.error(`Failed to send ${notification.type} notification:`, error);
        }
      }),
    );
  }
}
