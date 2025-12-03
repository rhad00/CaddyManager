# Feature Implementation Tracker

This document tracks the implementation progress of new features for CaddyManager.

## Implementation Status

Legend:
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Completed
- ✅ Tested & Documented

---

## Tier 1: Game-Changing Features

### 1. Docker/Kubernetes Auto-Discovery & Service Sync
**Status:** 🟢 Completed (Docker) / 🔴 K8s Pending
**Started:** 2025-12-01
**Completed:** 2025-12-01 (Docker portion)
**Priority:** High
**Complexity:** High

**Implementation Checklist:**
- [x] Create database model: `DiscoveredService`
- [x] Implement `dockerDiscoveryService.js`
- [ ] Implement `kubernetesDiscoveryService.js` (deferred)
- [x] Create API routes: `/api/discovery`
- [ ] Create frontend component: `DiscoveredServices.jsx` (pending)
- [x] Add environment variables
- [x] Update Docker Compose for socket mount
- [ ] Write integration tests
- [ ] Update README.md
- [x] Update CLAUDE.md

**Dependencies Added:**
- [x] dockerode ^4.0.2
- [x] @kubernetes/client-node ^0.21.0

**Files Created/Modified:**
- ✅ `backend/src/models/discoveredService.js` - Database model
- ✅ `backend/src/services/dockerDiscoveryService.js` - Docker discovery service
- ✅ `backend/src/api/discovery/routes.js` - REST API endpoints
- ✅ `backend/src/models/index.js` - Added DiscoveredService export
- ✅ `backend/src/app.js` - Registered discovery routes
- ✅ `backend/src/index.js` - Integrated startup logic
- ✅ `backend/package.json` - Added dependencies
- ✅ `docker-compose.yml` - Added Docker socket mount and env vars

**API Endpoints Created:**
- `GET /api/discovery` - List all discovered services
- `GET /api/discovery/status` - Get discovery service status
- `GET /api/discovery/:id` - Get single service details
- `POST /api/discovery/:id/sync` - Manually sync a service
- `POST /api/discovery/:id/disable` - Disable auto-management
- `POST /api/discovery/:id/enable` - Enable auto-management
- `DELETE /api/discovery/:id` - Delete discovered service
- `POST /api/discovery/scan` - Trigger manual scan

**Environment Variables:**
- `ENABLE_DOCKER_DISCOVERY` - Enable/disable Docker discovery (default: false)
- `ENABLE_K8S_DISCOVERY` - Enable/disable Kubernetes discovery (default: false)
- `DOCKER_LABEL_PREFIX` - Label prefix for discovery (default: caddymanager)
- `AUTO_REMOVE_STOPPED` - Auto-remove proxies when container stops (default: false)
- `DOCKER_POLL_INTERVAL` - Reconciliation interval in ms (default: 30000)

**Docker Labels Supported:**
- `caddymanager.enable=true` - Enable auto-discovery
- `caddymanager.domain=api.example.com` - Domain to proxy
- `caddymanager.port=3000` - Container port
- `caddymanager.ssl=cloudflare|acme|none` - SSL type
- `caddymanager.template=authelia` - Apply template
- `caddymanager.security_headers=true` - Enable security headers
- `caddymanager.compression=false` - Disable compression
- `caddymanager.websocket=true` - Enable WebSocket support

**How It Works:**
1. Backend monitors Docker events (start, stop, die, destroy)
2. When container with `caddymanager.enable=true` starts, creates proxy automatically
3. Proxy configuration pulled from container labels
4. Templates can be auto-applied via label
5. When container stops, proxy can be auto-removed (configurable)
6. Periodic reconciliation cleans up stale entries
7. All discovered services tracked in `discovered_services` table

**Testing:**
To test manually:
```bash
# Enable Docker discovery
echo "ENABLE_DOCKER_DISCOVERY=true" >> .env

# Restart backend
docker-compose restart backend

# Run a test container with labels
docker run -d \
  --label caddymanager.enable=true \
  --label caddymanager.domain=test.local \
  --label caddymanager.port=80 \
  --label caddymanager.ssl=none \
  --name test-app \
  nginx:alpine

# Check discovered services
curl http://localhost:3000/api/discovery \
  -H "Authorization: Bearer <token>"
```

**Notes:**
- Requires Docker socket access via volume mount
- K8s support requires kubeconfig or in-cluster config (not yet implemented)
- Auto-sync interval configurable via env vars
- Service logs all discovery events via Winston
- Discovered services can be manually managed via API

---

### 2. Configuration as Code + Git Integration (GitOps)
**Status:** 🟢 Completed (Backend) / 🔴 Frontend Pending
**Started:** 2025-12-01
**Completed:** 2025-12-01 (Backend portion)
**Priority:** High
**Complexity:** High

**Implementation Checklist:**
- [x] Create database models: `GitRepository`, `ConfigChange`
- [x] Implement `gitService.js`
- [x] Create API routes: `/api/git`
- [ ] Create frontend component: `GitIntegration.jsx` (pending)
- [x] Add Git hooks to proxy operations
- [x] Implement encryption for tokens (AES-256-GCM)
- [x] Add rollback functionality
- [ ] Write integration tests
- [ ] Update README.md
- [ ] Update CLAUDE.md

**Dependencies Added:**
- [x] simple-git ^3.25.0
- [x] js-yaml ^4.1.0

**Files Created/Modified:**
- ✅ `backend/src/models/gitRepository.js` - Git repository model
- ✅ `backend/src/models/configChange.js` - Configuration change audit model
- ✅ `backend/src/services/gitService.js` - Git service with encryption
- ✅ `backend/src/api/git/routes.js` - REST API endpoints
- ✅ `backend/src/api/proxies/routes.js` - Added Git commit hooks
- ✅ `backend/src/models/index.js` - Added GitRepository and ConfigChange exports
- ✅ `backend/src/app.js` - Registered Git routes
- ✅ `backend/src/index.js` - Integrated startup logic
- ✅ `backend/package.json` - Added dependencies

**API Endpoints Created:**
- `GET /api/git/repositories` - List all connected repositories
- `GET /api/git/repositories/:id` - Get single repository details
- `POST /api/git/repositories` - Connect new Git repository
- `PUT /api/git/repositories/:id` - Update repository settings
- `DELETE /api/git/repositories/:id` - Remove repository connection
- `POST /api/git/repositories/:id/sync` - Manually sync from Git (GitOps)
- `POST /api/git/repositories/:id/test` - Test repository connection
- `GET /api/git/history` - Get commit history (filtered by resource)
- `GET /api/git/repositories/:id/diff` - Get diff between commits
- `POST /api/git/repositories/:id/rollback` - Rollback to specific commit
- `POST /api/git/repositories/:id/export` - Manually export configuration

**Environment Variables:**
- `GIT_REPO_DIR` - Directory for cloned repositories (default: `./git-repos`)
- `GIT_SECRET_KEY` - 32-byte hex key for encrypting tokens (required for production)

**Git Providers Supported:**
- GitHub (token authentication)
- GitLab (token authentication)
- Gitea (token authentication)
- Bitbucket (token authentication)

**Features Implemented:**
1. **Automatic Export**: Auto-commit configuration changes to Git on proxy create/update/delete
2. **GitOps Mode**: Pull configuration from Git and auto-apply (with sync interval)
3. **Encryption**: AES-256-GCM encryption for access tokens and SSH keys
4. **Configuration Export**: Export to both JSON (machine-readable) and YAML (human-readable)
5. **Audit Trail**: Track all changes with commit SHA, diff, old/new values
6. **Rollback**: Restore configuration to any previous commit
7. **Diff Viewer**: Compare configuration between commits
8. **Commit History**: View all changes with user attribution
9. **Template Messages**: Customizable commit message templates
10. **Auto-Sync**: Scheduled pulling from Git for GitOps workflows

**How It Works:**
1. **Auto-Commit Mode**: On proxy CRUD operations, export config to files and commit to Git
2. **GitOps Mode**: Periodically pull from Git and apply changes to CaddyManager
3. **Exported Files**:
   - `config/proxies.json` - Machine-readable proxy configuration
   - `config/proxies.yaml` - Human-readable proxy configuration
   - `config/caddy.json` - Complete Caddy server configuration
   - `config/metadata.json` - Export metadata and version info
4. **Change Types Tracked**: `proxy_create`, `proxy_update`, `proxy_delete`, `template_apply`, `backup_restore`, `manual`
5. **Security**: Tokens encrypted at rest, never exposed in API responses

**Testing:**
To test manually:
```bash
# Set Git secret key
echo "GIT_SECRET_KEY=$(openssl rand -hex 32)" >> .env

# Restart backend
docker-compose restart backend

# Connect a Git repository
curl -X POST http://localhost:3000/api/git/repositories \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Config",
    "provider": "github",
    "repository_url": "https://github.com/user/caddy-config",
    "branch": "main",
    "access_token": "ghp_xxxxx",
    "auto_commit": true,
    "auto_sync": false,
    "commit_message_template": "CaddyManager: {{changes}}"
  }'

# Create a proxy (will auto-commit)
curl -X POST http://localhost:3000/api/proxies \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test API",
    "domains": ["api.test.com"],
    "upstream_url": "http://backend:3000",
    "ssl_type": "acme"
  }'

# Check commit history
curl http://localhost:3000/api/git/history \
  -H "Authorization: Bearer <token>"

# Manually sync from Git (GitOps)
curl -X POST http://localhost:3000/api/git/repositories/{id}/sync \
  -H "Authorization: Bearer <token>"
```

**Notes:**
- Git secret key must be set in production for token persistence across restarts
- GitOps mode replaces ALL proxies with configuration from Git (destructive sync)
- Git operations don't block proxy API requests (errors are logged but don't fail requests)
- Auto-sync interval configurable per repository (default: 300 seconds)
- Service logs all Git operations via Winston
- Commit messages can use templates with `{{changes}}` placeholder
- Rollback creates safety branches before applying old commits

---

### 3. Real-Time Traffic Inspector & Request Debugger
**Status:** 🔴 Not Started
**Priority:** High
**Complexity:** Medium

**Implementation Checklist:**
- [ ] Update Caddy config for structured logging
- [ ] Implement `trafficInspectorService.js`
- [ ] Create WebSocket server
- [ ] Create API routes: `/api/traffic`
- [ ] Create frontend component: `TrafficInspector.jsx`
- [ ] Implement HAR export
- [ ] Add request filtering
- [ ] Write tests
- [ ] Update documentation

**Dependencies:**
- [ ] tail
- [ ] ws (WebSocket)

---

### 4. Advanced Load Balancing & Health Checks
**Status:** 🔴 Not Started
**Priority:** Medium
**Complexity:** Medium

**Implementation Checklist:**
- [ ] Create database model: `Upstream`
- [ ] Update `caddyService.js` for upstream config
- [ ] Implement `healthCheckService.js`
- [ ] Create API routes: `/api/upstreams`
- [ ] Update ProxyForm component
- [ ] Add health check monitoring UI
- [ ] Write tests
- [ ] Update documentation

---

### 5. CLI Tool & Infrastructure as Code Support
**Status:** 🔴 Not Started
**Priority:** High
**Complexity:** Medium

**Implementation Checklist:**
- [ ] Create `cli/` directory structure
- [ ] Implement CLI commands
- [ ] Create API client wrapper
- [ ] Implement YAML/JSON parser
- [ ] Add declarative config support
- [ ] Create Terraform provider (optional)
- [ ] Write CLI documentation
- [ ] Publish to npm

**Dependencies:**
- [ ] commander
- [ ] inquirer
- [ ] yaml

---

## Tier 2: High-Value Advanced Features

### 6. Configuration Import/Migration Tool
**Status:** 🔴 Not Started
**Priority:** Medium
**Complexity:** High

### 7. WAF Integration (Web Application Firewall)
**Status:** 🔴 Not Started
**Priority:** Medium
**Complexity:** High

### 8. TCP/UDP Stream Support
**Status:** 🔴 Not Started
**Priority:** Low
**Complexity:** Medium

### 9. Staging/Testing Mode for Configuration
**Status:** 🔴 Not Started
**Priority:** Low
**Complexity:** Low

### 10. Advanced Logging & Analytics
**Status:** 🔴 Not Started
**Priority:** Medium
**Complexity:** Medium

---

## Documentation Updates Required

### After Each Feature:
- [ ] Update README.md with new feature description
- [ ] Update CLAUDE.md with implementation details
- [ ] Update API documentation
- [ ] Add feature to changelog
- [ ] Update environment variables reference
- [ ] Create feature-specific documentation in `/docs`

---

## Testing Requirements

### Per Feature:
- [ ] Unit tests for services
- [ ] Integration tests for API endpoints
- [ ] E2E tests for UI components
- [ ] Manual testing checklist
- [ ] Performance testing (if applicable)

---

## Deployment Considerations

### Per Feature:
- [ ] Database migrations
- [ ] Environment variable updates
- [ ] Docker Compose changes
- [ ] Backward compatibility check
- [ ] Upgrade path documentation

---

## Current Sprint: Docker/Kubernetes Auto-Discovery

**Sprint Goal:** Implement automatic service discovery from Docker containers and Kubernetes services

**Tasks:**
1. ✅ Design database schema
2. 🟡 Implement Docker discovery service
3. ⏳ Implement Kubernetes discovery service
4. ⏳ Create API endpoints
5. ⏳ Build frontend UI
6. ⏳ Write tests
7. ⏳ Update documentation

**Blockers:** None

**Next Steps:**
1. Create database migration for DiscoveredService model
2. Implement dockerDiscoveryService with event watching
3. Test with sample Docker containers

---

*Last Updated: 2025-12-01*
