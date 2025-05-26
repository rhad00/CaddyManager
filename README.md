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

3. Start the application:
\`\`\`bash
docker compose -f docker/docker-compose.yml up -d
\`\`\`

For detailed installation instructions, including manual deployment and configuration options, see our [Deployment Guide](docs/deployment/README.md).

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
\`\`\`env
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=caddymanager
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_secure_secret
JWT_EXPIRES_IN=1d
\`\`\`

### Frontend (.env)
\`\`\`env
VITE_API_URL=http://your-api-domain/api
VITE_WS_URL=ws://your-api-domain
VITE_JWT_STORAGE_KEY=caddy_manager_token
VITE_ENABLE_WEBSOCKET=true
VITE_ENABLE_DARK_MODE=true
\`\`\`

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
