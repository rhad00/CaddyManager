import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';
import type { ChannelType } from '../utils/notificationChannels';

/**
 * NotificationChannel — SMTP email, Slack/Discord/generic webhook destination.
 */
export class NotificationChannel extends Model<
  InferAttributes<NotificationChannel>,
  InferCreationAttributes<NotificationChannel>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare type: ChannelType;
  /**
   * type-specific config:
   *   email:   { to, from }
   *   slack:   { webhook_url }
   *   discord: { webhook_url }
   *   webhook: { url, method, headers: {} }
   */
  declare config: CreationOptional<Record<string, unknown>>;
  declare enabled: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

NotificationChannel.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('email', 'slack', 'discord', 'webhook'),
    allowNull: false,
  },
  // type-specific config stored as JSON
  config: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'NotificationChannel', timestamps: true });
