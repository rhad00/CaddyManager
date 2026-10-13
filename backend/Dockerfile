FROM node:24-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application code
COPY src/ src/

# Create necessary directories and set ownership
RUN mkdir -p /app/data /app/logs /app/metrics /app/backups /app/config_backups /app/temp /app/git-repos \
    && chown -R node:node /app

# Run as non-root user
USER node

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "src/index.js"]
