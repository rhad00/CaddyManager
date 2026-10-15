CI/CD Workflows
================

Two GitHub Actions workflows live in `.github/workflows/`:

- `ci.yml` runs on pull requests and pushes: linting, the unit/integration tests, the end-to-end suite against a real
  Caddy, PostgreSQL integration runs, and a smoke start of the built images. It never publishes anything.
- `version-and-release.yml` ("Release") runs on every push to `main` and can be started by hand (`workflow_dispatch`).

Release flow
------------

1. `cog check --from-latest-tag` reports commits since the latest release that are not conventional commits. It only
   warns: `cog bump` ignores such commits (they are not in the version bump or the changelog), so a commit pushed
   straight to `main` (the web editor's "Add files via upload") cannot block the release. Pull requests are held to
   the format before they merge: the `conventional-commits` job in `ci.yml` fails on a PR title that is not
   `type(scope): subject` and warns about commits that are not.
2. `scripts/restore-changelog.sh` brings back the accumulated `CHANGELOG.md` (see below).
3. `cog bump --auto` decides the next version from the commit types in `cog.toml` (`feat` = minor; `fix`, `perf`,
   `refactor`, `docs`, `style`, `test`, `build`, `ci`, `revert` = patch; `chore` = no release). With nothing to release
   the workflow stops here. Otherwise it updates the package versions, prepends the new section to `CHANGELOG.md`,
   commits and tags `vX.Y.Z`, and pushes the tag.
4. Three images are built for `linux/amd64` and pushed to GHCR: `caddymanager-backend`, `caddymanager-frontend` and
   `caddymanager-caddy` (built from `caddy/Dockerfile`), tagged `X.Y.Z`, `X.Y`, `X`, the short SHA and `latest`.
5. The GitHub Release is created from `scripts/release-notes.js`:
   - **Summary**: the `## Summary` section of every pull request merged since the previous release (so keep that
     section meaningful in PR descriptions)
   - **What's Changed**: the commits of the release grouped by type
   - links to `CHANGELOG.md` at the tag and to the compare view, and the image references

`main` is protected (pull request, review and signed commits required), so the release job cannot commit to it. The
bump commit, with the changelog and the package versions, is only tagged. Each release's `CHANGELOG.md` therefore lives
on its tag (`blob/vX.Y.Z/CHANGELOG.md`) and holds the full history; the copy on `main` is only refreshed by a pull
request.

To keep a change out of the next release or to avoid triggering one, use the `chore` type (for example
`chore(readme): ...`). A squash-merge uses the pull request title and a rebase-merge keeps the commits, so both must
be conventional.

Secrets and permissions
-----------------------

- `GITHUB_TOKEN` publishes the release and pushes to GHCR. The workflow sets `contents: write`, `packages: write`,
  `pull-requests: read`, `id-token: write` and `attestations: write`.
- `RELEASE_TOKEN` (optional personal access token) is used to push the tag so that it can trigger other workflows.
