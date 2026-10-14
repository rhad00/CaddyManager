import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';
import type { HeaderType } from './header';
import type { MiddlewareKind } from './middleware';

/** A header rule saved in a template (copied onto a proxy when the template is applied) */
export interface TemplateHeader {
  header_type: HeaderType;
  header_name: string;
  header_value: string;
  enabled?: boolean;
}

/** A middleware saved in a template */
export interface TemplateMiddleware {
  middleware_type: MiddlewareKind;
  configuration: Record<string, unknown>;
  order?: number;
  enabled?: boolean;
}

export class Template extends Model<InferAttributes<Template>, InferCreationAttributes<Template>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare headers: CreationOptional<TemplateHeader[]>;
  declare middleware: CreationOptional<TemplateMiddleware[]>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Template.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  headers: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  middleware: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
}, {
  sequelize,
  modelName: 'Template',
  timestamps: true // Adds createdAt and updatedAt
});
