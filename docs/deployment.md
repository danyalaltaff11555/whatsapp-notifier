# Deployment Guide

## Overview

This guide covers deploying the WhatsApp Notification Microservice to production using Docker and AWS services.

---

## Prerequisites

- Docker and Docker Compose installed
- AWS account with appropriate permissions
- Node.js 20+ and npm 10+
- PostgreSQL 14+ database
- Redis 7+ instance
- WhatsApp Business API credentials

---

## Environment Setup

### 1. Environment Variables

Create `.env` file in project root:

```bash
# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:password@host:5432/whatsapp_notifications

# Redis
REDIS_URL=redis://host:6379

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/account/queue-name

# WhatsApp Business API
WHATSAPP_API_URL=https://graph.facebook.com
WHATSAPP_API_VERSION=v18.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token

# Monitoring
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# API Keys (comma-separated)
API_KEYS=key1,key2,key3

# Rate Limiting
RATE_LIMIT_TENANT_PER_MINUTE=100
RATE_LIMIT_RECIPIENT_PER_HOUR=10
```

---

## Docker Deployment

### Build Images

```bash
# Build all services
docker-compose build

# Build specific service
docker-compose build api
docker-compose build worker
```

### Run Services

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d api
docker-compose up -d worker

# View logs
docker-compose logs -f api
docker-compose logs -f worker

# Stop services
docker-compose down
```

### Docker Compose Configuration

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: packages/worker/Dockerfile
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: whatsapp_notifications
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## AWS Deployment

### 1. Database Setup (RDS)

```bash
# Create PostgreSQL RDS instance
aws rds create-db-instance \
  --db-instance-identifier whatsapp-notif-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username admin \
  --master-user-password YourPassword \
  --allocated-storage 20

# Get connection string
aws rds describe-db-instances \
  --db-instance-identifier whatsapp-notif-db \
  --query 'DBInstances[0].Endpoint.Address'
```

### 2. Redis Setup (ElastiCache)

```bash
# Create Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id whatsapp-notif-cache \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1
```

### 3. SQS Queue Setup

```bash
# Create SQS queue
aws sqs create-queue \
  --queue-name whatsapp-notifications \
  --attributes VisibilityTimeout=30,MessageRetentionPeriod=1209600

# Create dead letter queue
aws sqs create-queue \
  --queue-name whatsapp-notifications-dlq \
  --attributes MessageRetentionPeriod=1209600
```

### 4. ECS Deployment (Fargate)

```bash
# Create ECS cluster
aws ecs create-cluster --cluster-name whatsapp-notif-cluster

# Register task definitions
aws ecs register-task-definition --cli-input-json file://task-definition-api.json
aws ecs register-task-definition --cli-input-json file://task-definition-worker.json

# Create services
aws ecs create-service \
  --cluster whatsapp-notif-cluster \
  --service-name api \
  --task-definition whatsapp-notif-api \
  --desired-count 2 \
  --launch-type FARGATE

aws ecs create-service \
  --cluster whatsapp-notif-cluster \
  --service-name worker \
  --task-definition whatsapp-notif-worker \
  --desired-count 1 \
  --launch-type FARGATE
```

---

## Database Migration

### Run Migrations

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate deploy

# Seed database (optional)
npm run prisma:seed
```

### Rollback

```bash
# Rollback last migration
npx prisma migrate resolve --rolled-back <migration-name>
```

---

## Health Checks

### API Health

```bash
curl http://localhost:3000/health
# Expected: {"status":"healthy","version":"1.0.0"}
```

### Database Connection

```bash
curl http://localhost:3000/v1/health
# Check database.connected: true
```

---

## Monitoring Setup

### CloudWatch Logs

Logs automatically stream to:
- `/whatsapp-notif/api` - API service logs
- `/whatsapp-notif/worker` - Worker service logs

### Sentry

1. Create project at https://sentry.io
2. Copy DSN to `SENTRY_DSN` environment variable
3. Errors automatically tracked

---

## Scaling

### Horizontal Scaling

```bash
# Scale API service
aws ecs update-service \
  --cluster whatsapp-notif-cluster \
  --service api \
  --desired-count 4

# Scale worker service
aws ecs update-service \
  --cluster whatsapp-notif-cluster \
  --service worker \
  --desired-count 2
```

### Auto-scaling

```bash
# Create auto-scaling target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/whatsapp-notif-cluster/api \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

# Create scaling policy
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/whatsapp-notif-cluster/api \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy.json
```

---

## Backup & Recovery

### Database Backups

```bash
# Enable automated backups (RDS)
aws rds modify-db-instance \
  --db-instance-identifier whatsapp-notif-db \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00"

# Manual backup
aws rds create-db-snapshot \
  --db-instance-identifier whatsapp-notif-db \
  --db-snapshot-identifier whatsapp-notif-backup-$(date +%Y%m%d)
```

### Restore from Backup

```bash
# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier whatsapp-notif-db-restored \
  --db-snapshot-identifier whatsapp-notif-backup-20260215
```

---

## Rollback Procedure

### 1. Identify Issue

```bash
# Check service status
aws ecs describe-services \
  --cluster whatsapp-notif-cluster \
  --services api worker

# Check logs
aws logs tail /whatsapp-notif/api --follow
```

### 2. Rollback Deployment

```bash
# Update to previous task definition
aws ecs update-service \
  --cluster whatsapp-notif-cluster \
  --service api \
  --task-definition whatsapp-notif-api:previous-version
```

### 3. Verify

```bash
# Check health
curl http://api-endpoint/health

# Monitor logs
docker-compose logs -f api
```

---

## Security Checklist

- [ ] All secrets in AWS Secrets Manager
- [ ] API keys rotated regularly
- [ ] Database encrypted at rest
- [ ] TLS/SSL enabled for all connections
- [ ] Security groups properly configured
- [ ] IAM roles follow least privilege
- [ ] Regular security audits (`npm audit`)
- [ ] Rate limiting enabled
- [ ] CORS properly configured

---

## Troubleshooting

### Common Issues

**Database Connection Errors**
```bash
# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

**SQS Permission Errors**
```bash
# Verify IAM permissions
aws sqs get-queue-attributes --queue-url $SQS_QUEUE_URL
```

**High Memory Usage**
```bash
# Check container stats
docker stats

# Increase memory limits in task definition
```

---

## Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] SQS queues created
- [ ] Monitoring enabled (Sentry, CloudWatch)
- [ ] Health checks passing
- [ ] Load testing completed
- [ ] Backup strategy implemented
- [ ] Rollback procedure tested
- [ ] Documentation updated
- [ ] Team trained on operations
