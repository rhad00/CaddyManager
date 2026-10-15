# --- Build: compile src/ (TypeScript and JavaScript) to dist/ ----------------------
FROM node:24-slim AS build

WORKDIR /app

# Dev dependencies are needed here for the TypeScript compiler and the @types packages
COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src/ src/
RUN npm run build

# --- Run -------------------------------------------------------------------------
FROM node:24-slim

# openssl CLI is used to generate self-signed certificates (certificateService);
# git + ca-certificates for GitOps (simple-git runs the git binary, over https)
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# The compiled application (migrations and API documentation comments included)
COPY --from=build /app/dist/ dist/

# Create necessary directories and set ownership
RUN mkdir -p /app/data /app/logs /app/metrics /app/backups /app/config_backups /app/temp /app/git-repos \
    && chown -R node:node /app

# Run as non-root user
USER node

# Expose port
EXPOSE 3000

# Start the application (source maps give stack traces in terms of src/)
CMD ["node", "--enable-source-maps", "dist/index.js"]
