import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<number>;
  declare user_id: CreationOptional<string | null>;
  declare action: string;
  declare resource: CreationOptional<string | null>;
  declare details: CreationOptional<Record<string, unknown> | null>;
  declare ip_address: CreationOptional<string | null>;
  declare user_agent: CreationOptional<string | null>;
  /** 'success' or 'failure' */
  declare status: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
}

AuditLog.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: true, // Can be null for system events or failed logins where user is unknown
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false
    },
    resource: {
        type: DataTypes.STRING,
        allowNull: true
    },
    details: {
        type: DataTypes.JSON,
        allowNull: true
    },
    ip_address: {
        type: DataTypes.STRING,
        allowNull: true
    },
    user_agent: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING, // 'success', 'failure'
        defaultValue: 'success'
    },
    createdAt: { type: DataTypes.DATE, allowNull: false }
}, {
    sequelize,
    modelName: 'AuditLog',
    timestamps: true,
    updatedAt: false // Only need createdAt
});
