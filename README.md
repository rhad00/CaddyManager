# CaddyManager

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub issues](https://img.shields.io/github/issues/rhad00/CaddyManager)](https://github.com/rhad00/CaddyManager/issues)
[![GitHub stars](https://img.shields.io/github/stars/rhad00/CaddyManager)](https://github.com/rhad00/CaddyManager/stargazers)
[![Docker Pulls](https://img.shields.io/docker/pulls/rhad00/CaddyManager)](https://hub.docker.com/r/rhad00/CaddyManager)

CaddyManager is a powerful, open-source reverse proxy manager built on top of Caddy Server. It provides a feature-rich web-based UI and REST API backend for managing Caddy configurations, with a self-contained login system, initial admin setup, and advanced features similar to NPMPlus.

## How It Works

### Initial Setup and Caddyfile
The application uses a base Caddyfile for initial startup that:
- Configures the Admin API endpoint on port 2019 (accessible only from internal network)
- Disables automatic HTTPS redirects initially
- Sets up file system storage for certificates and data
- Provides default placeholder responses on ports 80 and 443

On startup, the CaddyService:
1. Checks for an existing configuration backup
2. If a backup exists, loads it
3. If no backup exists but there are proxies in the database, rebuilds the configuration
4. If neither exists, uses the default Caddyfile configuration

### Template System
The application includes pre-configured templates for common services:
- Authelia (Authentication server)
- Keycloak (Identity management)
- Amazon S3 compatible services (MiniIO, Ceph RadosGW) (Storage service)
- Nextcloud (Self-hosted productivity)
- Cloudflare Tunnel
- Grafana (Monitoring platform)
- Kibana/Elastic (Dashboard)

Each template includes:
- Predefined headers for proper service functionality
- Middleware configurations (if required)
- Specific routing rules

Templates can be applied to proxies to automatically configure:
- Request/response headers
- Authentication settings
- Rate limiting
- IP filtering
- Path rewrites

### Header Management
Headers are managed through a flexible system that supports:
- Request and response header types
- Dynamic values using Caddy placeholders
- Template-based header inheritance
- Per-proxy custom headers

Example header configurations:

1. Authentication header from Authelia template:
```javascript
{
  header_type: 'request',
  header_name: 'x-original-uri',
  header_value: '{http.request.uri}'
}
```

2. Security header (automatically applied when security headers are enabled):
```javascript
{
  header_type: 'response',
  header_name: 'Strict-Transport-Security',
  header_value: 'max-age=31536000; includeSubDomains; preload',
  enabled: true
}
```

![CaddyManager Dashboard](.github/images/dashboard.png)


## NOTE: this project is in very Alpha stage, and it might not work as expected.

## 🚀 Features

### Core Features
- **Authentication & User Management**
  - JWT-based authentication with secure password hashing
  - Role-based access control (Admin, Read-only)
  - Brute-force protection with rate limiting
  - Initial admin setup automation

- **Proxy Host Management**
  - Multi-domain support
  - Automatic SSL via Let's Encrypt
  - Custom SSL certificate management
  - Advanced routing options
  - HTTP to HTTPS redirection
  - Compression options (gzip/zstd)

- **Header & Middleware Configuration**
  - Custom header injection (request/response)
  - One-click security headers configuration:
    - Strict-Transport-Security (HSTS) for enhanced transport security
    - X-Content-Type-Options to prevent MIME-type sniffing
    - X-Frame-Options to control frame embedding
    - Content-Security-Policy for XSS prevention
    - Referrer-Policy to control referrer information
    - Permissions-Policy to manage browser features
  - Rate limiting middleware
  - IP filtering (allow/block lists)
  - Basic authentication
  - Path-based routing

### Advanced Features
- **Service Templates**
  - Predefined templates for:
    - Amazon S3
    - Authelia
    - Keycloak
    - Nextcloud
    - Cloudflare Tunnel
    - Grafana
    - Kibana/Elastic
  - Custom template creation (to do)
  - Template merging with headers (to do)

- **Backup & Restore**
  - Configuration export/import
  - Automated backups (to do)
  - SSL certificate backup (to do)
  - Optional S3 cloud backup (to do)
  - Encrypted local backups (to do)

- **Monitoring & Security**
  - System health monitoring
  - Access and error logging (to do)
  - Comprehensive security features (CrowdSec / mod_security) (to do)

## Implementation Details

### Proxy Management
- Each proxy is stored in the database with:
  - Domain configuration
  - SSL settings
  - Upstream URL
  - Security headers configuration
  - Associated headers and middleware
- Changes trigger automatic Caddy configuration updates via Admin API
- Configuration backups are maintained for reliability

### Configuration Persistence
- Configurations are stored in both the database and Caddy
- Automatic backup system maintains config_backups/caddy_config_backup.json which can be mounted as local folder in docker or in a volume
- Configuration is rebuilt from database on service restart
- Handles both HTTP and HTTPS proxies with proper SSL termination (ACME Let's Encrypt without user intervention)

### Template Implementation
Templates simplify service configuration through:
1. Predefined header sets for common services
2. Middleware configurations (rate limiting, auth, etc.)
3. Path-based routing rules
4. SSL and compression settings

Example template usage in code:
```javascript
await caddyService.applyTemplate(proxy, template);
// Applies all template headers and middleware
// Updates Caddy configuration automatically
```

## 🛠 Technology Stack

### Backend
- **Runtime**: Node.js 20.x LTS
- **Framework**: Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Authentication**: JWT with Passport.js
- **API Documentation**: Swagger/OpenAPI
- **Testing**: Jest, Supertest

### Frontend
- **Framework**: React 18+
- **Build Tool**: Vite
- **UI Framework**: TailwindCSS + ShadCN UI
- **State Management**: React Context API + React Query
- **Form Handling**: React Hook Form
- **Testing**: Vitest + React Testing Library

### Infrastructure
- **Container**: Docker & Docker Compose
- **Reverse Proxy**: Caddy 2.x
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana (optional)

## 🚀 Quick Start

### Docker Deployment (Recommended)

#### Production Deployment

1. Clone the repository:
```bash
git clone https://github.com/rhad00/CaddyManager.git
cd CaddyManager
```

2. Create production environment file:
```bash
cp .env.prod.example .env.prod
```

3. Edit `.env.prod` with your production values:
```bash
# Database Configuration
DB_PASSWORD=your_secure_production_password

# JWT Configuration
JWT_SECRET=your_production_jwt_secret_change_this_in_production_12345678901234567890
JWT_EXPIRES_IN=24h

# Other Backend Configuration
LOG_LEVEL=info

# Frontend Configuration
VITE_API_URL=/api
```

4. Start the application:
```bash
docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

5. Access the UI at http://localhost
   - The frontend serves the CaddyManager interface on port 80/443
   - Caddy Admin API is available on port 2019 (internal use only)
   - Configure your reverse proxies through the web interface

#### Development Deployment

1. Start development environment:
```bash
docker-compose -f docker-compose.dev.yaml up -d
```

2. Access the UI at http://localhost
   - Backend API available at http://localhost:3000
   - Database available at localhost:5432
   - Caddy Admin API at http://localhost:2019

### Manual Installation

1. Clone the repository:
```bash
git clone https://github.com/rhad00/CaddyManager.git
cd CaddyManager
```

2. Install dependencies:
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. Configure environment:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

4. Start development servers:
```bash
# Backend
cd backend
npm run dev

# Frontend
cd ../frontend
npm run dev
```

## 📝 Documentation

- [Deployment Guide](./docs/DEPLOYMENT.md) - Complete deployment and troubleshooting guide
- [Getting Started Guide](./docs/getting_started.md)
- [Development Roadmap](./docs/development_roadmap.md)
- [Technology Stack Details](./docs/technology_stack.md)
- [Project Structure](./docs/project_structure.md)
- [API Documentation](https://api-docs.caddymanager.org)
- [Contributing Guidelines](./CONTRIBUTING.md)
- [Code of Conduct](./docs/CODE_OF_CONDUCT.md)

## 🗺 Roadmap

### Wish list
- Enhanced monitoring capabilities
- Additional service templates
- Advanced analytics dashboard
- Multi-language support
- Plugin system for extensions
- Multi-node Caddy management
- Advanced backup strategies
- Enhanced security features
- Clustering and high availability
- Enterprise features (LDAP/SAML)

## 👥 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. Commit your changes:
   ```bash
   git commit -m 'Add amazing feature'
   ```
4. Push to the branch:
   ```bash
   git push origin feature/amazing-feature
   ```
5. Open a Pull Request

## 🐛 Bug Reports & Feature Requests

Please use the [GitHub issue tracker](https://github.com/rhad00/CaddyManager/issues) to report bugs or suggest features.

When reporting bugs, please include:
- Detailed description of the issue
- Steps to reproduce
- Expected vs actual behavior
- CaddyManager version
- Environment details (OS, Docker version if applicable)
- Relevant logs or screenshots

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Caddy Server](https://caddyserver.com/) for the amazing reverse proxy
- [NPMPlus](https://github.com/nginx-proxy-manager/nginx-proxy-manager) for inspiration
- All our [contributors](https://github.com/rhad00/CaddyManager/graphs/contributors)

---

<p align="center">Made with ❤️ by the CaddyManager Team</p>
