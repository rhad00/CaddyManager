const { sequelize } = require('../src/config/database');

beforeAll(async () => {
    // Sync database before tests
    // Use force: true to clear database
    await sequelize.sync({ force: true });
});

afterAll(async () => {
    // Close database connection
    await sequelize.close();
});
