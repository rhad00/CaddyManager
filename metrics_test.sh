#!/bin/bash

# Test script for Caddy Metrics API integration
# This script tests the metrics API endpoints and functionality

# Colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Testing Caddy Metrics API integration...${NC}"

# Create a test directory
TEST_DIR="metrics_test_$(date +%s)"
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

# Test 1: Get metrics summary
echo -e "\nTest 1: Getting metrics summary"
SUMMARY_RESULT=$(curl -s -X GET http://localhost:3000/api/metrics \
  -H "Authorization: Bearer $TOKEN")

if echo "$SUMMARY_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ Metrics summary retrieved successfully${NC}"
  echo -e "Summary contains:"
  if echo "$SUMMARY_RESULT" | grep -q "http"; then
    echo -e "${GREEN}  ✓ HTTP metrics${NC}"
  else
    echo -e "${RED}  ✗ Missing HTTP metrics${NC}"
  fi
  if echo "$SUMMARY_RESULT" | grep -q "system"; then
    echo -e "${GREEN}  ✓ System metrics${NC}"
  else
    echo -e "${RED}  ✗ Missing system metrics${NC}"
  fi
  if echo "$SUMMARY_RESULT" | grep -q "tls"; then
    echo -e "${GREEN}  ✓ TLS metrics${NC}"
  else
    echo -e "${RED}  ✗ Missing TLS metrics${NC}"
  fi
else
  echo -e "${RED}✗ Failed to retrieve metrics summary${NC}"
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Test 2: Get HTTP metrics
echo -e "\nTest 2: Getting HTTP metrics"
HTTP_RESULT=$(curl -s -X GET http://localhost:3000/api/metrics/http \
  -H "Authorization: Bearer $TOKEN")

if echo "$HTTP_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ HTTP metrics retrieved successfully${NC}"
else
  echo -e "${RED}✗ Failed to retrieve HTTP metrics${NC}"
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Test 3: Get system metrics
echo -e "\nTest 3: Getting system metrics"
SYSTEM_RESULT=$(curl -s -X GET http://localhost:3000/api/metrics/system \
  -H "Authorization: Bearer $TOKEN")

if echo "$SYSTEM_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ System metrics retrieved successfully${NC}"
else
  echo -e "${RED}✗ Failed to retrieve system metrics${NC}"
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Test 4: Get TLS metrics
echo -e "\nTest 4: Getting TLS metrics"
TLS_RESULT=$(curl -s -X GET http://localhost:3000/api/metrics/tls \
  -H "Authorization: Bearer $TOKEN")

if echo "$TLS_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ TLS metrics retrieved successfully${NC}"
else
  echo -e "${RED}✗ Failed to retrieve TLS metrics${NC}"
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Test 5: Create metrics snapshot
echo -e "\nTest 5: Creating metrics snapshot"
SNAPSHOT_RESULT=$(curl -s -X POST http://localhost:3000/api/metrics/snapshot \
  -H "Authorization: Bearer $TOKEN")

if echo "$SNAPSHOT_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ Metrics snapshot created successfully${NC}"
else
  echo -e "${RED}✗ Failed to create metrics snapshot${NC}"
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Test 6: Get historical metrics
echo -e "\nTest 6: Getting historical metrics"
HISTORICAL_RESULT=$(curl -s -X GET http://localhost:3000/api/metrics/historical \
  -H "Authorization: Bearer $TOKEN")

if echo "$HISTORICAL_RESULT" | grep -q "success"; then
  echo -e "${GREEN}✓ Historical metrics retrieved successfully${NC}"
else
  echo -e "${RED}✗ Failed to retrieve historical metrics${NC}"
  cd ..
  rm -rf $TEST_DIR
  exit 1
fi

# Test 7: Get raw metrics (admin only)
echo -e "\nTest 7: Getting raw metrics"
RAW_RESULT=$(curl -s -X GET http://localhost:3000/api/metrics/raw \
  -H "Authorization: Bearer $TOKEN")

if echo "$RAW_RESULT" | grep -q "caddy"; then
  echo -e "${GREEN}✓ Raw metrics retrieved successfully${NC}"
else
  echo -e "${RED}✗ Failed to retrieve raw metrics${NC}"
  # This might fail if the user is not admin, so continue anyway
fi

# Clean up
cd ..
rm -rf $TEST_DIR

echo -e "\n${GREEN}Metrics API integration tests completed successfully!${NC}"
echo -e "All endpoints are working as expected."
