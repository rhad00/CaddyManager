# CaddyManager Project Structure

This document outlines the recommended project structure for CaddyManager, an open-source reverse proxy manager built on Caddy Server. The structure is designed to separate concerns, promote maintainability, and support the full feature set described in the requirements.

## Root Directory Structure

```
CaddyManager/
├── backend/               # Backend API server
├── frontend/              # React frontend application
├── docker/                # Docker and deployment configurations
├── docs/                  # Documentation
├── scripts/               # Utility scripts
└── README.md              # Project overview
```

## Backend Structure

```
backend/
├── src/
│   ├── api/               # API routes and controllers
│   │   ├── auth/          # Authentication endpoints
│   │   ├── proxies/       # Proxy management endpoints
│   │   ├── templates/     # Service templates endpoints
│   │   ├── users/         # User management endpoints
│   │   └── settings/      # System settings endpoints
│   ├── middleware/        # Express/Fiber middleware
│   │   ├── auth.js        # Authentication middleware
│   │   ├── validation.js  # Request validation
│   │   ├── rateLimit.js   # Rate limiting
│   │   └── errorHandler.js # Error handling
│   ├── services/          # Business logic
│   │   ├── authService.js # Authentication logic
│   │   ├── proxyService.js # Proxy management
│   │   ├── templateService.js # Template management
│   │   ├── userService.js # User management
│   │   ├── backupService.js # Backup and restore
│   │   └── caddyService.js # Caddy API integration
│   ├── models/            # Database models
│   │   ├── user.js        # User model
│   │   ├── proxy.js       # Proxy configuration model
│   │   ├── template.js    # Service template model
│   │   └── settings.js    # System settings model
│   ├── utils/             # Utility functions
│   │   ├── crypto.js      # Encryption utilities
│   │   ├── validation.js  # Input validation
│   │   ├── logger.js      # Logging utility
│   │   └── caddyConfig.js # Caddy config generation
│   ├── config/            # Configuration
│   │   ├── database.js    # Database configuration
│   │   ├── server.js      # Server configuration
│   │   └── caddy.js       # Caddy API configuration
│   ├── migrations/        # Database migrations
│   ├── seeders/           # Database seeders (initial data)
│   └── app.js             # Application entry point
├── tests/                 # Test files
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── fixtures/          # Test fixtures
├── .env.example           # Environment variables example
├── package.json           # Dependencies and scripts
└── README.md              # Backend documentation
```

## Frontend Structure

```
frontend/
├── public/                # Static files
│   ├── favicon.ico        # Favicon
│   └── index.html         # HTML entry point
├── src/
│   ├── assets/            # Static assets
│   │   ├── images/        # Image files
│   │   ├── styles/        # Global styles
│   │   └── icons/         # Icon files
│   ├── components/        # Reusable components
│   │   ├── common/        # Common UI components
│   │   ├── layout/        # Layout components
│   │   ├── auth/          # Authentication components
│   │   ├── proxies/       # Proxy management components
│   │   ├── templates/     # Template management components
│   │   ├── users/         # User management components
│   │   └── settings/      # Settings components
│   ├── pages/             # Page components
│   │   ├── Login.jsx      # Login page
│   │   ├── Dashboard.jsx  # Main dashboard
│   │   ├── ProxyList.jsx  # Proxy listing page
│   │   ├── ProxyEdit.jsx  # Proxy editing page
│   │   ├── Templates.jsx  # Templates management
│   │   ├── Users.jsx      # User management
│   │   └── Settings.jsx   # System settings
│   ├── hooks/             # Custom React hooks
│   │   ├── useAuth.js     # Authentication hook
│   │   ├── useApi.js      # API communication hook
│   │   └── useToast.js    # Notification hook
│   ├── context/           # React context providers
│   │   ├── AuthContext.js # Authentication context
│   │   └── ThemeContext.js # Theme context
│   ├── services/          # Frontend services
│   │   ├── api.js         # API client
│   │   ├── auth.js        # Authentication service
│   │   └── storage.js     # Local storage service
│   ├── utils/             # Utility functions
│   │   ├── formatters.js  # Data formatters
│   │   ├── validators.js  # Form validation
│   │   └── helpers.js     # Helper functions
│   ├── constants/         # Constants and enums
│   ├── App.jsx            # Main application component
│   ├── routes.jsx         # Application routes
│   └── index.jsx          # Application entry point
├── .env.example           # Environment variables example
├── package.json           # Dependencies and scripts
├── tailwind.config.js     # Tailwind CSS configuration
├── vite.config.js         # Vite configuration
└── README.md              # Frontend documentation
```

## Docker Structure

```
docker/
├── docker-compose.yml     # Main docker-compose configuration
├── docker-compose.dev.yml # Development configuration
├── Dockerfile.backend     # Backend Dockerfile
├── Dockerfile.frontend    # Frontend Dockerfile
├── caddy/                 # Caddy configuration
│   ├── Caddyfile          # Default Caddyfile
│   └── Dockerfile         # Caddy Dockerfile
├── nginx/                 # Nginx configuration (for frontend)
│   └── default.conf       # Nginx configuration
└── scripts/               # Docker helper scripts
    ├── init.sh            # Initialization script
    ├── backup.sh          # Backup script
    └── restore.sh         # Restore script
```

## Documentation Structure

```
docs/
├── api/                   # API documentation
│   ├── auth.md            # Authentication API
│   ├── proxies.md         # Proxy management API
│   ├── templates.md       # Templates API
│   ├── users.md           # User management API
│   └── settings.md        # Settings API
├── guides/                # User guides
│   ├── installation.md    # Installation guide
│   ├── configuration.md   # Configuration guide
│   ├── templates.md       # Templates guide
│   └── security.md        # Security guide
├── development/           # Developer documentation
│   ├── architecture.md    # Architecture overview
│   ├── contributing.md    # Contribution guidelines
│   ├── testing.md         # Testing guidelines
│   └── deployment.md      # Deployment guidelines
├── diagrams/              # System diagrams
│   ├── architecture.png   # Architecture diagram
│   ├── database.png       # Database schema
│   └── flow.png           # Process flow diagrams
└── README.md              # Documentation overview
```

## Scripts Structure

```
scripts/
├── setup.sh               # Project setup script
├── dev.sh                 # Development environment script
├── build.sh               # Build script
├── test.sh                # Test runner script
├── deploy.sh              # Deployment script
└── backup.sh              # Backup utility script
```

## Database Schema Design

The database schema will include the following core tables:

1. **Users**
   - id (primary key)
   - email
   - password_hash
   - role (admin, read-only)
   - last_login
   - created_at
   - updated_at
   - status (active, locked)
   - failed_login_attempts
   - reset_token

2. **Proxies**
   - id (primary key)
   - name
   - domains (array or JSON)
   - upstream_url
   - ssl_type (acme, custom, none)
   - custom_ssl_cert_id (foreign key to SSL_Certificates)
   - http_to_https_redirect (boolean)
   - compression_enabled (boolean)
   - cache_settings (JSON)
   - http_versions (array)
   - status (active, disabled)
   - created_at
   - updated_at
   - created_by (foreign key to Users)

3. **Headers**
   - id (primary key)
   - proxy_id (foreign key to Proxies)
   - header_type (request, response)
   - header_name
   - header_value
   - enabled (boolean)

4. **Middleware**
   - id (primary key)
   - proxy_id (foreign key to Proxies)
   - middleware_type (rate_limit, ip_filter, basic_auth, redirect)
   - configuration (JSON)
   - enabled (boolean)
   - order (for execution order)

5. **Templates**
   - id (primary key)
   - name
   - description
   - headers (JSON)
   - middleware (JSON)
   - created_at
   - updated_at

6. **SSL_Certificates**
   - id (primary key)
   - name
   - certificate (encrypted)
   - private_key (encrypted)
   - expiration_date
   - created_at
   - updated_at

7. **Settings**
   - key (primary key)
   - value
   - encrypted (boolean)
   - description

8. **Backups**
   - id (primary key)
   - filename
   - size
   - created_at
   - created_by (foreign key to Users)
   - backup_type (auto, manual)
   - status (complete, failed)

9. **Audit_Logs**
   - id (primary key)
   - user_id (foreign key to Users)
   - action
   - resource_type
   - resource_id
   - details (JSON)
   - ip_address
   - timestamp

This structure provides a solid foundation for implementing all the required features while maintaining good separation of concerns and scalability for future enhancements. The modular approach allows for easy extension and maintenance as the project evolves.
