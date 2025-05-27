FROM caddy:2-alpine

# Install netcat for startup script
RUN apk add --no-cache netcat-openbsd curl

# Copy Caddyfile and startup script
COPY ./docker/caddy/Caddyfile /etc/caddy/Caddyfile
COPY ./docker/caddy/docker-entrypoint.sh /docker-entrypoint.sh

# Make startup script executable
RUN chmod +x /docker-entrypoint.sh

# Expose ports:
# 80 - HTTP
# 443 - HTTPS
# 2019 - Caddy API
EXPOSE 80 443 2019

# Use our startup script
ENTRYPOINT ["/docker-entrypoint.sh"]
