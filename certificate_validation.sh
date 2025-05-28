#!/bin/bash

# Certificate Management Validation Script
# This script tests the certificate management functionality in CaddyManager

# Set variables
API_URL="http://localhost:3000/api"
TEMP_DIR="/tmp/cert_test"
TEST_DOMAIN="test.local"
TEST_CA_NAME="Test CA"
TEST_CERT_NAME="Test Certificate"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Create temp directory
mkdir -p $TEMP_DIR

echo -e "${YELLOW}Starting Certificate Management Validation...${NC}"

# Function to run a test
run_test() {
  local test_name=$1
  local test_command=$2
  
  echo -e "\n${YELLOW}Testing: ${test_name}${NC}"
  
  if eval $test_command; then
    echo -e "${GREEN}✓ Test passed: ${test_name}${NC}"
    return 0
  else
    echo -e "${RED}✗ Test failed: ${test_name}${NC}"
    return 1
  fi
}

# Generate a test certificate
generate_test_certificate() {
  echo "Generating test certificate..."
  
  # Generate private key
  openssl genrsa -out $TEMP_DIR/key.pem 2048
  
  # Generate self-signed certificate
  openssl req -new -x509 -key $TEMP_DIR/key.pem -out $TEMP_DIR/cert.pem -days 1 \
    -subj "/C=US/ST=Test/L=Test/O=CaddyManager/CN=$TEST_DOMAIN"
    
  echo "Test certificate generated."
}

# Generate a test CA certificate
generate_test_ca() {
  echo "Generating test CA certificate..."
  
  # Generate CA private key
  openssl genrsa -out $TEMP_DIR/ca_key.pem 2048
  
  # Generate CA certificate
  openssl req -new -x509 -key $TEMP_DIR/ca_key.pem -out $TEMP_DIR/ca_cert.pem -days 1 \
    -subj "/C=US/ST=Test/L=Test/O=CaddyManager/CN=Test CA"
    
  echo "Test CA certificate generated."
}

# Get authentication token
get_auth_token() {
  echo "Getting authentication token..."
  
  response=$(curl -s -X POST $API_URL/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@caddymanager.local","password":"changeme123"}')
    
  token=$(echo $response | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  
  if [ -z "$token" ]; then
    echo -e "${RED}Failed to get authentication token${NC}"
    exit 1
  fi
  
  echo $token
}

# Test listing certificates
test_list_certificates() {
  local token=$1
  
  curl -s -X GET $API_URL/certificates \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" | grep -q "success"
}

# Test uploading a certificate
test_upload_certificate() {
  local token=$1
  
  curl -s -X POST $API_URL/certificates/upload \
    -H "Authorization: Bearer $token" \
    -F "name=$TEST_CERT_NAME" \
    -F "domains=$TEST_DOMAIN" \
    -F "certificate=@$TEMP_DIR/cert.pem" \
    -F "privateKey=@$TEMP_DIR/key.pem" | grep -q "success"
}

# Test generating a self-signed certificate
test_generate_certificate() {
  local token=$1
  
  curl -s -X POST $API_URL/certificates/generate \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$TEST_CERT_NAME-Generated\",\"domains\":\"$TEST_DOMAIN\",\"validityDays\":365}" | grep -q "success"
}

# Test deleting a certificate
test_delete_certificate() {
  local token=$1
  local cert_id=$2
  
  curl -s -X DELETE $API_URL/certificates/$cert_id \
    -H "Authorization: Bearer $token" | grep -q "success"
}

# Test listing CAs
test_list_cas() {
  local token=$1
  
  curl -s -X GET $API_URL/certificates/cas \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" | grep -q "success"
}

# Test adding a custom CA
test_add_ca() {
  local token=$1
  
  curl -s -X POST $API_URL/certificates/cas \
    -H "Authorization: Bearer $token" \
    -F "name=$TEST_CA_NAME" \
    -F "type=custom" \
    -F "certificate=@$TEMP_DIR/ca_cert.pem" \
    -F "trusted=true" | grep -q "success"
}

# Test updating CA trust status
test_update_ca_trust() {
  local token=$1
  local ca_id=$2
  
  curl -s -X PUT $API_URL/certificates/cas/$ca_id/trust \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d '{"trusted":false}' | grep -q "success"
}

# Test deleting a CA
test_delete_ca() {
  local token=$1
  local ca_id=$2
  
  curl -s -X DELETE $API_URL/certificates/cas/$ca_id \
    -H "Authorization: Bearer $token" | grep -q "success"
}

# Main test sequence
main() {
  # Generate test certificates
  generate_test_certificate
  generate_test_ca
  
  # Get authentication token
  token=$(get_auth_token)
  
  # Run tests
  run_test "List certificates" "test_list_certificates $token"
  
  run_test "Upload certificate" "test_upload_certificate $token"
  
  # Get the uploaded certificate ID
  cert_response=$(curl -s -X GET $API_URL/certificates \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json")
  cert_id=$(echo $cert_response | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
  
  if [ -n "$cert_id" ]; then
    echo "Certificate ID: $cert_id"
    run_test "Delete certificate" "test_delete_certificate $token $cert_id"
  else
    echo -e "${RED}Failed to get certificate ID${NC}"
  fi
  
  run_test "Generate self-signed certificate" "test_generate_certificate $token"
  
  run_test "List certificate authorities" "test_list_cas $token"
  
  run_test "Add custom CA" "test_add_ca $token"
  
  # Get the added CA ID
  ca_response=$(curl -s -X GET $API_URL/certificates/cas \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json")
  ca_id=$(echo $ca_response | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
  
  if [ -n "$ca_id" ]; then
    echo "CA ID: $ca_id"
    run_test "Update CA trust status" "test_update_ca_trust $token $ca_id"
    run_test "Delete CA" "test_delete_ca $token $ca_id"
  else
    echo -e "${RED}Failed to get CA ID${NC}"
  fi
  
  # Clean up
  echo -e "\n${YELLOW}Cleaning up...${NC}"
  rm -rf $TEMP_DIR
  
  echo -e "\n${GREEN}Certificate Management Validation Complete!${NC}"
}

# Run the main test sequence
main
