# Deployment Guide

This document outlines the steps to deploy the Caddy Manager application. The application consists of three main components:
- Frontend (React/Vite)
- Backend (Node.js/Express)
- Caddy Server

## Prerequisites

- Docker and Docker Compose v2.x
- Node.js 18+ (for local development)
- Git

## Environment Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd caddymanager
```

2. Set up environment variables:

Backend:
```bash
cp backend/.env.example backend/.env
```

Frontend:
```bash
cp frontend/.env.example frontend/.env
```

Adjust the values in both `.env` files according to your deployment environment.

## Docker Deployment

1. Build and start the containers:
```bash
docker compose -f docker/docker-compose.yml up -d
```

This will start:
- Frontend container (default port: 80)
- Backend API (default port: 3000)
- Caddy reverse proxy

2. Verify the deployment:
```bash
docker compose -f docker/docker-compose.yml ps
```

## Manual Deployment

### Backend

1. Install dependencies:
```bash
cd backend
npm install
```

2. Run database migrations:
```bash
npm run migrate
```

3. Start the production server:
```bash
npm run build
npm start
```

### Frontend

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Build the production bundle:
```bash
npm run build
```

3. Serve the built files:
```bash
npm run preview
```

## Configuration

### Backend Configuration (.env)

```env
# Server
PORT=3000
NODE_ENV=production

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=caddymanager
DB_USER=postgres
DB_PASSWORD=your_password

# Database (SQLite)
# Uncomment these and comment out PostgreSQL config to use SQLite
# DB_DIALECT=sqlite
# DB_STORAGE=./data/database.sqlite

# JWT
JWT_SECRET=your_secure_secret
JWT_EXPIRES_IN=1d

# Monitoring
METRICS_COLLECTION_INTERVAL=30000
```

### Database Setup

The application supports both SQLite (default) and PostgreSQL databases.

#### Local Development

For local development with SQLite:

1. Create the data directory:
```bash
mkdir -p backend/data
```

2. Run migrations:
```bash
cd backend
npm run migrate
```

#### Docker Deployment

When using Docker, the database migrations are handled slightly differently:

1. For SQLite (default):
```bash
# Run migrations inside the backend container
docker compose -f docker/docker-compose.yml exec backend npm run migrate
```

2. For PostgreSQL:
```bash
# Set PostgreSQL environment variables
docker compose -f docker/docker-compose.yml exec backend sh -c "
export POSTGRES_DB=true && \
export POSTGRES_URL=postgres://username:password@hostname:5432/dbname && \
npm run migrate"
```

The migration process will:
- Use the configuration from src/config/sequelize.js (automatically copied to the container)
- Create and initialize the database
- Run all pending migrations
- Store migration state in a special table (SequelizeMeta)

Note: SQLite is suitable for small to medium deployments. For larger installations with high concurrent loads, PostgreSQL is recommended.

### Frontend Configuration (.env)

```env
VITE_API_URL=http://your-api-domain/api
VITE_WS_URL=ws://your-api-domain
VITE_JWT_STORAGE_KEY=caddy_manager_token
VITE_ENABLE_WEBSOCKET=true
VITE_ENABLE_DARK_MODE=true
VITE_METRICS_REFRESH_INTERVAL=30000
VITE_HEALTH_CHECK_INTERVAL=60000
```

## SSL/TLS Configuration

The application uses Caddy for SSL/TLS termination. Caddy automatically handles Let's Encrypt certificate provisioning.

To configure custom domains:

1. Update the Caddyfile in `docker/caddy/Caddyfile`:
```
your-domain.com {
    reverse_proxy frontend:80
}

api.your-domain.com {
    reverse_proxy backend:3000
}
```

2. Restart the Caddy container:
```bash
docker compose -f docker/docker-compose.yml restart caddy
```

## Health Checks

Monitor the application health:
- Frontend: `http://your-domain.com/health`
- Backend: `http://api.your-domain.com/health`
- Metrics: `http://api.your-domain.com/metrics`

## Troubleshooting

1. Check container logs:
```bash
docker compose -f docker/docker-compose.yml logs [service]
```

2. Verify network connectivity:
```bash
docker compose -f docker/docker-compose.yml exec backend ping frontend
```

3. Check application logs:
- Backend: `/var/log/caddymanager/backend.log`
- Frontend: Browser console
- Caddy: `/var/log/caddy/access.log`

## Backup and Restore

1. Database backup:
```bash
docker compose -f docker/docker-compose.yml exec db pg_dump -U postgres caddymanager > backup.sql
```

2. Database restore:
```bash
cat backup.sql | docker compose -f docker/docker-compose.yml exec -T db psql -U postgres caddymanager
```

## Security Considerations

1. Always change default passwords in production
2. Use strong JWT secrets
3. Enable rate limiting in production
4. Keep all packages updated
5. Monitor application logs for suspicious activity
6. Configure proper firewall rules
7. Use secure communication between services
