import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ConfigLock Model
 * A named lock shared by every process on the database (see utils/dbLock): in cluster mode it
 * serializes the Caddy config writes that the in-process mutex cannot.
 */
export class ConfigLock extends Model<InferAttributes<ConfigLock>, InferCreationAttributes<ConfigLock>> {
  declare name: string;
  /** Random id of the holder, so only the holder can release */
  declare owner: string;
  /** A holder that died stops blocking others once this has passed */
  declare expires_at: Date;
}

ConfigLock.init({
  name: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  owner: {
    type: DataTypes.STRING,
    allowNull: false
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'ConfigLock',
  timestamps: false
});
