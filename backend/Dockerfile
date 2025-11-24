FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application code
COPY src/ src/

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "src/index.js"]
