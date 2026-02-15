# Monitoring Configuration

## Sentry (Error Tracking)

### Setup
1. Create account at https://sentry.io
2. Create new project for Node.js
3. Copy DSN from project settings

### Environment Variables
```bash
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

### Features
- Automatic error capture
- Performance monitoring
- Error grouping and alerts
- Release tracking

---

## CloudWatch (Centralized Logging)

### Setup
1. AWS CloudWatch is automatically available in AWS
2. Ensure IAM permissions for logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents

### Environment Variables
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

### Log Groups
- `/whatsapp-notif/api` - API service logs
- `/whatsapp-notif/worker` - Worker service logs

### Features
- Centralized log aggregation
- Log retention policies
- CloudWatch Insights queries
- Metric filters and alarms

---

## Usage

### Error Tracking
```typescript
import { captureException, captureMessage } from '@whatsapp-notif/shared';

try {
  // code
} catch (error) {
  captureException(error, { context: 'additional info' });
}

captureMessage('Important event', 'warning');
```

### Logging
```typescript
import { logger } from '@whatsapp-notif/shared';

logger.info('User action', { userId, action });
logger.error('Failed operation', { error, context });
```

Errors are automatically sent to Sentry when using `logger.error()` with an error object.

---

## Production Checklist

- [ ] Set SENTRY_DSN environment variable
- [ ] Configure AWS credentials for CloudWatch
- [ ] Set NODE_ENV=production
- [ ] Configure log retention in CloudWatch (e.g., 30 days)
- [ ] Set up Sentry alerts for critical errors
- [ ] Create CloudWatch dashboards for key metrics

---

## Cost Optimization

**Sentry:**
- Free tier: 5,000 errors/month
- Adjust sample rates in production (currently 10%)

**CloudWatch:**
- Free tier: 5GB ingestion, 5GB storage
- Set log retention to 7-30 days
- Use metric filters instead of querying logs

---

## Monitoring Best Practices

1. **Error Context**: Always include relevant context when capturing errors
2. **Sampling**: Use lower sample rates in production to reduce costs
3. **Alerts**: Set up alerts for critical errors and high error rates
4. **Privacy**: Don't log sensitive data (passwords, tokens, PII)
5. **Retention**: Set appropriate log retention based on compliance needs
