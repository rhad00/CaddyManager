import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

/** The scope of the row that sums every host */
export const TOTAL_SCOPE = 'total';

/**
 * Traffic of one hour for one scope (a proxy id, "other" or "total"), kept after the access log
 * has rotated away. A row is written once the hour is over and never changes; an hour without
 * traffic has no row. Visitors are not kept: distinct counts cannot be added across hours.
 */
export class TrafficRollup extends Model<InferAttributes<TrafficRollup>, InferCreationAttributes<TrafficRollup>> {
  declare id: CreationOptional<number>;
  /** Start of the hour, unix seconds */
  declare hour_ts: number;
  declare scope_id: string;
  declare requests: number;
  declare status_2xx: number;
  declare status_3xx: number;
  declare status_4xx: number;
  declare status_5xx: number;
  declare bytes: number;
  declare bytes_in: number;
  declare duration_sum_ms: number;
  declare duration_count: number;
}

TrafficRollup.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  hour_ts: { type: DataTypes.INTEGER, allowNull: false },
  scope_id: { type: DataTypes.STRING(64), allowNull: false },
  requests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status_2xx: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status_3xx: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status_4xx: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status_5xx: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  bytes: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  bytes_in: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  duration_sum_ms: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  duration_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  sequelize,
  modelName: 'TrafficRollup',
  tableName: 'traffic_rollups',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['hour_ts', 'scope_id'], name: 'uq_traffic_rollups_hour_scope' },
    { fields: ['scope_id', 'hour_ts'], name: 'idx_traffic_rollups_scope_hour' },
  ],
});
