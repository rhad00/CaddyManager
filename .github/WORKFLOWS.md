CI/CD Workflows
================

This repository includes three GitHub Actions workflows:


Behavioral notes:
- On `dev` branch and PRs: CI runs linting, tests and verification builds. The `docker-build-push` workflow runs on PRs to verify multi-platform builds but does NOT push images to the registry.
- On `main`: merges run the `cocogitto-trigger` workflow which runs `cog release --yes --push`. If cocogitto decides a new version is required it will push a tag (e.g., `vX.Y.Z`), which then triggers the `release` workflow. The `release` workflow builds and pushes images and creates the GitHub Release with changelog asset.
	- The `release` workflow builds/pushes three images to GHCR: `caddymanager-backend`, `caddymanager-frontend`, and `caddymanager-caddy` (the caddy image is built from `caddy/Dockerfile`). All images are built multi-platform and use registry caching.

- `GITHUB_TOKEN` — provided by GitHub Actions and used for publishing releases and pushing to GHCR. Ensure the workflows have the following permissions in the repository settings: `contents: write`, `packages: write`, `id-token: write` (these are set in the release workflow).

