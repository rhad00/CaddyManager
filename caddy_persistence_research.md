# Caddy Configuration Persistence and Docker Compose Deployment Research

## Overview

This document outlines best practices for ensuring Caddy configuration persistence across Docker container restarts and creating a robust Docker Compose deployment for CaddyManager.

## Caddy Configuration Persistence

### How Caddy Stores Configuration

Caddy has several important directories and files that need to be persisted:

1. **Caddy Data Directory**: By default, this is `/data` in the Caddy Docker container
   - Contains certificates, certificate keys, and other TLS data
   - Contains the Caddy configuration as JSON (admin API state)

2. **Configuration File**: The Caddyfile or JSON config used to initialize Caddy
   - Initial configuration loaded at startup
   - Can be overridden by admin API changes

3. **Admin API State**: Caddy's current running configuration
   - Accessible and modifiable via the admin API
   - Changes made via API are not automatically persisted to disk

### Best Practices for Persistence

1. **Volume Mounts**:
   - Mount `/data` directory to persist certificates and TLS data
   - Mount `/config` directory if using a Caddyfile for initial configuration
   - Example:
     ```yaml
     volumes:
       - caddy_data:/data
       - caddy_config:/config
     ```

2. **Configuration Loading Strategy**:
   - **Initial Load**: Use a Caddyfile or JSON config for initial setup
   - **Runtime Updates**: Use the admin API for dynamic updates
   - **Persistence**: Save configuration changes to a database or file

3. **Handling Container Restarts**:
   - On container start, check if a saved configuration exists
   - If it exists, load it using the admin API
   - If not, use the default configuration

## Admin API for Configuration Management

### Key Endpoints

1. **GET /config/**: Retrieve the current Caddy configuration
   - Returns the full configuration as JSON

2. **POST /load**: Load a complete configuration
   - Replaces the entire configuration
   - Requires the full configuration to be provided

3. **PATCH /config/...**: Update part of the configuration
   - Modifies only the specified part of the configuration
   - More efficient for small changes
   - Example: `PATCH /config/apps/http/servers/srv0/routes/0`

### Best Practices for API Usage

1. **For Adding/Updating Proxies**:
   - Use `PATCH /config/apps/http/servers/srv0/routes` to add a new route
   - Use `PATCH /config/apps/http/servers/srv0/routes/N` to update an existing route
   - Store the route index for each proxy in the database

2. **For Removing Proxies**:
   - Use `DELETE /config/apps/http/servers/srv0/routes/N` to remove a route
   - Update the stored route indices for remaining proxies

3. **For Bulk Updates**:
   - Use `GET /config/` to retrieve the current configuration
   - Modify the configuration as needed
   - Use `POST /load` to apply the updated configuration

## Docker Compose Deployment

### Container Structure

For a production-ready deployment, we should use a multi-container setup:

1. **Caddy Container**:
   - Official Caddy Docker image
   - Exposed ports: 80, 443, 2019 (admin API)
   - Mounted volumes for data persistence

2. **Backend Container**:
   - Node.js application
   - Connected to Caddy via internal network
   - Access to Caddy's admin API

3. **Frontend Container**:
   - React application
   - Served by Caddy or a separate web server
   - Static assets can be built and served by Caddy

4. **Database Container**:
   - PostgreSQL or SQLite
   - Persistent volume for data storage

### Network Configuration

1. **Internal Network**:
   - Connect all containers to an internal network
   - Allow backend to communicate with Caddy's admin API
   - Allow backend to communicate with database

2. **External Access**:
   - Expose only necessary ports (80, 443) to the host
   - Keep admin API (2019) internal or secured

### Volume Configuration

1. **Caddy Data**:
   - Named volume for Caddy data: `caddy_data:/data`
   - Contains certificates and TLS data

2. **Caddy Config**:
   - Named volume for Caddy config: `caddy_config:/config`
   - Contains Caddyfile or JSON config

3. **Database Data**:
   - Named volume for database: `db_data:/var/lib/postgresql/data`
   - Ensures database persistence

## Implementation Strategy for CaddyManager

### 1. Database Schema Updates

Add fields to the Proxy model to track Caddy configuration:

```javascript
const Proxy = sequelize.define('Proxy', {
  // Existing fields...
  
  // New fields for Caddy config tracking
  caddy_route_id: {
    type: DataTypes.STRING,
    allowNull: true,
    description: 'ID of the route in Caddy config'
  },
  caddy_route_index: {
    type: DataTypes.INTEGER,
    allowNull: true,
    description: 'Index of the route in Caddy config'
  }
});
```

### 2. Caddy Service Updates

Modify the Caddy service to handle configuration persistence:

1. **Initialize Configuration**:
   - On service start, check if a saved configuration exists in the database
   - If it exists, load it using the admin API
   - If not, use the default configuration

2. **Update Configuration**:
   - When adding a proxy, use PATCH to add a route and store the route index
   - When updating a proxy, use PATCH to update the specific route
   - When deleting a proxy, use DELETE to remove the route

3. **Backup Configuration**:
   - Periodically save the full configuration to the database
   - Include this in the backup/restore functionality

### 3. Docker Compose Updates

Update the docker-compose.yml file:

```yaml
version: '3.8'

services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - caddy_net

  backend:
    build:
      context: ./backend
    restart: unless-stopped
    depends_on:
      - db
    environment:
      - NODE_ENV=production
      - DB_HOST=db
      - CADDY_API_URL=http://caddy:2019
    networks:
      - caddy_net
      - backend_net

  frontend:
    build:
      context: ./frontend
    restart: unless-stopped
    networks:
      - caddy_net

  db:
    image: postgres:13
    restart: unless-stopped
    environment:
      - POSTGRES_PASSWORD=password
      - POSTGRES_USER=caddymanager
      - POSTGRES_DB=caddymanager
    volumes:
      - db_data:/var/lib/postgresql/data
    networks:
      - backend_net

networks:
  caddy_net:
  backend_net:

volumes:
  caddy_data:
  caddy_config:
  db_data:
```

## Conclusion

By implementing these best practices, CaddyManager will have robust configuration persistence across Docker container restarts and a production-ready Docker Compose deployment. The key aspects are:

1. Proper volume mounts for Caddy data and configuration
2. Strategic use of the admin API for configuration updates
3. Database tracking of Caddy configuration state
4. Multi-container setup with appropriate networking
5. Initialization and recovery procedures for container restarts
