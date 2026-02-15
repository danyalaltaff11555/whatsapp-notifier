# WhatsApp Notification Microservice

> Production-ready, event-driven WhatsApp notification service built with TypeScript, Node.js, and AWS

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

## Features

- **Event-Driven Architecture** - Scalable SQS-based message processing
- **Type-Safe** - Full TypeScript with strict mode
- **Automatic Retries** - Exponential backoff for failed messages
- **Scheduled Delivery** - Send messages at specific times
- **Analytics** - Built-in delivery statistics and reporting
- **Secure** - API key authentication and rate limiting
- **Monitored** - Sentry error tracking and CloudWatch logging
- **Containerized** - Docker-ready for easy deployment


---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- Docker (optional)

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/whatsapp-notification-service.git
cd whatsapp-notification-service

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate dev

# Start services
npm run dev:api      # API server (port 3000)
npm run dev:worker   # Worker process
```

### Docker Setup

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

---

## Architecture

```
┌─────────┐      ┌─────────┐      ┌─────────┐      ┌──────────┐
│ Client  │─────▶│   API   │─────▶│   SQS   │─────▶│  Worker  │
└─────────┘      └────┬────┘      └─────────┘      └────┬─────┘
                      │                                  │
                      ▼                                  ▼
                 ┌─────────┐                      ┌──────────┐
                 │Database │                      │ WhatsApp │
                 │(Prisma) │                      │   API    │
                 └─────────┘                      └────┬─────┘
                      ▲                                │
                      │                                │
                      └────────────────────────────────┘
                              (Webhook Updates)
```

### Components

- **API Service** - REST API for notification ingestion
- **Worker Service** - SQS consumer for message processing
- **Database** - PostgreSQL for state management
- **Redis** - Caching and rate limiting
- **SQS** - Message queue for async processing

---

## API Reference

### Quick Example

**Create Notification:**
```bash
curl -X POST http://localhost:3000/v1/notifications \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "order.placed",
    "recipient": {"phone_number": "+14155552671"},
    "template": {
      "name": "order_confirmation",
      "language": "en",
      "components": [...]
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "notif_abc123",
    "status": "queued"
  }
}
```

### Available Endpoints

- `POST /v1/notifications` - Create notification
- `POST /v1/notifications/bulk` - Bulk create
- `GET /v1/notifications/:id/status` - Get status
- `GET /v1/analytics/stats` - Delivery statistics
- `GET /v1/analytics/notifications` - List notifications
- `GET /v1/health` - Health check

**Complete API Documentation:** See [docs/api.md](docs/api.md) for:
- Authentication details
- Full endpoint reference
- Request/response schemas
- Error codes
- Rate limiting
- Webhook integration
- SDK examples (Node.js, Python)

---

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `REDIS_URL` | Redis connection string | Yes | - |
| `SQS_QUEUE_URL` | AWS SQS queue URL | Yes | - |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Business API token | Yes | - |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID | Yes | - |
| `SENTRY_DSN` | Sentry error tracking DSN | No | - |
| `API_KEYS` | Comma-separated API keys | Yes | - |
| `RATE_LIMIT_RECIPIENT_PER_HOUR` | Max messages per recipient/hour | No | 10 |

**Configuration:** See [.env.example](.env.example) for complete environment variable reference.

---

## Development

### Project Structure

```
whatsapp-notification-service/
├── packages/
│   ├── api/              # REST API service
│   ├── worker/           # SQS worker service
│   └── shared/           # Shared types and utilities
├── infrastructure/
│   └── database/         # Database schema
├── docs/                 # Documentation
├── prisma/               # Prisma schema and migrations
└── docker-compose.yml    # Docker configuration
```

### Scripts

```bash
# Development
npm run dev:api          # Start API in dev mode
npm run dev:worker       # Start worker in dev mode

# Building
npm run build            # Build all packages
npm run build:api        # Build API only
npm run build:worker     # Build worker only

# Testing
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report

# Database
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix linting issues
npm run format           # Format code with Prettier
```

---

## Deployment

### Docker

```bash
# Build and run
docker-compose up -d

# Scale services
docker-compose up -d --scale worker=3
```

### AWS ECS

```bash
# Deploy to production
./scripts/deploy.sh production
```

**Deployment Guide:** See [docs/deployment.md](docs/deployment.md) for:
- Docker deployment
- AWS ECS setup
- Database migrations
- Scaling strategies
- Backup and recovery

---

## Monitoring

### Sentry

Error tracking and performance monitoring automatically enabled in production.

### CloudWatch

Logs stream to:
- `/whatsapp-notif/api` - API logs
- `/whatsapp-notif/worker` - Worker logs

### Metrics

- Message delivery rate
- Success/failure rates
- Processing latency
- Queue depth

**Monitoring Setup:** See [docs/monitoring.md](docs/monitoring.md) for:
- Sentry configuration
- CloudWatch setup
- Metrics and dashboards
- Alert configuration

---

## Testing

```bash
# Run all tests
npm test

# Unit tests only
npm test -- --testPathPattern=unit

# Integration tests
npm test -- --testPathPattern=integration

# Coverage report
npm run test:coverage
```

**Coverage:** 70%+ (target: 85%)

**Testing Guide:** See [docs/testing.md](docs/testing.md) for:
- Test structure and organization
- Writing unit and integration tests
- Mocking strategies
- Coverage goals

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Performance

- **Throughput:** 5,000+ messages/minute
- **Latency:** p95 < 200ms (API), p95 < 5s (delivery)
- **Availability:** 99.9% uptime
- **Success Rate:** 99%+ delivery success

---

## Security

- API key authentication
- Rate limiting (per tenant and recipient)
- Input validation with Zod
- SQL injection protection (Prisma)
- Secrets management (AWS Secrets Manager)
- Regular security audits

[Security Policy →](SECURITY.md)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Documentation

### Guides

- **[Architecture](docs/architecture.md)** - System design, components, and data flow
- **[Deployment](docs/deployment.md)** - Docker and AWS deployment procedures
- **[Monitoring](docs/monitoring.md)** - Sentry and CloudWatch setup
- **[Testing](docs/testing.md)** - Testing strategy and guidelines
- **[Operations Runbook](docs/runbook.md)** - Incident response and maintenance

### Getting Started

- **[Contributing](CONTRIBUTING.md)** - How to contribute to this project
- **[Environment Setup](.env.example)** - Configuration reference

---

## Support

- [Documentation](docs/)
- [Issue Tracker](https://github.com/yourusername/whatsapp-notification-service/issues)
- [Discussions](https://github.com/yourusername/whatsapp-notification-service/discussions)


---

## Acknowledgments

- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [Fastify](https://www.fastify.io/)
- [Prisma](https://www.prisma.io/)
- [AWS SDK](https://aws.amazon.com/sdk-for-javascript/)

---

**Built by [Your Name](https://github.com/yourusername)**
