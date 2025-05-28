#!/bin/bash

# Test script for CaddyManager
# This script runs automated tests for different components

# Colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to display help
show_help() {
  echo -e "${GREEN}CaddyManager Test Script${NC}"
  echo ""
  echo "Usage: ./test.sh [component]"
  echo ""
  echo "Components:"
  echo "  all         - Run all tests"
  echo "  auth        - Test authentication"
  echo "  proxy       - Test proxy management"
  echo "  template    - Test template functionality"
  echo "  backup      - Test backup and restore"
  echo "  caddy       - Test Caddy integration"
  echo "  help        - Show this help message"
  echo ""
}

# Function to test authentication
test_auth() {
  echo -e "${YELLOW}Testing authentication...${NC}"
  
  # Test login endpoint
  echo -e "Testing login endpoint..."
  LOGIN_RESULT=$(curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@caddymanager.local","password":"changeme123"}')
  
  if echo "$LOGIN_RESULT" | grep -q "token"; then
    echo -e "${GREEN}✓ Login successful${NC}"
    # Extract token for further tests
    TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"token":"[^"]*' | sed 's/"token":"//')
    echo "$TOKEN" > .test_token
  else
    echo -e "${RED}✗ Login failed${NC}"
    return 1
  fi
  
  # Test protected endpoint
  echo -e "Testing protected endpoint..."
  AUTH_RESULT=$(curl -s -X GET http://localhost:3000/api/users/me \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$AUTH_RESULT" | grep -q "email"; then
    echo -e "${GREEN}✓ Protected endpoint access successful${NC}"
  else
    echo -e "${RED}✗ Protected endpoint access failed${NC}"
    return 1
  fi
  
  echo -e "${GREEN}Authentication tests passed${NC}"
  return 0
}

# Function to test proxy management
test_proxy() {
  echo -e "${YELLOW}Testing proxy management...${NC}"
  
  # Get token
  TOKEN=$(cat .test_token 2>/dev/null)
  if [ -z "$TOKEN" ]; then
    test_auth
    TOKEN=$(cat .test_token 2>/dev/null)
  fi
  
  # Create a test proxy
  echo -e "Creating test proxy..."
  CREATE_RESULT=$(curl -s -X POST http://localhost:3000/api/proxies \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Test Proxy","domains":["test.local"],"upstream_url":"http://localhost:8000","ssl_type":"none"}')
  
  if echo "$CREATE_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ Proxy creation successful${NC}"
    # Extract proxy ID for further tests
    PROXY_ID=$(echo "$CREATE_RESULT" | grep -o '"id":"[^"]*' | sed 's/"id":"//')
  else
    echo -e "${RED}✗ Proxy creation failed${NC}"
    return 1
  fi
  
  # Get proxy list
  echo -e "Getting proxy list..."
  LIST_RESULT=$(curl -s -X GET http://localhost:3000/api/proxies \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$LIST_RESULT" | grep -q "Test Proxy"; then
    echo -e "${GREEN}✓ Proxy list retrieval successful${NC}"
  else
    echo -e "${RED}✗ Proxy list retrieval failed${NC}"
    return 1
  fi
  
  # Update proxy
  echo -e "Updating proxy..."
  UPDATE_RESULT=$(curl -s -X PUT http://localhost:3000/api/proxies/$PROXY_ID \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Updated Test Proxy"}')
  
  if echo "$UPDATE_RESULT" | grep -q "Updated Test Proxy"; then
    echo -e "${GREEN}✓ Proxy update successful${NC}"
  else
    echo -e "${RED}✗ Proxy update failed${NC}"
    return 1
  fi
  
  # Delete proxy
  echo -e "Deleting proxy..."
  DELETE_RESULT=$(curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY_ID \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$DELETE_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ Proxy deletion successful${NC}"
  else
    echo -e "${RED}✗ Proxy deletion failed${NC}"
    return 1
  fi
  
  echo -e "${GREEN}Proxy management tests passed${NC}"
  return 0
}

# Function to test template functionality
test_template() {
  echo -e "${YELLOW}Testing template functionality...${NC}"
  
  # Get token
  TOKEN=$(cat .test_token 2>/dev/null)
  if [ -z "$TOKEN" ]; then
    test_auth
    TOKEN=$(cat .test_token 2>/dev/null)
  fi
  
  # Get template list
  echo -e "Getting template list..."
  LIST_RESULT=$(curl -s -X GET http://localhost:3000/api/templates \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$LIST_RESULT" | grep -q "templates"; then
    echo -e "${GREEN}✓ Template list retrieval successful${NC}"
    # Check if we have at least one template
    TEMPLATE_COUNT=$(echo "$LIST_RESULT" | grep -o '"id"' | wc -l)
    if [ "$TEMPLATE_COUNT" -gt 0 ]; then
      echo -e "${GREEN}✓ Found $TEMPLATE_COUNT templates${NC}"
      # Extract first template ID
      TEMPLATE_ID=$(echo "$LIST_RESULT" | grep -o '"id":"[^"]*' | head -1 | sed 's/"id":"//')
    else
      echo -e "${RED}✗ No templates found${NC}"
      return 1
    fi
  else
    echo -e "${RED}✗ Template list retrieval failed${NC}"
    return 1
  fi
  
  # Create a test proxy for template application
  echo -e "Creating test proxy for template application..."
  CREATE_RESULT=$(curl -s -X POST http://localhost:3000/api/proxies \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Template Test Proxy","domains":["template-test.local"],"upstream_url":"http://localhost:8000","ssl_type":"none"}')
  
  if echo "$CREATE_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ Test proxy creation successful${NC}"
    # Extract proxy ID
    PROXY_ID=$(echo "$CREATE_RESULT" | grep -o '"id":"[^"]*' | sed 's/"id":"//')
  else
    echo -e "${RED}✗ Test proxy creation failed${NC}"
    return 1
  fi
  
  # Apply template to proxy
  echo -e "Applying template to proxy..."
  APPLY_RESULT=$(curl -s -X POST http://localhost:3000/api/templates/$TEMPLATE_ID/apply/$PROXY_ID \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$APPLY_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ Template application successful${NC}"
  else
    echo -e "${RED}✗ Template application failed${NC}"
    # Clean up proxy even if test fails
    curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY_ID \
      -H "Authorization: Bearer $TOKEN" > /dev/null
    return 1
  fi
  
  # Clean up test proxy
  echo -e "Cleaning up test proxy..."
  DELETE_RESULT=$(curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY_ID \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$DELETE_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ Test proxy cleanup successful${NC}"
  else
    echo -e "${RED}✗ Test proxy cleanup failed${NC}"
    return 1
  fi
  
  echo -e "${GREEN}Template functionality tests passed${NC}"
  return 0
}

# Function to test backup and restore
test_backup() {
  echo -e "${YELLOW}Testing backup and restore...${NC}"
  
  # Get token
  TOKEN=$(cat .test_token 2>/dev/null)
  if [ -z "$TOKEN" ]; then
    test_auth
    TOKEN=$(cat .test_token 2>/dev/null)
  fi
  
  # Create a backup
  echo -e "Creating backup..."
  CREATE_RESULT=$(curl -s -X POST http://localhost:3000/api/backups \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$CREATE_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ Backup creation successful${NC}"
    # Extract backup ID
    BACKUP_ID=$(echo "$CREATE_RESULT" | grep -o '"id":"[^"]*' | sed 's/"id":"//')
  else
    echo -e "${RED}✗ Backup creation failed${NC}"
    return 1
  fi
  
  # Get backup list
  echo -e "Getting backup list..."
  LIST_RESULT=$(curl -s -X GET http://localhost:3000/api/backups \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$LIST_RESULT" | grep -q "$BACKUP_ID"; then
    echo -e "${GREEN}✓ Backup list retrieval successful${NC}"
  else
    echo -e "${RED}✗ Backup list retrieval failed${NC}"
    return 1
  fi
  
  # Download backup
  echo -e "Downloading backup..."
  curl -s -X GET http://localhost:3000/api/backups/$BACKUP_ID \
    -H "Authorization: Bearer $TOKEN" \
    -o .test_backup.json
  
  if [ -s .test_backup.json ]; then
    echo -e "${GREEN}✓ Backup download successful${NC}"
  else
    echo -e "${RED}✗ Backup download failed${NC}"
    return 1
  fi
  
  # Create a test proxy before restore
  echo -e "Creating test proxy before restore..."
  CREATE_RESULT=$(curl -s -X POST http://localhost:3000/api/proxies \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Restore Test Proxy","domains":["restore-test.local"],"upstream_url":"http://localhost:8000","ssl_type":"none"}')
  
  if echo "$CREATE_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ Test proxy creation successful${NC}"
  else
    echo -e "${RED}✗ Test proxy creation failed${NC}"
    return 1
  fi
  
  # Restore from backup
  echo -e "Restoring from backup..."
  RESTORE_RESULT=$(curl -s -X POST http://localhost:3000/api/backups/$BACKUP_ID/restore \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$RESTORE_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ Backup restoration successful${NC}"
  else
    echo -e "${RED}✗ Backup restoration failed${NC}"
    return 1
  fi
  
  # Delete backup
  echo -e "Deleting backup..."
  DELETE_RESULT=$(curl -s -X DELETE http://localhost:3000/api/backups/$BACKUP_ID \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$DELETE_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ Backup deletion successful${NC}"
  else
    echo -e "${RED}✗ Backup deletion failed${NC}"
    return 1
  fi
  
  # Clean up test files
  rm -f .test_backup.json
  
  echo -e "${GREEN}Backup and restore tests passed${NC}"
  return 0
}

# Function to test Caddy integration
test_caddy() {
  echo -e "${YELLOW}Testing Caddy integration...${NC}"
  
  # Check if Caddy is running
  if ! pgrep caddy > /dev/null; then
    echo -e "${RED}Caddy is not running. Start it with './dev.sh caddy'${NC}"
    return 1
  fi
  
  # Test Caddy admin API
  echo -e "Testing Caddy admin API..."
  ADMIN_RESULT=$(curl -s -X GET http://localhost:2019/config/)
  
  if [ -n "$ADMIN_RESULT" ]; then
    echo -e "${GREEN}✓ Caddy admin API accessible${NC}"
  else
    echo -e "${RED}✗ Caddy admin API not accessible${NC}"
    return 1
  fi
  
  # Get token
  TOKEN=$(cat .test_token 2>/dev/null)
  if [ -z "$TOKEN" ]; then
    test_auth
    TOKEN=$(cat .test_token 2>/dev/null)
  fi
  
  # Create a test proxy with headers and middleware
  echo -e "Creating test proxy with headers and middleware..."
  CREATE_RESULT=$(curl -s -X POST http://localhost:3000/api/proxies \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "name":"Caddy Test Proxy",
      "domains":["caddy-test.local"],
      "upstream_url":"http://localhost:8000",
      "ssl_type":"none",
      "compression_enabled":true
    }')
  
  if echo "$CREATE_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ Test proxy creation successful${NC}"
    # Extract proxy ID
    PROXY_ID=$(echo "$CREATE_RESULT" | grep -o '"id":"[^"]*' | sed 's/"id":"//')
  else
    echo -e "${RED}✗ Test proxy creation failed${NC}"
    return 1
  fi
  
  # Check Caddy config for the new proxy
  echo -e "Checking Caddy configuration..."
  CONFIG_RESULT=$(curl -s -X GET http://localhost:2019/config/)
  
  if echo "$CONFIG_RESULT" | grep -q "caddy-test.local"; then
    echo -e "${GREEN}✓ Proxy configuration applied to Caddy${NC}"
  else
    echo -e "${RED}✗ Proxy configuration not found in Caddy${NC}"
    # Clean up proxy even if test fails
    curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY_ID \
      -H "Authorization: Bearer $TOKEN" > /dev/null
    return 1
  fi
  
  # Clean up test proxy
  echo -e "Cleaning up test proxy..."
  DELETE_RESULT=$(curl -s -X DELETE http://localhost:3000/api/proxies/$PROXY_ID \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$DELETE_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ Test proxy cleanup successful${NC}"
  else
    echo -e "${RED}✗ Test proxy cleanup failed${NC}"
    return 1
  fi
  
  echo -e "${GREEN}Caddy integration tests passed${NC}"
  return 0
}

# Function to run all tests
run_all_tests() {
  echo -e "${YELLOW}Running all tests...${NC}"
  
  FAILED=0
  
  test_auth || FAILED=1
  test_proxy || FAILED=1
  test_template || FAILED=1
  test_backup || FAILED=1
  test_caddy || FAILED=1
  
  if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed successfully!${NC}"
    return 0
  else
    echo -e "${RED}Some tests failed. Please check the output above.${NC}"
    return 1
  fi
}

# Main script logic
case "$1" in
  all)
    run_all_tests
    ;;
  auth)
    test_auth
    ;;
  proxy)
    test_proxy
    ;;
  template)
    test_template
    ;;
  backup)
    test_backup
    ;;
  caddy)
    test_caddy
    ;;
  help|*)
    show_help
    ;;
esac
