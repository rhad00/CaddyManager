import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type HeaderType = 'request' | 'response';

export class Header extends Model<InferAttributes<Header>, InferCreationAttributes<Header>> {
  declare id: CreationOptional<string>;
  declare proxy_id: string;
  declare header_type: HeaderType;
  declare header_name: string;
  declare header_value: string;
  declare enabled: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Header.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  proxy_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Proxies',
      key: 'id'
    }
  },
  header_type: {
    type: DataTypes.ENUM('request', 'response'),
    allowNull: false
  },
  header_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  header_value: {
    type: DataTypes.STRING,
    allowNull: false
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE
}, {
  sequelize,
  modelName: 'Header',
  timestamps: true // Adds createdAt and updatedAt
});
