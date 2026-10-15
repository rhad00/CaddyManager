#!/usr/bin/env bash
# Smoke test of the documented quick install: docker-compose.ghcr.yml + a generated .env + `up -d`,
# then a real login (CSRF token, cookie) through the frontend. CI runs it with images it just built;
# set REGISTRY to wherever the three images (caddymanager-caddy/-backend/-frontend) are tagged.
#
#   REGISTRY=local FRONTEND_PORT=18080 CADDY_HTTP_PORT=18081 CADDY_HTTPS_PORT=18443 scripts/smoke-install.sh
set -euo pipefail

REGISTRY=${REGISTRY:-ghcr.io/rhad00}
FRONTEND_PORT=${FRONTEND_PORT:-8080}
CADDY_HTTP_PORT=${CADDY_HTTP_PORT:-80}
CADDY_HTTPS_PORT=${CADDY_HTTPS_PORT:-443}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
PROJECT=cmsmoke

compose() { docker compose -p "$PROJECT" -f "$WORK/docker-compose.ghcr.yml" -f "$WORK/ports.yml" "$@"; }
cleanup() { compose down -v >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

cp "$ROOT/docker-compose.ghcr.yml" "$WORK/"
printf 'JWT_SECRET=%s\nCSRF_SECRET=%s\nGIT_SECRET_KEY=%s\nENCRYPTION_KEY=%s\nREGISTRY=%s\n' \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$REGISTRY" > "$WORK/.env"
cat > "$WORK/ports.yml" <<EOF
services:
  caddy:
    ports: !override ["${CADDY_HTTP_PORT}:80", "${CADDY_HTTPS_PORT}:443"]
  frontend:
    ports: !override ["${FRONTEND_PORT}:80"]
EOF

cd "$WORK"
compose up -d

echo "Waiting for the backend behind the frontend..."
for _ in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${FRONTEND_PORT}/api/csrf-token" || true)" = "200" ] && break
  sleep 1
done
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${FRONTEND_PORT}/")" = "200" ] || { echo "UI does not answer"; compose logs; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${CADDY_HTTP_PORT}/")" = "503" ] || { echo "Caddy does not answer with its placeholder page"; compose logs caddy; exit 1; }

# The first admin password is announced once in the backend log
PASSWORD=$(compose logs backend 2>&1 | grep -A1 "AUTO-GENERATED ADMIN PASSWORD" | tail -1 | sed 's/^.*| *//' | tr -d '[:space:]')
[ -n "$PASSWORD" ] || { echo "No generated admin password in the backend log"; compose logs backend; exit 1; }

JAR="$WORK/jar.txt"
CSRF=$(curl -s -c "$JAR" "http://127.0.0.1:${FRONTEND_PORT}/api/csrf-token" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')
STATUS=$(curl -s -b "$JAR" -c "$JAR" -o "$WORK/login.json" -w '%{http_code}' -X POST "http://127.0.0.1:${FRONTEND_PORT}/api/auth/login" \
  -H 'Content-Type: application/json' -H "x-csrf-token: ${CSRF}" \
  -d "{\"email\":\"admin@caddymanager.local\",\"password\":\"${PASSWORD}\"}")
[ "$STATUS" = "200" ] && grep -q '"token"' "$WORK/login.json" || { echo "Login failed (HTTP $STATUS)"; cat "$WORK/login.json"; compose logs backend; exit 1; }

echo "Quick install works: UI, Caddy, backend and login."
