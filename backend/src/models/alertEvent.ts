import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One time an alert rule fired for a proxy. Rule and proxy names are copied in, so the history
 * still reads right after either is renamed or deleted (there are no foreign keys on purpose).
 */
export class AlertEvent extends Model<InferAttributes<AlertEvent>, InferCreationAttributes<AlertEvent>> {
  declare id: CreationOptional<string>;
  declare fired_at: Date;
  declare rule_id: string;
  declare rule_name: string;
  declare condition_type: string;
  declare proxy_id: string;
  declare proxy_name: string;
  /** What the rule found, in one sentence */
  declare summary: string;
}

AlertEvent.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  fired_at: { type: DataTypes.DATE, allowNull: false },
  rule_id: { type: DataTypes.STRING(64), allowNull: false },
  rule_name: { type: DataTypes.STRING(255), allowNull: false },
  condition_type: { type: DataTypes.STRING(32), allowNull: false },
  proxy_id: { type: DataTypes.STRING(64), allowNull: false },
  proxy_name: { type: DataTypes.STRING(255), allowNull: false },
  summary: { type: DataTypes.TEXT, allowNull: false },
}, {
  sequelize,
  modelName: 'AlertEvent',
  tableName: 'alert_events',
  timestamps: false,
  indexes: [{ fields: ['fired_at'], name: 'idx_alert_events_fired_at' }],
});
