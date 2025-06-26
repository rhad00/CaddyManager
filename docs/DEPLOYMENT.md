# CaddyManager Deployment Guide

## Overview

CaddyManager consists of three main components:
1. **Frontend (Nginx)** - Serves the React application and proxies API requests
2. **Backend (Node.js)** - REST API server that manages Caddy configurations
3. **Caddy** - Reverse proxy server with Admin API for dynamic configuration

## Architecture

```
Internet → Frontend (Nginx:80/443) → Backend (Node.js:3000)
                                   ↓
                              Caddy Admin API (2019)
                                   ↓
                              User-configured proxies
```

## Production Deployment

### Prerequisites

- Docker and Docker Compose installed
- Ports 80, 443, and 2019 available
- At least 1GB RAM and 10GB disk space

### Step-by-Step Deployment

1. **Clone the repository:**
```bash
git clone https://github.com/rhad00/CaddyManager.git
cd CaddyManager
```

2. **Create production environment file:**
```bash
cp .env.prod.example .env.prod
```

3. **Configure environment variables:**
Edit `.env.prod` with secure values:
```bash
# Database Configuration
DB_PASSWORD=your_secure_production_password_here

# JWT Configuration (MUST be changed for security)
JWT_SECRET=your_production_jwt_secret_change_this_in_production_12345678901234567890
JWT_EXPIRES_IN=24h

# Other Backend Configuration
LOG_LEVEL=info

# Frontend Configuration
VITE_API_URL=/api
```

4. **Start the application:**
```bash
docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

5. **Verify deployment:**
```bash
# Check all services are running
docker-compose --env-file .env.prod -f docker-compose.prod.yml ps

# Check logs if needed
docker-compose --env-file .env.prod -f docker-compose.prod.yml logs
```

6. **Access the application:**
- Open http://localhost in your browser
- Complete the initial admin setup
- Start configuring your reverse proxies

## Development Deployment

### Quick Start

```bash
# Start development environment
docker-compose -f docker-compose.dev.yaml up -d

# Access services:
# - Frontend: http://localhost
# - Backend API: http://localhost:3000
# - Database: localhost:5432
# - Caddy Admin API: http://localhost:2019
```

## Troubleshooting

### Common Issues

#### 1. API Requests Failing (404 errors)

**Problem:** Frontend shows 404 errors when making API calls.

**Solution:** This was fixed in the nginx configuration. Ensure you're using the updated `frontend/nginx.conf`:

```nginx
# Proxy /api requests to backend
location /api/ {
    proxy_pass http://backend:3000/;
    # ... other proxy settings
}
```

**Root Cause:** The nginx configuration was passing the `/api` prefix to the backend, but the backend routes are already mounted on `/api/*`, causing path duplication (/api/api). The fix strips the `/api` prefix when proxying to the backend.

#### 2. Caddy Service Missing in Production

**Problem:** docker-compose.prod.yml was missing the Caddy service.

**Solution:** The production compose file now includes:
```yaml
caddy:
  image: caddy:2
  restart: unless-stopped
  ports:
    - "2019:2019"  # Caddy Admin API
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile:ro
    - caddy_data:/data
    - caddy_config:/config
```

#### 3. Port Conflicts

**Problem:** Multiple services trying to bind to the same ports.

**Solution:** 
- Frontend (nginx) serves on ports 80/443
- Caddy only exposes Admin API on port 2019
- Backend is internal-only (port 3000)

#### 4. Environment Variables Not Loading

**Problem:** Services fail to start due to missing environment variables.

**Solution:** Ensure you're using the correct env file:
```bash
# For production
docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d

# For development
docker-compose -f docker-compose.dev.yaml up -d
```

#### 5. Database Connection Issues

**Problem:** Backend cannot connect to PostgreSQL.

**Solution:** Check the database configuration in your environment file:
```bash
# In .env.prod
DB_PASSWORD=your_secure_production_password
```

And verify the backend environment in docker-compose.prod.yml:
```yaml
environment:
  - DB_HOST=db
  - DB_PORT=5432
  - DB_NAME=caddymanager
  - DB_USER=caddyuser
  - DB_PASSWORD=${DB_PASSWORD}
```

### Logs and Debugging

#### View Service Logs

```bash
# All services
docker-compose --env-file .env.prod -f docker-compose.prod.yml logs

# Specific service
docker-compose --env-file .env.prod -f docker-compose.prod.yml logs frontend
docker-compose --env-file .env.prod -f docker-compose.prod.yml logs backend
docker-compose --env-file .env.prod -f docker-compose.prod.yml logs caddy
docker-compose --env-file .env.prod -f docker-compose.prod.yml logs db
```

#### Check Service Status

```bash
# List running containers
docker-compose --env-file .env.prod -f docker-compose.prod.yml ps

# Check resource usage
docker stats
```

#### Access Service Shells

```bash
# Backend shell
docker-compose --env-file .env.prod -f docker-compose.prod.yml exec backend sh

# Database shell
docker-compose --env-file .env.prod -f docker-compose.prod.yml exec db psql -U caddyuser -d caddymanager
```

## Security Considerations

### Production Security Checklist

- [ ] Change default JWT_SECRET in .env.prod
- [ ] Use strong database password
- [ ] Ensure Caddy Admin API (port 2019) is not exposed to internet
- [ ] Configure firewall to only allow necessary ports
- [ ] Regularly update Docker images
- [ ] Monitor logs for suspicious activity

### Network Security

The production setup uses an internal Docker network where:
- Only frontend ports (80/443) are exposed to the internet
- Backend and database are internal-only
- Caddy Admin API is internal-only but accessible to backend

## Backup and Recovery

### Configuration Backup

CaddyManager automatically backs up Caddy configurations to:
- `backend/config_backups/caddy_config_backup.json`
- This can be mounted as a volume for persistence

### Database Backup

```bash
# Create database backup
docker-compose --env-file .env.prod -f docker-compose.prod.yml exec db pg_dump -U caddyuser caddymanager > backup.sql

# Restore database backup
docker-compose --env-file .env.prod -f docker-compose.prod.yml exec -T db psql -U caddyuser caddymanager < backup.sql
```

## Scaling and Performance

### Resource Requirements

**Minimum:**
- 1 CPU core
- 1GB RAM
- 10GB disk space

**Recommended:**
- 2 CPU cores
- 2GB RAM
- 50GB disk space

### Performance Tuning

1. **Database Optimization:**
   - Increase PostgreSQL shared_buffers for better performance
   - Configure connection pooling if needed

2. **Frontend Optimization:**
   - Enable gzip compression in nginx
   - Configure proper caching headers

3. **Caddy Optimization:**
   - Monitor Caddy metrics via Admin API
   - Configure appropriate timeouts for your use case

## Migration from Development to Production

1. **Export Development Configuration:**
   - Use the backup feature in CaddyManager UI
   - Export proxy configurations

2. **Deploy Production Environment:**
   - Follow production deployment steps
   - Import backed up configurations

3. **Update DNS:**
   - Point your domains to the production server
   - Verify SSL certificates are working

## Support

For additional support:
- Check the [GitHub Issues](https://github.com/rhad00/CaddyManager/issues)
- Review the main [README.md](./README.md)
- Consult the [Contributing Guidelines](./CONTRIBUTING.md)
