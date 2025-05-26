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

export enum HealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  DEGRADED = 'degraded',
  UNKNOWN = 'unknown',
}

@Table({
  tableName: 'health_checks',
  timestamps: true,
  indexes: [
    {
      fields: ['proxyId', 'lastCheck'],
    },
  ],
})
export class HealthCheck extends Model {
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
    validate: {
      isIn: [Object.values(HealthStatus)],
    },
  })
  status!: HealthStatus;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  lastCheck!: Date;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  responseTime?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  errorMessage?: string;

  @BelongsTo(() => Proxy)
  proxy!: Proxy;

  @CreatedAt
  @Column
  declare createdAt: Date;

  @UpdatedAt
  @Column
  declare updatedAt: Date;

  // Helper method to determine if the service is considered healthy
  isHealthy(): boolean {
    return this.status === HealthStatus.HEALTHY;
  }

  // Helper method to determine if the service needs attention
  needsAttention(): boolean {
    return this.status === HealthStatus.UNHEALTHY || this.status === HealthStatus.DEGRADED;
  }
}
