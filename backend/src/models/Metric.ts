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
import { Proxy } from './Proxy';

export enum MetricType {
  REQUEST_TIME = 'request_time',
  ERROR_RATE = 'error_rate',
  BANDWIDTH_IN = 'bandwidth_in',
  BANDWIDTH_OUT = 'bandwidth_out',
  CPU_USAGE = 'cpu_usage',
  MEMORY_USAGE = 'memory_usage',
  CONNECTION_COUNT = 'connection_count',
}

@Table({
  tableName: 'metrics',
  timestamps: true,
  indexes: [
    {
      fields: ['proxyId', 'timestamp', 'metricType'],
    },
  ],
})
export class Metric extends Model {
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
    type: DataType.DATE,
    allowNull: false,
  })
  timestamp!: Date;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    validate: {
      isIn: [Object.values(MetricType)],
    },
  })
  metricType!: MetricType;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
  })
  value!: number;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  tags?: Record<string, string>;

  @BelongsTo(() => Proxy)
  proxy!: Proxy;

  @CreatedAt
  @Column
  declare createdAt: Date;

  @UpdatedAt
  @Column
  declare updatedAt: Date;
}
