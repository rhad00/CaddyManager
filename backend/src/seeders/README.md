# Database Seeders

## Guidelines

1. Use raw SQL queries or queryInterface for seeders
   - Avoids TypeScript/JavaScript compatibility issues
   - Bypasses model validation which may not work in JS context
   - Provides better control over data insertion

2. Always include:
   - Duplicate checks to prevent unique constraint violations
   - Proper date handling (use database native functions)
   - Error handling with detailed logging
   - Down migration for cleanup

3. Example pattern:
```javascript
try {
  // Check for duplicates
  const existing = await queryInterface.sequelize.query(/* check query */);
  
  // Insert if not exists
  if (!existing.length) {
    await queryInterface.sequelize.query(/* insert query */);
  }
} catch (error) {
  console.error('Seeder failed:', error);
  throw error;
}
