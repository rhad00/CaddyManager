import { Sequelize } from 'sequelize-typescript';
import { Dialect } from 'sequelize';
import path from 'path';

// Get SQLite data directory from env or use default
const sqliteDataDir = process.env.SQLITE_DATA_DIR || 'data';

// Default to SQLite configuration
import { SequelizeOptions } from 'sequelize-typescript';

let sequelizeConfig: SequelizeOptions = {
  dialect: 'sqlite' as Dialect,
  storage: path.join(__dirname, `../../${sqliteDataDir}/database.sqlite`),
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  models: [__dirname + '/../models'],
};

// Switch to PostgreSQL if explicitly configured
if (process.env.POSTGRES_DB === 'true' && process.env.POSTGRES_URL) {
  const postgresUrl = new URL(process.env.POSTGRES_URL);

  sequelizeConfig = {
    dialect: 'postgres' as Dialect,
    host: postgresUrl.hostname,
    port: Number(postgresUrl.port),
    database: postgresUrl.pathname.substring(1), // Remove leading '/'
    username: postgresUrl.username,
    password: postgresUrl.password,
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    models: [__dirname + '/../models'],
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  };
}

export const sequelize = new Sequelize(sequelizeConfig);

export const initDatabase = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log(`Database connection established successfully using ${sequelizeConfig.dialect}.`);

    // Sync all models in development
    // Note: In production, you should use migrations instead of sync
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('Database models synchronized.');
    }
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};
