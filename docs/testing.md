# Testing Guide

## Overview
This project uses Jest for unit and integration testing with TypeScript support.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- notification.repository.test.ts
```

## Test Structure

```
packages/
├── shared/
│   └── src/
│       ├── utils/__tests__/
│       │   ├── retry.test.ts
│       │   └── phone.test.ts
│       └── repositories/__tests__/
│           └── notification.repository.test.ts
├── api/
│   └── src/
│       └── routes/__tests__/
│           ├── health.test.ts
│           └── notifications.test.ts
└── worker/
    └── src/
        └── services/__tests__/
            └── message.processor.test.ts
```

## Test Types

### Unit Tests
- Test individual functions and classes in isolation
- Mock external dependencies (database, APIs)
- Fast execution
- Located in `__tests__` folders next to source files

### Integration Tests
- Test multiple components working together
- Use real or test databases
- Test API endpoints end-to-end
- Slower but more comprehensive

## Coverage Goals

- **Target:** 70%+ coverage
- **Critical paths:** 90%+ coverage
  - Repositories
  - Services
  - Utilities

## Writing Tests

### Unit Test Example
```typescript
import { calculateRetryDelay } from '../retry';

describe('calculateRetryDelay', () => {
  it('should calculate exponential backoff', () => {
    expect(calculateRetryDelay(1)).toBe(1000);
    expect(calculateRetryDelay(2)).toBe(2000);
  });
});
```

### Integration Test Example
```typescript
import request from 'supertest';
import { buildApp } from '../app';

describe('Health Routes', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return health status', async () => {
    const response = await request(app.server)
      .get('/v1/health')
      .expect(200);

    expect(response.body.status).toBe('healthy');
  });
});
```

## Mocking

### Prisma Client
```typescript
jest.mock('../../database/client', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));
```

### External APIs
```typescript
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
```

## Best Practices

1. **Arrange-Act-Assert:** Structure tests clearly
2. **One assertion per test:** Keep tests focused
3. **Descriptive names:** Use clear test descriptions
4. **Clean up:** Use `afterEach` to reset state
5. **Mock external dependencies:** Keep tests isolated
6. **Test edge cases:** Include error scenarios

## CI/CD Integration

Tests run automatically on:
- Every commit (via Husky pre-commit hook)
- Pull requests (via GitHub Actions)
- Before deployment

## Troubleshooting

### Tests timing out
- Increase Jest timeout: `jest.setTimeout(10000)`
- Check for unresolved promises

### Database connection errors
- Ensure test database is running
- Check `DATABASE_URL` in jest.setup.js

### Module resolution errors
- Verify `moduleNameMapper` in jest.config.js
- Check TypeScript paths configuration
