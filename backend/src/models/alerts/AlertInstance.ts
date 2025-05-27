import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  BelongsTo,
  ForeignKey,
} from 'sequelize-typescript';
import { AlertType, AlertSeverity, IAlertInstance } from '../../types/alerts';
import { Proxy } from '../Proxy';
import { User } from '../User';
import { AlertThreshold } from './AlertThreshold';

@Table({
  tableName: 'alert_instances',
  timestamps: true,
  indexes: [
    {
      fields: ['proxyId', 'timestamp'],
    },
    {
      fields: ['thresholdId'],
    },
    {
      fields: ['acknowledgedAt'],
    },
  ],
})
export class AlertInstance extends Model implements IAlertInstance {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => AlertThreshold)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  thresholdId!: string;

  @ForeignKey(() => Proxy)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  proxyId!: string;

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
    type: DataType.TEXT,
    allowNull: false,
  })
  message!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  details!: Record<string, unknown>;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  timestamp!: Date;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  resolved!: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  acknowledgedAt?: Date;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  acknowledgedBy?: string;

  @BelongsTo(() => AlertThreshold)
  threshold!: AlertThreshold;

  @BelongsTo(() => Proxy)
  proxy!: Proxy;

  @BelongsTo(() => User)
  acknowledgedByUser?: User;

  @CreatedAt
  @Column
  declare createdAt: Date;

  @UpdatedAt
  @Column
  declare updatedAt: Date;
}
