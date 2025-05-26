import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  BelongsTo,
  ForeignKey,
  HasMany,
  BeforeCreate,
  BeforeUpdate,
} from 'sequelize-typescript';
import {
  AlertType,
  AlertSeverity,
  IAlertThreshold,
  IAlertCondition,
  IAlertNotification,
  IEmailConfig,
  ISlackConfig,
} from '../../types/alerts';
import { Proxy } from '../Proxy';
import { AlertInstance } from './AlertInstance';

@Table({
  tableName: 'alert_thresholds',
  timestamps: true,
  indexes: [
    {
      fields: ['proxyId'],
    },
    {
      fields: ['type'],
    },
  ],
})
export class AlertThreshold extends Model implements IAlertThreshold {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Proxy)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  proxyId!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    validate: {
      isIn: [Object.values(AlertType)],
    },
  })
  type!: AlertType;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    validate: {
      isIn: [Object.values(AlertSeverity)],
    },
  })
  severity!: AlertSeverity;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  conditions!: IAlertCondition;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  enabled!: boolean;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  notifications!: IAlertNotification[];

  @BelongsTo(() => Proxy)
  proxy!: Proxy;

  @HasMany(() => AlertInstance)
  instances!: AlertInstance[];

  @CreatedAt
  @Column
  declare createdAt: Date;

  @UpdatedAt
  @Column
  declare updatedAt: Date;

  // Validate alert conditions before save
  @BeforeCreate
  @BeforeUpdate
  static validateConditions(instance: AlertThreshold): void {
    const { conditions } = instance;

    // Validate operator
    const validOperators = ['>', '<', '==', '>=', '<='] as const;
    if (!validOperators.includes(conditions.operator)) {
      throw new Error('Invalid operator in alert conditions');
    }

    // Validate value is a number
    if (typeof conditions.value !== 'number') {
      throw new Error('Alert condition value must be a number');
    }

    // Validate duration and frequency if present
    if (conditions.duration !== undefined && typeof conditions.duration !== 'number') {
      throw new Error('Alert condition duration must be a number');
    }

    if (conditions.frequency !== undefined && typeof conditions.frequency !== 'number') {
      throw new Error('Alert condition frequency must be a number');
    }

    // Validate notifications
    instance.notifications.forEach(notification => {
      if (!['email', 'slack'].includes(notification.type)) {
        throw new Error('Invalid notification type');
      }

      if (notification.type === 'email') {
        const emailConfig = notification.config as IEmailConfig;
        if (!Array.isArray(emailConfig.recipients) || !emailConfig.recipients.length) {
          throw new Error('Email notification must have at least one recipient');
        }
      }

      if (notification.type === 'slack') {
        const slackConfig = notification.config as ISlackConfig;
        if (!slackConfig.webhook) {
          throw new Error('Slack notification must have a webhook URL');
        }
      }
    });
  }
}
