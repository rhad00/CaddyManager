# Certificate Management in Caddy - Research Document

## Overview

This document outlines Caddy's certificate management capabilities and how they can be exposed through CaddyManager's UI for better control and visibility.

## Caddy's Certificate Management Features

### 1. Automatic Certificate Acquisition

Caddy automatically obtains and renews TLS certificates from Let's Encrypt or ZeroSSL by default. Key features:

- **ACME Protocol Support**: Supports both HTTP-01 and TLS-ALPN-01 challenges
- **On-Demand TLS**: Can obtain certificates on first request to a domain
- **Wildcard Certificates**: Supports wildcard certificates via DNS challenge
- **Certificate Renewal**: Automatic renewal before expiration

### 2. Certificate Storage

Caddy stores certificates and private keys in its configured storage:

- **Default Location**: `/data/caddy/certificates` in Docker containers
- **Storage Format**: Certificates are stored in PEM format
- **Storage Backend**: Configurable (file system by default, can use other storage backends)

### 3. Custom Certificates

Caddy supports loading custom certificates:

- **Manual Certificates**: Can load certificates from files
- **Certificate Bundles**: Supports certificate chains
- **Multiple Certificates**: Can serve different certificates for different domains

### 4. Certificate Authorities

Caddy can be configured to use different certificate authorities:

- **Default CAs**: Let's Encrypt and ZeroSSL
- **Custom ACME CAs**: Can use any ACME-compatible CA
- **Self-Signed**: Can generate and use self-signed certificates
- **Internal CAs**: Can use internal/private CAs

### 5. Admin API Endpoints for Certificate Management

Caddy's Admin API provides several endpoints for certificate management:

#### Certificate Information

- `GET /certificates`: List all managed certificates
- `GET /certificates/{cert_id}`: Get details about a specific certificate

#### Certificate Management

- `POST /load/certificates`: Load certificates from files
- `DELETE /certificates/{cert_id}`: Delete a certificate

#### ACME Management

- `GET /acme/accounts`: List ACME accounts
- `POST /acme/accounts`: Register a new ACME account
- `DELETE /acme/accounts/{account_id}`: Delete an ACME account

#### TLS Configuration

- `GET /config/apps/tls`: Get TLS configuration
- `PATCH /config/apps/tls`: Update TLS configuration

## Implementation Strategy for CaddyManager

### 1. Backend API Extensions

New endpoints to add to CaddyManager's backend:

#### Certificate Listing and Details

- `GET /api/certificates`: List all certificates
- `GET /api/certificates/{id}`: Get certificate details
- `GET /api/certificates/domains/{domain}`: Get certificates for a specific domain

#### Certificate Management

- `POST /api/certificates/upload`: Upload custom certificates
- `DELETE /api/certificates/{id}`: Delete a certificate
- `POST /api/certificates/generate`: Generate a self-signed certificate

#### CA Management

- `GET /api/certificates/cas`: List configured CAs
- `POST /api/certificates/cas`: Add a custom CA
- `DELETE /api/certificates/cas/{id}`: Remove a custom CA
- `PUT /api/certificates/cas/{id}/trust`: Trust/untrust a CA

#### ACME Account Management

- `GET /api/certificates/acme/accounts`: List ACME accounts
- `POST /api/certificates/acme/accounts`: Add an ACME account
- `DELETE /api/certificates/acme/accounts/{id}`: Remove an ACME account

### 2. Database Schema Extensions

New models to add to CaddyManager's database:

#### Certificate Model

```javascript
const Certificate = sequelize.define('Certificate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  domains: {
    type: DataTypes.TEXT,
    allowNull: false,
    description: 'Comma-separated list of domains'
  },
  issuer: {
    type: DataTypes.STRING,
    allowNull: false
  },
  valid_from: {
    type: DataTypes.DATE,
    allowNull: false
  },
  valid_to: {
    type: DataTypes.DATE,
    allowNull: false
  },
  certificate_pem: {
    type: DataTypes.TEXT,
    allowNull: true,
    description: 'PEM-encoded certificate'
  },
  private_key_pem: {
    type: DataTypes.TEXT,
    allowNull: true,
    description: 'PEM-encoded private key'
  },
  caddy_cert_id: {
    type: DataTypes.STRING,
    allowNull: true,
    description: 'Certificate ID in Caddy'
  },
  type: {
    type: DataTypes.ENUM('acme', 'uploaded', 'self-signed'),
    allowNull: false,
    defaultValue: 'acme'
  },
  auto_renew: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  status: {
    type: DataTypes.ENUM('valid', 'expired', 'revoked', 'pending'),
    allowNull: false,
    defaultValue: 'valid'
  }
});
```

#### CA Model

```javascript
const CertificateAuthority = sequelize.define('CertificateAuthority', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  url: {
    type: DataTypes.STRING,
    allowNull: true,
    description: 'URL of the ACME directory'
  },
  type: {
    type: DataTypes.ENUM('acme', 'custom'),
    allowNull: false,
    defaultValue: 'acme'
  },
  certificate_pem: {
    type: DataTypes.TEXT,
    allowNull: true,
    description: 'PEM-encoded CA certificate'
  },
  trusted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    description: 'Email for ACME account'
  },
  acme_account_id: {
    type: DataTypes.STRING,
    allowNull: true,
    description: 'ACME account ID in Caddy'
  }
});
```

### 3. Frontend UI Components

New UI components to add to CaddyManager's frontend:

#### Certificate Management Page

- Certificate list with filtering and sorting
- Certificate details view with expiration information
- Upload custom certificate form
- Generate self-signed certificate form
- Certificate renewal controls
- Certificate revocation controls

#### CA Management Page

- CA list with type and trust status
- Add custom CA form
- ACME account management
- CA trust controls

#### Integration with Proxy Management

- Certificate selection in proxy configuration
- Certificate status indicators in proxy list

## Technical Considerations

### 1. Security

- **Private Key Protection**: Ensure private keys are properly secured
- **Access Control**: Restrict certificate management to admin users
- **Audit Logging**: Log all certificate operations

### 2. Performance

- **Caching**: Cache certificate information to reduce API calls
- **Pagination**: Implement pagination for certificate lists

### 3. User Experience

- **Certificate Expiration Warnings**: Notify users of upcoming expirations
- **Guided Workflows**: Step-by-step guides for common certificate operations
- **Validation**: Client-side validation for certificate uploads

### 4. Integration

- **Proxy Integration**: Seamless integration with proxy configuration
- **Backup/Restore**: Include certificates in backup/restore operations

## Implementation Phases

### Phase 1: Core Certificate Management

- Certificate listing and details
- Basic certificate operations (view, delete)
- Certificate status monitoring

### Phase 2: Custom Certificate Support

- Upload custom certificates
- Generate self-signed certificates
- Certificate renewal management

### Phase 3: CA Management

- Custom CA support
- ACME account management
- CA trust management

## Conclusion

Caddy provides robust certificate management capabilities through its Admin API. By extending CaddyManager with a dedicated UI for certificate management, users will gain better visibility and control over their TLS configurations, including support for custom certificates and certificate authorities.
