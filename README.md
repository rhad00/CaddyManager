# CaddyManager

An open-source reverse proxy manager built on Caddy Server with a modern web UI and comprehensive API. CaddyManager simplifies the management of reverse proxies, SSL certificates, and advanced header configurations through an intuitive interface.

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)

## Features

### Core Functionality
- 🚀 Modern web-based UI for managing Caddy Server
- 🔒 Automatic SSL/TLS certificate management via Let's Encrypt
- 🌐 Reverse proxy configuration with support for multiple domains
- 📊 Real-time monitoring and health checks
- 🔔 Alerts and notification system

### Proxy Management
- Domain validation and management
- HTTP to HTTPS redirection
- Compression options (gzip/zstd)
- Caching header controls
- Path-based routing rules

### Security Features
- Custom request/response header injection
- Security headers management (CSP, XSS, HSTS)
- Rate limiting middleware
- IP allow/block list functionality
- Basic authentication support
- JWT-based authentication for API access

### Service Templates
Predefined templates for common services:
- Amazon S3
- Authelia
- Keycloak
- Nextcloud
- Cloudflare Tunnel
- Grafana
- Kibana/Elastic

### Monitoring & Maintenance
- Real-time metrics dashboard
- SSL certificate expiration monitoring
- System health monitoring
- Access and error log viewing
- Configuration backup and restore
- Auto-backup on configuration changes

## Installation

### Prerequisites
- Docker and Docker Compose v2.x
- Node.js 18+ (for local development)
- Git

### Quick Start with Docker

1. Clone the repository:
\`\`\`bash
git clone <repository-url>
cd caddymanager
\`\`\`

2. Set up environment variables:
\`\`\`bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
\`\`\`

3. Configure your environment files:

Backend (.env):
\`\`\`env
# Server
PORT=3000
NODE_ENV=production

# Database (PostgreSQL container)
DB_HOST=postgres          # Use the service name from docker-compose.yml
DB_PORT=5432
DB_NAME=caddymanager
DB_USER=postgres
DB_PASSWORD=your_password

# CORS (for Docker Compose)
FRONTEND_URL=http://frontend:80  # Use the frontend service name
\`\`\`

Frontend (.env):
\`\`\`env
# API URLs (use backend service name)
VITE_API_URL=http://backend:3000/api
VITE_WS_URL=ws://backend:3000
VITE_JWT_STORAGE_KEY=caddy_manager_token
VITE_ENABLE_WEBSOCKET=true
\`\`\`

4. Initialize the database and start the application:
\`\`\`bash
# Start PostgreSQL first
docker compose -f docker/docker-compose.yml up -d postgres

# Run migrations (using the migrate script in backend container)
docker compose -f docker/docker-compose.yml exec backend npm run migrate

# Start remaining services
docker compose -f docker/docker-compose.yml up -d
\`\`\`

For detailed installation instructions, including manual deployment and configuration options, see our [Deployment Guide](docs/deployment/README.md).

### Docker Build Notes

The Docker Compose setup uses build contexts for each service:
```yaml
backend:
  build:
    context: ../backend      # Root of backend source
    dockerfile: ../docker/Dockerfile.backend

frontend:
  build:
    context: ../frontend     # Root of frontend source
    dockerfile: ../docker/Dockerfile.frontend
```

All docker compose commands should be run from the project root:
```bash
# Build images
docker compose -f docker/docker-compose.yml build

# Start services (uses SQLite by default)
docker compose -f docker/docker-compose.yml up -d

# To use PostgreSQL instead:
docker compose -f docker/docker-compose.yml --profile with-postgres up -d
```

## Usage

### Web UI

1. Access the web interface at \`http://localhost\` (or your configured domain)
2. Log in with the default admin credentials (remember to change these):
   - Username: admin
   - Password: admin123

### Key Features

1. **Proxy Management**
   - Create and manage reverse proxy configurations
   - Configure domains and SSL certificates
   - Set up path-based routing rules

2. **Security Configuration**
   - Configure security headers
   - Set up rate limiting
   - Manage IP restrictions
   - Configure basic authentication

3. **Monitoring**
   - View real-time metrics
   - Monitor SSL certificate status
   - Check proxy health status
   - View system logs

4. **Templates**
   - Use pre-configured service templates
   - Create custom templates
   - Import/export configurations

## API Documentation

The CaddyManager API provides comprehensive endpoints for automation and integration. Access the API documentation at \`http://your-domain/api/docs\` or refer to our [API Documentation](docs/api/README.md).

## Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create a feature branch:
\`\`\`bash
git checkout -b feature/amazing-feature
\`\`\`

3. Commit your changes:
\`\`\`bash
git commit -m 'Add amazing feature'
\`\`\`

4. Push to the branch:
\`\`\`bash
git push origin feature/amazing-feature
\`\`\`

5. Open a Pull Request

### Development Setup

1. Install dependencies:
\`\`\`bash
# Backend
cd backend
npm install

# Frontend
cd frontend
npm install
\`\`\`

2. Start development servers:
\`\`\`bash
# Backend
cd backend
npm run dev

# Frontend
cd frontend
npm run dev
\`\`\`

### Code Style

- Follow the provided ESLint and Prettier configurations
- Write tests for new features
- Update documentation as needed

## Configuration

### Backend (.env)
```env
# Server
PORT=3000
NODE_ENV=production

# Database
DB_HOST=postgres    # Use the service name from docker-compose.yml
DB_PORT=5432
DB_NAME=caddymanager
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_secure_secret
JWT_EXPIRES_IN=1d

# CORS (for Docker Compose setup)
FRONTEND_URL=http://frontend:80  # Use the frontend service name from docker-compose.yml

# For local development, use:
# FRONTEND_URL=http://localhost:5173
```

### Frontend (.env)
\`\`\`env
# Docker Compose setup (use backend service name)
VITE_API_URL=http://backend:3000/api    # Backend container service name
VITE_WS_URL=ws://backend:3000           # WebSocket connection to backend
VITE_JWT_STORAGE_KEY=caddy_manager_token
VITE_ENABLE_WEBSOCKET=true
VITE_ENABLE_DARK_MODE=true

# For local development, use:
# VITE_API_URL=http://localhost:3000/api
# VITE_WS_URL=ws://localhost:3000
\`\`\`

### Database Setup and Migrations

The application supports both PostgreSQL and SQLite databases. Database migrations are required for both options to set up the schema.

#### PostgreSQL (Default)

1. Start the PostgreSQL container:
```bash
# Start PostgreSQL container first
docker compose -f docker/docker-compose.yml up -d postgres

# Wait for PostgreSQL to be ready
docker compose -f docker/docker-compose.yml exec postgres pg_isready

# Run migrations
docker compose -f docker/docker-compose.yml exec backend npm run migrate
```

#### SQLite

SQLite doesn't require a separate container, but still needs migrations:

1. Configure backend/.env for SQLite:
```env
DB_DIALECT=sqlite
DB_STORAGE=./data/database.sqlite
```

2. Create the data directory and run migrations:
```bash
# Create data directory (inside backend container)
docker compose -f docker/docker-compose.yml exec backend mkdir -p data

# Run SQLite migrations
docker compose -f docker/docker-compose.yml exec backend npm run migrate
```

Note: Migrations are required for both database options to create the necessary tables and schema.

## Support

- 📫 Report bugs through [GitHub issues](https://github.com/rhad00/CaddyManager/issues)
- 💬 Join our community discussions
- 📖 Check out our [documentation](docs/)

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Security

Please report security vulnerabilities to security@your-domain.com. We take security seriously and will respond promptly to fix verified security issues.

---

Copyright 2025 CaddyManager Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
