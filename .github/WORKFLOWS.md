CI/CD Workflows
================

This repository includes three GitHub Actions workflows:


Behavioral notes:
- On `dev` branch and PRs: CI runs linting, tests and verification builds. The `docker-build-push` workflow runs on PRs to verify multi-platform builds but does NOT push images to the registry.
- On `main`: merges run the `cocogitto-trigger` workflow which runs `cog release --yes --push`. If cocogitto decides a new version is required it will push a tag (e.g., `vX.Y.Z`), which then triggers the `release` workflow. The `release` workflow builds and pushes images and creates the GitHub Release with changelog asset.
	- The `release` workflow builds/pushes three images to GHCR: `caddymanager-backend`, `caddymanager-frontend`, and `caddymanager-caddy` (the caddy image is built from `caddy/Dockerfile`). All images are built multi-platform and use registry caching.

- `GITHUB_TOKEN` — provided by GitHub Actions and used for publishing releases and pushing to GHCR. Ensure the workflows have the following permissions in the repository settings: `contents: write`, `packages: write`, `id-token: write` (these are set in the release workflow).

Notes
- cocogitto expects a configured `cog.toml` in the repository root — you mentioned this is already configured.
- The Docker workflows push images to `ghcr.io/<owner>/caddymanager-backend` and `ghcr.io/<owner>/caddymanager-frontend`. Adjust the image names if you prefer a different naming convention.
- If you require additional registry credentials (e.g., Docker Hub), add them to repository secrets and update the `docker/login-action` step.
