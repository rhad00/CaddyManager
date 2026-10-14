import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './user';

export type BackupType = 'auto' | 'manual';
export type BackupStatus = 'complete' | 'failed';

export class Backup extends Model<InferAttributes<Backup>, InferCreationAttributes<Backup>> {
  declare id: CreationOptional<string>;
  declare filename: string;
  declare size: number;
  declare backup_type: CreationOptional<BackupType>;
  declare status: CreationOptional<BackupStatus>;
  declare created_by: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Backup.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  filename: {
    type: DataTypes.STRING,
    allowNull: false
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  backup_type: {
    type: DataTypes.ENUM('auto', 'manual'),
    defaultValue: 'manual',
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('complete', 'failed'),
    defaultValue: 'complete',
    allowNull: false
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: User,
      key: 'id'
    }
  },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
}, {
  sequelize,
  modelName: 'Backup',
  timestamps: true // Adds createdAt and updatedAt
});

// Establish relationship with User
Backup.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
