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

### Build

`src/` holds JavaScript and TypeScript (being migrated file by file). It is compiled to
`dist/` with `tsc`, and that is what runs:

| Command | What it does |
|---------|--------------|
| `npm run dev` | Builds, runs `dist/index.js` and rebuilds + restarts when a file in `src/` changes |
| `npm run build` | Compiles `src/` to `dist/` (about a second) |
| `npm start` | Runs `dist/index.js` (builds first only when `dist/` does not exist; run `npm run build` after changing the source) (`npm run start:cluster` for cluster mode) |
| `npm run typecheck` | Type-checks all of `src/` (JavaScript through JSDoc) without writing files |

Running `node src/index.js` no longer works once a `.ts` file exists; use the commands
above. The Docker image builds `dist/` in a first stage and ships only that.

See the main [Getting Started Guide](../getting_started.md) for more detailed instructions.
