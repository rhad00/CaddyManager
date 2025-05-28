# CaddyManager Backend

This directory contains the backend API server for CaddyManager, providing the core functionality for managing Caddy Server configurations, user authentication, and proxy management.

## Directory Structure

```
backend/
├── src/
│   ├── api/               # API routes and controllers
│   ├── middleware/        # Express middleware
│   ├── services/          # Business logic
│   ├── models/            # Database models
│   ├── utils/             # Utility functions
│   ├── config/            # Configuration
│   ├── migrations/        # Database migrations
│   └── seeders/           # Database seeders
├── tests/                 # Test files
└── package.json           # Dependencies and scripts
```

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL with Sequelize ORM (SQLite option for simpler deployments)
- **Authentication**: JWT with secure password hashing
- **API Documentation**: Swagger/OpenAPI
- **Testing**: Jest, Supertest

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables:
   ```
   cp .env.example .env
   ```

3. Run development server:
   ```
   npm run dev
   ```

4. Run tests:
   ```
   npm test
   ```

See the main [Getting Started Guide](../getting_started.md) for more detailed instructions.
