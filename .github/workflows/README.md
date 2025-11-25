# GitHub Actions Workflows

This directory contains the CI/CD workflows for CaddyManager.

## Workflows Overview

### 1. `version-and-release.yml` - Version Bump and Release
**Trigger:** Push to `main` branch or manual dispatch

**Purpose:** Automated version management, Docker image building, and GitHub releases

**Jobs:**
1. **version-bump**: Uses Cocogitto to analyze conventional commits and create version tags
   - Checks for new commits requiring a version bump
   - Creates a new semantic version tag
   - **Pushes the tag to the repository** (fixes the previous issue where tags weren't pushed)
   - Outputs the new version for downstream jobs

2. **build-and-push-images**: Builds and pushes Docker images (only if new version created)
   - Builds multi-platform images (linux/amd64, linux/arm64)
   - Tags images with:
     - Semantic version (e.g., `v1.2.3`)
     - Major.minor version (e.g., `1.2`)
     - Major version (e.g., `1`)
     - Git SHA (e.g., `abc1234`)
     - `latest` tag
   - Pushes to GitHub Container Registry (ghcr.io)
   - Uses layer caching for faster builds
   - Builds three images:
     - `caddymanager-backend`
     - `caddymanager-caddy`
     - `caddymanager-frontend`

3. **create-release**: Creates a GitHub release (only if new version created)
   - Extracts changelog for the specific version
   - Creates a GitHub release with release notes
   - Auto-generates additional release notes from commits

### 2. `ci.yml` - Continuous Integration (Lint and Test)
**Trigger:** 
- Pull requests to `dev` or `main` branches
- Push to `dev` branch (NOT main - main only runs version-and-release)

**Purpose:** Run linting and tests on non-main branches

**Jobs:**
1. **lint-and-test**: Runs quality checks
   - Installs dependencies for frontend and backend
   - Lints frontend code
   - Runs frontend tests
   - Builds frontend
   - Runs backend unit tests
   - Runs backend integration tests

## Workflow Flow

### When a PR is merged to main:
1. `version-and-release.yml` triggers
2. Cocogitto analyzes commits since last tag
3. If conventional commits found (feat:, fix:, etc.):
   - Creates new version tag
   - **Pushes tag to repository** ✅
   - Builds Docker images with multiple tags
   - Pushes images to ghcr.io
   - Creates GitHub release with changelog

### When working on feature branches:
1. Create PR to `dev` or `main`
2. `ci.yml` runs automatically
3. Linting and tests must pass
4. No Docker images are built (saves time and resources)

## Docker Image Tags

Each successful release creates images with the following tags:
- `ghcr.io/OWNER/caddymanager-backend:v1.2.3` (semantic version)
- `ghcr.io/OWNER/caddymanager-backend:1.2` (major.minor)
- `ghcr.io/OWNER/caddymanager-backend:1` (major)
- `ghcr.io/OWNER/caddymanager-backend:abc1234` (git SHA)
- `ghcr.io/OWNER/caddymanager-backend:latest`

Same pattern applies to `caddymanager-caddy` and `caddymanager-frontend`.

## Conventional Commits

To trigger version bumps, use conventional commit messages:

- `feat: add new feature` → Minor version bump (1.0.0 → 1.1.0)
- `fix: resolve bug` → Patch version bump (1.0.0 → 1.0.1)
- `feat!: breaking change` → Major version bump (1.0.0 → 2.0.0)
- `BREAKING CHANGE:` in commit body → Major version bump

See [Conventional Commits](https://www.conventionalcommits.org/) for more details.

## Permissions

The workflows require the following permissions:
- `contents: write` - To push tags and create releases
- `packages: write` - To push Docker images to GHCR
- `id-token: write` - For OIDC authentication

These are configured in the workflow files and should work with the default `GITHUB_TOKEN`.

## Troubleshooting

### Tags not appearing in repository
- Fixed! The `version-and-release.yml` workflow now explicitly pushes tags with `git push origin --tags`

### Docker images not building
- Check that the workflow has `packages: write` permission
- Verify GITHUB_TOKEN has access to push to ghcr.io
- Check Docker build logs in the Actions tab

### Version not bumping
- Ensure commits follow conventional commit format
- Check Cocogitto configuration in `cog.toml`
- Verify commits exist since last tag

### CI failing on main branch
- CI workflow now only runs on `dev` branch and PRs
- Main branch only runs `version-and-release.yml`
