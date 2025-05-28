#!/bin/bash

# Development script for CaddyManager
# This script helps with common development tasks

# Colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to display help
show_help() {
  echo -e "${GREEN}CaddyManager Development Script${NC}"
  echo ""
  echo "Usage: ./dev.sh [command]"
  echo ""
  echo "Commands:"
  echo "  start       - Start all services (backend, frontend, and Caddy)"
  echo "  stop        - Stop all services"
  echo "  restart     - Restart all services"
  echo "  backend     - Start only the backend service"
  echo "  frontend    - Start only the frontend service"
  echo "  caddy       - Start only the Caddy service"
  echo "  logs        - Show logs from all services"
  echo "  test        - Run tests"
  echo "  backup      - Create a development backup"
  echo "  clean       - Clean temporary files and node_modules"
  echo "  help        - Show this help message"
  echo ""
}

# Function to start the backend
start_backend() {
  echo -e "${YELLOW}Starting backend service...${NC}"
  cd backend && npm run dev &
  echo $! > .backend.pid
  echo -e "${GREEN}Backend started at http://localhost:3000${NC}"
}

# Function to start the frontend
start_frontend() {
  echo -e "${YELLOW}Starting frontend service...${NC}"
  cd frontend && npm run dev &
  echo $! > .frontend.pid
  echo -e "${GREEN}Frontend started at http://localhost:5173${NC}"
}

# Function to start Caddy
start_caddy() {
  echo -e "${YELLOW}Starting Caddy service...${NC}"
  mkdir -p logs/caddy
  caddy run --config Caddyfile &
  echo $! > .caddy.pid
  echo -e "${GREEN}Caddy started at http://localhost:8080${NC}"
}

# Function to stop a service by pid file
stop_service() {
  if [ -f ".$1.pid" ]; then
    PID=$(cat ".$1.pid")
    echo -e "${YELLOW}Stopping $1 service (PID: $PID)...${NC}"
    kill $PID 2>/dev/null || true
    rm ".$1.pid"
    echo -e "${GREEN}$1 service stopped${NC}"
  else
    echo -e "${RED}$1 service is not running${NC}"
  fi
}

# Function to start all services
start_all() {
  echo -e "${GREEN}Starting all services...${NC}"
  start_backend
  start_frontend
  start_caddy
  echo -e "${GREEN}All services started. Access CaddyManager at http://localhost:8080${NC}"
}

# Function to stop all services
stop_all() {
  echo -e "${YELLOW}Stopping all services...${NC}"
  stop_service backend
  stop_service frontend
  stop_service caddy
  echo -e "${GREEN}All services stopped${NC}"
}

# Function to show logs
show_logs() {
  echo -e "${YELLOW}Showing logs from all services...${NC}"
  echo -e "${GREEN}Press Ctrl+C to exit logs${NC}"
  tail -f backend/logs/*.log frontend/logs/*.log logs/caddy/*.log 2>/dev/null
}

# Function to run tests
run_tests() {
  echo -e "${YELLOW}Running tests...${NC}"
  cd backend && npm test
  cd ../frontend && npm test
  echo -e "${GREEN}Tests completed${NC}"
}

# Function to create a development backup
create_backup() {
  echo -e "${YELLOW}Creating development backup...${NC}"
  mkdir -p backups
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  BACKUP_FILE="backups/dev_backup_$TIMESTAMP.json"
  
  # Use the API to create a backup if the backend is running
  if [ -f ".backend.pid" ]; then
    curl -X POST http://localhost:3000/api/backups \
      -H "Authorization: Bearer $(cat .dev_token 2>/dev/null || echo 'missing_token')" \
      -o "$BACKUP_FILE"
    echo -e "${GREEN}Backup created at $BACKUP_FILE${NC}"
  else
    echo -e "${RED}Backend is not running. Cannot create backup.${NC}"
  fi
}

# Function to clean temporary files
clean() {
  echo -e "${YELLOW}Cleaning temporary files...${NC}"
  find . -name "node_modules" -type d -prune -exec rm -rf '{}' \;
  find . -name ".pid" -type f -delete
  find . -name "*.log" -type f -delete
  echo -e "${GREEN}Cleaned temporary files${NC}"
}

# Main script logic
case "$1" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
    start_all
    ;;
  backend)
    start_backend
    ;;
  frontend)
    start_frontend
    ;;
  caddy)
    start_caddy
    ;;
  logs)
    show_logs
    ;;
  test)
    run_tests
    ;;
  backup)
    create_backup
    ;;
  clean)
    clean
    ;;
  help|*)
    show_help
    ;;
esac
