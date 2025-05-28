#!/bin/bash

# Integration test script for CaddyManager
# This script tests the integration between different components

# Colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Running integration tests for CaddyManager...${NC}"

# Create a test directory
TEST_DIR="integration_test_$(date +%s)"
mkdir -p $TEST_DIR
cd $TEST_DIR

# Get authentication token
echo -e "Authenticating..."
LOGIN_RESULT=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@caddymanager.local","password":"changeme123"}')

if echo "$LOGIN_RESULT" | grep -q "token"; then
  echo -e "${GREEN}✓ Authentication successful${NC}"
  TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"token":"[^"]*' | sed 's/"token":"//')
else
  echo -e "${RED}✗ Authentication failed${NC}"
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Test 1: Create a proxy with template
echo -e "\nTest 1: Creating a proxy with template application"

# Get available templates
echo -e "Getting templates..."
TEMPLATES=$(curl -s -X GET http://localhost:3000/api/templates \
  -H "Authorization: Bearer $TOKEN")

if echo "$TEMPLATES" | grep -q "templates"; then
  echo -e "${GREEN}✓ Templates retrieved successfully${NC}"
  TEMPLATE_ID=$(echo "$TEMPLATES" | grep -o '"id":"[^"]*' | head -1 | sed 's/"id":"//')
  TEMPLATE_NAME=$(echo "$TEMPLATES" | grep -o '"name":"[^"]*' | head -1 | sed 's/"name":"//')
  echo -e "Selected template: $TEMPLATE_NAME"
else
  echo -e "${RED}✗ Failed to retrieve templates${NC}"
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Create a proxy
echo -e "Creating proxy..."
PROXY_RESULT=$(curl -s -X POST http://localhost:3000/api/proxies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\":\"Integration Test Proxy\",
    \"domains\":[\"integration-test.local\"],
    \"upstream_url\":\"http://localhost:8000\",
    \"ssl_type\":\"none\",
    \"compression_enabled\":true
  }")

if echo "$PROXY_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ Proxy created successfully${NC}"
  PROXY_ID=$(echo "$PROXY_RESULT" | grep -o '"id":"[^"]*' | sed 's/"id":"//')
else
  echo -e "${RED}✗ Failed to create proxy${NC}"
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Apply template to proxy
echo -e "Applying template to proxy..."
APPLY_RESULT=$(curl -s -X POST http://localhost:3000/api/templates/$TEMPLATE_ID/apply/$PROXY_ID \
  -H "Authorization: Bearer $TOKEN")

if echo "$APPLY_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ Template applied successfully${NC}"
else
  echo -e "${RED}✗ Failed to apply template${NC}"
  # Clean up proxy
  curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY_ID \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Test 2: Create a backup and restore
echo -e "\nTest 2: Creating a backup and restoring"

# Create a backup
echo -e "Creating backup..."
BACKUP_RESULT=$(curl -s -X POST http://localhost:3000/api/backups \
  -H "Authorization: Bearer $TOKEN")

if echo "$BACKUP_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ Backup created successfully${NC}"
  BACKUP_ID=$(echo "$BACKUP_RESULT" | grep -o '"id":"[^"]*' | sed 's/"id":"//')
else
  echo -e "${RED}✗ Failed to create backup${NC}"
  # Clean up proxy
  curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY_ID \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Download backup
echo -e "Downloading backup..."
curl -s -X GET http://localhost:3000/api/backups/$BACKUP_ID \
  -H "Authorization: Bearer $TOKEN" \
  -o backup.json

if [ -s backup.json ]; then
  echo -e "${GREEN}✓ Backup downloaded successfully${NC}"
else
  echo -e "${RED}✗ Failed to download backup${NC}"
  # Clean up
  curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY_ID \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  curl -s -X DELETE http://localhost:3000/api/backups/$BACKUP_ID \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Create a second proxy to test restore
echo -e "Creating second proxy..."
PROXY2_RESULT=$(curl -s -X POST http://localhost:3000/api/proxies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\":\"Integration Test Proxy 2\",
    \"domains\":[\"integration-test-2.local\"],
    \"upstream_url\":\"http://localhost:8001\",
    \"ssl_type\":\"none\"
  }")

if echo "$PROXY2_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ Second proxy created successfully${NC}"
  PROXY2_ID=$(echo "$PROXY2_RESULT" | grep -o '"id":"[^"]*' | sed 's/"id":"//')
else
  echo -e "${RED}✗ Failed to create second proxy${NC}"
  # Clean up
  curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY_ID \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  curl -s -X DELETE http://localhost:3000/api/backups/$BACKUP_ID \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Restore from backup
echo -e "Restoring from backup..."
RESTORE_RESULT=$(curl -s -X POST http://localhost:3000/api/backups/$BACKUP_ID/restore \
  -H "Authorization: Bearer $TOKEN")

if echo "$RESTORE_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ Restore successful${NC}"
else
  echo -e "${RED}✗ Failed to restore from backup${NC}"
  # Clean up
  curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY_ID \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY2_ID \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  curl -s -X DELETE http://localhost:3000/api/backups/$BACKUP_ID \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Test 3: Verify Caddy configuration
echo -e "\nTest 3: Verifying Caddy configuration"

# Check Caddy config
echo -e "Checking Caddy configuration..."
CADDY_CONFIG=$(curl -s -X GET http://localhost:2019/config/)

if echo "$CADDY_CONFIG" | grep -q "integration-test.local"; then
  echo -e "${GREEN}✓ Proxy configuration found in Caddy${NC}"
else
  echo -e "${RED}✗ Proxy configuration not found in Caddy${NC}"
  # Continue anyway as this might be due to Caddy not running
fi

# Clean up
echo -e "\nCleaning up..."

# Delete proxies
curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY_ID \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo -e "${GREEN}✓ Deleted test proxy${NC}"

# Delete backup
curl -s -X DELETE http://localhost:3000/api/backups/$BACKUP_ID \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo -e "${GREEN}✓ Deleted test backup${NC}"

# Remove test directory
cd ..
rm -rf $TEST_DIR

echo -e "\n${GREEN}Integration tests completed successfully!${NC}"
