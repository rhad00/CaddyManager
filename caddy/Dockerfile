# Build stage
ARG CADDY_VERSION=2.10.2
FROM caddy:${CADDY_VERSION}-builder AS builder

# Build Caddy with the Cloudflare DNS module and other extensions
RUN set -eux; \
        if command -v xcaddy > /dev/null 2>&1; then \
            xcaddy build \
                --with github.com/caddy-dns/cloudflare \
                --with github.com/WeidiDeng/caddy-cloudflare-ip \
                --with github.com/fvbommel/caddy-combine-ip-ranges \
                --with github.com/mholt/caddy-ratelimit; \
        else \
            echo 'xcaddy not found in builder image; skipping custom build'; \
        fi

# Final stage
FROM caddy:${CADDY_VERSION}

# Copy the custom-built Caddy binary if present
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
