const defaultConfig = {
  dialect: 'sqlite',
  storage: 'data/database.sqlite',
  seederStorage: 'sequelize',
  seederStorageTableName: 'SequelizeData',
  migrationStorage: 'sequelize',
  migrationStorageTableName: 'SequelizeMeta'
};

// PostgreSQL configuration if enabled
function getPostgresConfig() {
  if (process.env.POSTGRES_DB === 'true' && process.env.POSTGRES_URL) {
    const postgresUrl = new URL(process.env.POSTGRES_URL);
    return {
      dialect: 'postgres',
      host: postgresUrl.hostname,
      port: Number(postgresUrl.port),
      database: postgresUrl.pathname.substring(1),
      username: postgresUrl.username,
      password: postgresUrl.password,
      seederStorage: 'sequelize',
      seederStorageTableName: 'SequelizeData',
      migrationStorage: 'sequelize',
      migrationStorageTableName: 'SequelizeMeta'
    };
  }
  return null;
}

// Export configurations for different environments
module.exports = {
  development: {
    ...defaultConfig,
    storage: 'data/database.sqlite',
    logging: console.log,
    ...(getPostgresConfig() || {})
  },
  test: {
    ...defaultConfig,
    storage: 'data/database.test.sqlite',
    logging: false,
    ...(getPostgresConfig() || {})
  },
  production: {
    ...defaultConfig,
    storage: 'data/database.sqlite',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    ...(getPostgresConfig() || {})
  }
};
