const { Sequelize } = require('sequelize');
require('dotenv').config();

// Determine which database to use based on environment variables
// Default to SQLite for development simplicity
const dbType = process.env.DB_TYPE || 'sqlite';
const dbUrl = process.env.DB_URL;

let sequelize;

if (dbType === 'postgres') {
  // Use PostgreSQL
  sequelize = new Sequelize(dbUrl || process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });
} else {
  // Use SQLite (default)
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: process.env.SQLITE_PATH || './database.sqlite',
    logging: process.env.NODE_ENV === 'development' ? console.log : false
  });
}

// Test the database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    return true;
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    return false;
  }
};

module.exports = {
  sequelize,
  testConnection
};
