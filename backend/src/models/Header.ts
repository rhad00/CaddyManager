import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  BelongsTo,
  ForeignKey,
  BeforeCreate,
  BeforeUpdate,
} from 'sequelize-typescript';
import { Proxy } from './Proxy';

export type HeaderType = 'request' | 'response';

@Table({
  tableName: 'headers',
  timestamps: true,
})
export class Header extends Model {
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
    type: DataType.TEXT,
    allowNull: false,
  })
  value!: string;

  @Column({
    type: DataType.ENUM('request', 'response'),
    allowNull: false,
    defaultValue: 'request',
  })
  type!: HeaderType;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  isActive!: boolean;

  @BelongsTo(() => Proxy)
  proxy!: Proxy;

  @CreatedAt
  @Column
  declare createdAt: Date;

  @UpdatedAt
  @Column
  declare updatedAt: Date;

  @BeforeCreate
  @BeforeUpdate
  static validateHeader(instance: Header): void {
    // Validate header name
    if (!instance.name || instance.name.trim().length === 0) {
      throw new Error('Header name is required');
    }

    // Validate header name format (RFC 7230)
    const headerNameRegex = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;
    if (!headerNameRegex.test(instance.name)) {
      throw new Error('Invalid header name format');
    }

    // Validate header value (basic validation)
    if (instance.value === null || instance.value === undefined) {
      throw new Error('Header value is required');
    }

    // Normalize header name to lowercase for consistency
    instance.name = instance.name.toLowerCase();
  }
}
