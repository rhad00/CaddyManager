#!/bin/bash

# Validation script for Caddy configuration persistence and Docker deployment
# This script tests the persistence of Caddy configuration across container restarts

# Colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Testing Caddy configuration persistence and Docker deployment...${NC}"

# Function to wait for a service to be ready
wait_for_service() {
  local service=$1
  local max_attempts=$2
  local attempt=1
  
  echo -e "Waiting for $service to be ready..."
  
  while [ $attempt -le $max_attempts ]; do
    if curl -s "http://localhost:$service" > /dev/null; then
      echo -e "${GREEN}✓ $service is ready${NC}"
      return 0
    fi
    
    echo -e "Attempt $attempt/$max_attempts: $service not ready yet, waiting..."
    sleep 5
    attempt=$((attempt + 1))
  done
  
  echo -e "${RED}✗ $service failed to become ready after $max_attempts attempts${NC}"
  return 1
}

# Test 1: Start the Docker Compose environment
echo -e "\nTest 1: Starting Docker Compose environment"
docker-compose down -v
docker-compose up -d

# Wait for services to be ready
wait_for_service 80 12 || exit 1

# Get authentication token
echo -e "\nAuthenticating..."
LOGIN_RESULT=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@caddymanager.local","password":"changeme123"}')

if echo "$LOGIN_RESULT" | grep -q "token"; then
  echo -e "${GREEN}✓ Authentication successful${NC}"
  TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"token":"[^"]*' | sed 's/"token":"//')
else
  echo -e "${RED}✗ Authentication failed${NC}"
  exit 1
fi

# Test 2: Create a test proxy
echo -e "\nTest 2: Creating a test proxy"
CREATE_RESULT=$(curl -s -X POST http://localhost/api/proxies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name":"Persistence Test Proxy",
    "domains":"persistence-test.local",
    "upstream_url":"http://localhost:8000",
    "ssl_type":"none",
    "compression_enabled":true,
    "headers":[
      {"name":"X-Test-Header","value":"test-value","type":"request"}
    ],
    "middlewares":[
      {"type":"rate_limit","config":{"rate":"10","unit":"second"}}
    ]
  }')

if echo "$CREATE_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ Test proxy created successfully${NC}"
  PROXY_ID=$(echo "$CREATE_RESULT" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
  echo -e "Proxy ID: $PROXY_ID"
else
  echo -e "${RED}✗ Failed to create test proxy${NC}"
  exit 1
fi

# Test 3: Verify Caddy configuration
echo -e "\nTest 3: Verifying Caddy configuration"
CADDY_CONFIG=$(docker-compose exec caddy curl -s http://localhost:2019/config/)

if echo "$CADDY_CONFIG" | grep -q "persistence-test.local"; then
  echo -e "${GREEN}✓ Proxy configuration found in Caddy${NC}"
else
  echo -e "${RED}✗ Proxy configuration not found in Caddy${NC}"
  exit 1
fi

# Test 4: Restart Caddy container
echo -e "\nTest 4: Restarting Caddy container"
docker-compose restart caddy
sleep 10

# Test 5: Verify configuration persistence after restart
echo -e "\nTest 5: Verifying configuration persistence after restart"
CADDY_CONFIG_AFTER=$(docker-compose exec caddy curl -s http://localhost:2019/config/)

if echo "$CADDY_CONFIG_AFTER" | grep -q "persistence-test.local"; then
  echo -e "${GREEN}✓ Proxy configuration persisted after Caddy restart${NC}"
else
  echo -e "${RED}✗ Proxy configuration lost after Caddy restart${NC}"
  exit 1
fi

# Test 6: Update the test proxy
echo -e "\nTest 6: Updating the test proxy"
UPDATE_RESULT=$(curl -s -X PUT http://localhost/api/proxies/$PROXY_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name":"Updated Persistence Test Proxy",
    "domains":"persistence-test.local,persistence-test-2.local",
    "upstream_url":"http://localhost:8001",
    "ssl_type":"none",
    "compression_enabled":true,
    "headers":[
      {"name":"X-Test-Header","value":"updated-value","type":"request"},
      {"name":"X-Added-Header","value":"new-value","type":"response"}
    ],
    "middlewares":[
      {"type":"rate_limit","config":{"rate":"20","unit":"second"}}
    ]
  }')

if echo "$UPDATE_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ Test proxy updated successfully${NC}"
else
  echo -e "${RED}✗ Failed to update test proxy${NC}"
  exit 1
fi

# Test 7: Verify updated configuration
echo -e "\nTest 7: Verifying updated configuration"
CADDY_CONFIG_UPDATED=$(docker-compose exec caddy curl -s http://localhost:2019/config/)

if echo "$CADDY_CONFIG_UPDATED" | grep -q "persistence-test-2.local"; then
  echo -e "${GREEN}✓ Updated proxy configuration found in Caddy${NC}"
else
  echo -e "${RED}✗ Updated proxy configuration not found in Caddy${NC}"
  exit 1
fi

# Test 8: Restart all containers
echo -e "\nTest 8: Restarting all containers"
docker-compose restart
sleep 20

# Wait for services to be ready again
wait_for_service 80 12 || exit 1

# Test 9: Verify configuration persistence after full restart
echo -e "\nTest 9: Verifying configuration persistence after full restart"
CADDY_CONFIG_FULL_RESTART=$(docker-compose exec caddy curl -s http://localhost:2019/config/)

if echo "$CADDY_CONFIG_FULL_RESTART" | grep -q "persistence-test-2.local"; then
  echo -e "${GREEN}✓ Proxy configuration persisted after full restart${NC}"
else
  echo -e "${RED}✗ Proxy configuration lost after full restart${NC}"
  exit 1
fi

# Test 10: Delete the test proxy
echo -e "\nTest 10: Deleting the test proxy"
DELETE_RESULT=$(curl -s -X DELETE http://localhost/api/proxies/$PROXY_ID \
  -H "Authorization: Bearer $TOKEN")

if echo "$DELETE_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ Test proxy deleted successfully${NC}"
else
  echo -e "${RED}✗ Failed to delete test proxy${NC}"
  exit 1
fi

# Test 11: Verify proxy removal from configuration
echo -e "\nTest 11: Verifying proxy removal from configuration"
CADDY_CONFIG_AFTER_DELETE=$(docker-compose exec caddy curl -s http://localhost:2019/config/)

if echo "$CADDY_CONFIG_AFTER_DELETE" | grep -q "persistence-test-2.local"; then
  echo -e "${RED}✗ Deleted proxy still found in Caddy configuration${NC}"
  exit 1
else
  echo -e "${GREEN}✓ Proxy successfully removed from Caddy configuration${NC}"
fi

# Clean up
echo -e "\nCleaning up..."
docker-compose down

echo -e "\n${GREEN}All tests passed successfully!${NC}"
echo -e "Caddy configuration persistence and Docker deployment validation complete."
echo -e "The application correctly maintains configuration across container restarts."
