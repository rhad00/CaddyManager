import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type AlertConditionType = 'cert_expiry' | 'upstream_down' | 'error_rate' | 'no_traffic';

/**
 * AlertRule — defines a condition and which channels to notify.
 *
 * condition_type values:
 *   cert_expiry        — proxy TLS cert will expire within `threshold` days
 *   upstream_down      — upstream health check failed for proxy
 *   error_rate         — percentage of 5xx responses exceeds `threshold`% (requires log access)
 *   no_traffic         — no requests to a proxy within `threshold` minutes
 */
export class AlertRule extends Model<InferAttributes<AlertRule>, InferCreationAttributes<AlertRule>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare condition_type: AlertConditionType;
  declare threshold: CreationOptional<number | null>;
  declare proxy_id: CreationOptional<string | null>;
  declare channel_ids: CreationOptional<string[]>;
  declare cooldown_minutes: CreationOptional<number>;
  declare enabled: CreationOptional<boolean>;
  declare last_triggered_at: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AlertRule.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  condition_type: {
    type: DataTypes.ENUM('cert_expiry', 'upstream_down', 'error_rate', 'no_traffic'),
    allowNull: false,
  },
  // Numeric threshold:
  //   cert_expiry  → days before expiry (e.g. 14)
  //   error_rate   → percentage (e.g. 10)
  //   no_traffic   → minutes (e.g. 60)
  //   upstream_down → ignored (boolean condition)
  threshold: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null,
  },
  // Optional: restrict to a specific proxy ID. Null = all proxies.
  proxy_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  // Array of NotificationChannel IDs to notify
  channel_ids: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  // Minimum minutes between repeat notifications for the same alert
  cooldown_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60,
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  // Last time this rule fired (for cooldown tracking)
  last_triggered_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
}, { sequelize, modelName: 'AlertRule', timestamps: true });
