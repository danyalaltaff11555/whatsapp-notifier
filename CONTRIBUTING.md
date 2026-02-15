# Contributing to WhatsApp Notification Service

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone <your-fork-url>
   cd worker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up local environment**
   ```bash
   bash scripts/setup-local.sh
   ```

4. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Code Style

### TypeScript Guidelines

- Use **strict mode** TypeScript
- Prefer **interfaces** over types for object shapes
- Use **explicit return types** for functions
- Avoid `any` - use `unknown` if type is truly unknown
- Use **async/await** instead of promises chains

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Classes**: `PascalCase`
- **Functions/Variables**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Interfaces**: `PascalCase` (no `I` prefix)
- **Types**: `PascalCase`

### Code Organization

```typescript
// 1. Imports (grouped and sorted)
import { external } from 'external-package';
import { internal } from '@whatsapp-notif/shared';
import { local } from './local-file';

// 2. Types and interfaces
interface MyInterface {
  // ...
}

// 3. Constants
const MY_CONSTANT = 'value';

// 4. Functions
export function myFunction(): void {
  // ...
}
```

## 🧪 Testing

### Writing Tests

- Write tests for all new features
- Maintain **>85% code coverage**
- Use descriptive test names
- Follow AAA pattern: Arrange, Act, Assert

```typescript
describe('MyService', () => {
  describe('myMethod', () => {
    it('should return expected result when given valid input', () => {
      // Arrange
      const input = 'test';
      const expected = 'result';

      // Act
      const result = myService.myMethod(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Code Quality

### Before Committing

1. **Lint your code**
   ```bash
   npm run lint:fix
   ```

2. **Format your code**
   ```bash
   npm run format
   ```

3. **Type check**
   ```bash
   npm run typecheck
   ```

4. **Run tests**
   ```bash
   npm test
   ```

### Pre-commit Hooks

Husky is configured to automatically run linting and formatting on staged files.

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks

### Examples

```
feat(api): add bulk notification endpoint

Implement POST /v1/notifications/bulk endpoint to support
sending multiple notifications in a single request.

Closes #123
```

```
fix(worker): handle rate limit errors correctly

Previously, rate limit errors were not being retried.
Now they are queued for retry after the cooldown period.
```

## Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new features
3. **Ensure all tests pass**
4. **Update CHANGELOG.md** (if applicable)
5. **Create pull request** with clear description
6. **Link related issues**
7. **Request review** from maintainers

### PR Title Format

Use the same format as commit messages:
```
feat(api): add bulk notification endpoint
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe testing performed

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Code follows style guidelines
- [ ] All tests passing
```

## Architecture Guidelines

### Package Structure

- **`@whatsapp-notif/shared`**: Reusable types, utilities, schemas
- **`@whatsapp-notif/api`**: REST API service
- **`@whatsapp-notif/worker`**: Lambda worker functions

### Dependency Rules

- `shared` has **no dependencies** on other packages
- `api` and `worker` can depend on `shared`
- `api` and `worker` should **not** depend on each other

### Error Handling

- Use custom error classes from `@whatsapp-notif/shared`
- Always include error context
- Log errors with appropriate severity
- Return user-friendly error messages

### Logging

- Use structured logging (Pino)
- Include correlation IDs
- Log at appropriate levels
- Don't log sensitive information

## Reporting Bugs

### Bug Report Template

```markdown
**Describe the bug**
Clear description of the bug

**To Reproduce**
Steps to reproduce the behavior

**Expected behavior**
What you expected to happen

**Environment**
- Node.js version:
- npm version:
- OS:

**Additional context**
Any other relevant information
```

## Feature Requests

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
Description of the problem

**Describe the solution you'd like**
Clear description of desired solution

**Describe alternatives you've considered**
Alternative solutions or features

**Additional context**
Any other relevant information
```

## Getting Help

- Check existing issues and documentation
- Ask questions in discussions
- Reach out to maintainers

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
