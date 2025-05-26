# Testing Strategy

## Overview
This document outlines the testing strategy for CaddyManager's backend services, following the requirement of >80% test coverage.

## Structure

### Unit Tests (`/unit`)
- Service layer tests
- Model validation tests
- Utility function tests
- Controller/route handler tests
- Middleware tests

### Integration Tests (`/integration`)
- Database operations
- API endpoints
- Authentication flows
- Caddy configuration management
- Multi-domain proxy handling

### E2E Tests (`/e2e`)
- Complete user flows
- Proxy creation and management
- SSL certificate handling
- Configuration updates
- Error scenarios

## Test Categories

### Model Tests
- User model validation
- Proxy model configuration validation
- SSL configuration validation
- Custom header validation

### Service Tests
- AuthService
  - User authentication
  - JWT generation and validation
  - Password hashing
  - Session management

- ProxyService
  - Proxy CRUD operations
  - Domain validation
  - Configuration generation
  - Status management

- CaddyService
  - Configuration generation
  - API communication
  - Error handling
  - Health checks

### API Tests
- Authentication endpoints
- Proxy management endpoints
- User management endpoints
- Health check endpoints

### Database Tests
- PostgreSQL operations
- SQLite operations
- Migration testing
- Data seeding verification

## Coverage Requirements

### Must Cover
- All model validations
- Service layer business logic
- API endpoint handlers
- Authentication flows
- Configuration generation
- Error handling middleware

### Should Cover
- Edge cases in domain validation
- SSL configuration scenarios
- Database transaction handling
- Race condition scenarios

## Tools and Setup

### Testing Framework
- Jest
- Supertest for HTTP testing
- Mock implementations for external services

### Coverage Tools
- Jest coverage reports
- SonarQube integration
- Coverage thresholds:
  - Statements: 80%
  - Branches: 80%
  - Functions: 80%
  - Lines: 80%

### CI Integration
- Automated test runs on pull requests
- Coverage reports in CI pipeline
- Test status checks for merges

## Implementation Plan

### Phase 1: Basic Test Setup
1. Set up Jest configuration
2. Create test database configuration
3. Implement test utilities and helpers
4. Set up mocking framework

### Phase 2: Core Tests
1. User model and authentication tests
2. Proxy model and validation tests
3. Basic service layer tests
4. API endpoint tests

### Phase 3: Integration Tests
1. Database operation tests
2. Caddy integration tests
3. Multi-domain configuration tests
4. SSL handling tests

### Phase 4: Advanced Tests
1. Performance tests
2. Load tests
3. Edge case scenarios
4. Error handling tests

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- unit/models
npm test -- integration/api
npm test -- e2e/proxy

# Watch mode for development
npm run test:watch
```

## Writing Tests

### Test File Naming
- Unit tests: `*.test.ts`
- Integration tests: `*.integration.test.ts`
- E2E tests: `*.e2e.test.ts`

### Test Structure
```typescript
describe('Component/Feature', () => {
  beforeAll(() => {
    // Setup
  });

  afterAll(() => {
    // Cleanup
  });

  describe('Specific functionality', () => {
    it('should behave as expected', () => {
      // Test
    });
  });
});
```

## Best Practices
1. Use descriptive test names
2. One assertion per test when possible
3. Proper setup and teardown
4. Mock external dependencies
5. Test both success and failure cases
6. Include edge cases
7. Keep tests focused and atomic
8. Use proper assertion messages
