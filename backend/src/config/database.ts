import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import { postgresSsl } from './dbSsl';

dotenv.config();

// Determine which database to use based on environment variables
// Default to SQLite for development simplicity
const dbType = process.env.DB_TYPE || 'sqlite';
const dbUrl = process.env.DB_URL;

const logging = process.env.NODE_ENV === 'development' ? console.log : false;

function createSequelize(): Sequelize {
  if (dbType === 'postgres') {
    // Use PostgreSQL
    const url = dbUrl || process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DB_TYPE=postgres requires DB_URL (or DATABASE_URL) to be set');
    }
    return new Sequelize(url, {
      dialect: 'postgres',
      logging,
      dialectOptions: {
        ssl: postgresSsl(process.env)
      }
    });
  }

  // Use SQLite (default)
  if (process.env.NODE_ENV === 'production') {
    console.warn('WARNING: SQLite is not recommended for production. Set DB_TYPE=postgres for reliability.');
  }
  return new Sequelize({
    dialect: 'sqlite',
    storage: process.env.SQLITE_PATH || './database.sqlite',
    logging
  });
}

export const sequelize = createSequelize();

// Test the database connection
export const testConnection = async (): Promise<boolean> => {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    return true;
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    return false;
  }
};
