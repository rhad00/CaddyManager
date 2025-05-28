# CaddyManager

CaddyManager is an open-source reverse proxy manager built on top of Caddy Server. It provides a full-featured web-based UI and REST API backend, including a self-contained login system, initial default admin setup, and advanced features similar to NPMPlus, with additional support for service-specific header templates.

## Features

- **Authentication & User Management**: Self-contained auth system with JWT, role-based access control, and brute-force protection
- **Proxy Host Management**: Multi-domain support, automatic SSL via Let's Encrypt, custom SSL certs, and advanced routing options
- **Header & Middleware Configuration**: Custom header injection, security headers, rate limiting, and IP filtering
- **Templates for Common Services**: Predefined templates for Amazon S3, Authelia, Keycloak, Nextcloud, and more
- **Dashboard UI**: Modern React interface with TailwindCSS and ShadCN UI components
- **Backend API**: RESTful API with Caddy integration for configuration management
- **Security & Hardening**: HTTPS enforcement, secure cookies, CSRF protection, and more
- **Backup & Restore**: Configuration export/import, auto-backup, and optional cloud backup

## Project Structure

```
CaddyManager/
├── backend/               # Backend API server
├── frontend/              # React frontend application
├── docker/                # Docker and deployment configurations
├── docs/                  # Documentation
└── scripts/               # Utility scripts
```

## Getting Started

See the [Getting Started Guide](./getting_started.md) for detailed instructions on setting up the development environment and beginning implementation.

## Development Roadmap

The [Development Roadmap](./development_roadmap.md) outlines the planned phases and milestones for implementing all features.

## Technology Stack

The [Technology Stack](./technology_stack.md) document details the recommended technologies for both backend and frontend development.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
