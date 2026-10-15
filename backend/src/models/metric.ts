import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Metric Model
 * Stores historical metrics snapshots in the database
 */
export class Metric extends Model<InferAttributes<Metric>, InferCreationAttributes<Metric>> {
  declare id: CreationOptional<number>;
  /** Timestamp when the metrics snapshot was taken */
  declare timestamp: CreationOptional<Date>;
  /** JSON object containing the metrics snapshot data */
  declare metrics_data: Record<string, unknown>;
  /** Optional summary of key metrics for quick access */
  declare summary: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Metric.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Timestamp when the metrics snapshot was taken'
  },
  metrics_data: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'JSON object containing the metrics snapshot data'
  },
  summary: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Optional summary of key metrics for quick access'
  },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
}, {
  sequelize,
  modelName: 'Metric',
  tableName: 'metrics',
  timestamps: true,
  indexes: [
    {
      fields: ['timestamp'],
      name: 'idx_metrics_timestamp'
    },
    {
      fields: ['createdAt'],
      name: 'idx_metrics_created_at'
    }
  ]
});
