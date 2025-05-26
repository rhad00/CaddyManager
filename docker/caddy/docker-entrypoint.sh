#!/bin/sh
set -e

# Start Caddy in the background
/usr/bin/caddy start --config /etc/caddy/Caddyfile &

# Wait for Caddy's API to be available
while ! nc -z localhost 2019; do
  sleep 1
done

# Load saved configuration if it exists (this will use our config/apps/persist endpoint)
curl -X POST http://localhost:2019/config/apps/persist/load || true

# Keep the container running
exec tail -f /dev/null
