# Operations Runbook

## Overview

This runbook provides step-by-step procedures for common operational tasks and incident response.

---

## Daily Operations

### Health Monitoring

**Check Service Health**
```bash
# API health
curl https://api.example.com/health

# Expected response
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-12-20T10:00:00Z"
}
```

**Check Database Connection**
```bash
curl https://api.example.com/v1/health

# Check database.connected: true
```

**Monitor Queue Depth**
```bash
aws sqs get-queue-attributes \
  --queue-url $SQS_QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages

# Alert if > 1000 messages
```

---

## Incident Response

### High Error Rate

**Symptoms:**
- Error rate > 5%
- Sentry alerts firing
- Failed deliveries increasing

**Investigation:**
1. Check Sentry for error patterns
2. Review CloudWatch logs
3. Check WhatsApp API status
4. Verify database connectivity

**Resolution:**
```bash
# Check recent errors
aws logs tail /whatsapp-notif/worker --since 10m --filter-pattern ERROR

# Check WhatsApp API status
curl https://status.fb.com/api/v2/components.json

# Restart worker if needed
docker-compose restart worker
```

---

### Database Connection Issues

**Symptoms:**
- "Connection pool exhausted" errors
- Slow API responses
- Database timeout errors

**Investigation:**
```bash
# Check active connections
SELECT count(*) FROM pg_stat_activity;

# Check long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;
```

**Resolution:**
```bash
# Kill long-running query
SELECT pg_terminate_backend(PID);

# Restart API service
docker-compose restart api

# Increase connection pool if needed
# Edit DATABASE_URL: ?connection_limit=20
```

---

### Queue Backup

**Symptoms:**
- SQS queue depth > 1000
- Messages not processing
- Delivery delays

**Investigation:**
```bash
# Check queue metrics
aws sqs get-queue-attributes \
  --queue-url $SQS_QUEUE_URL \
  --attribute-names All

# Check worker logs
docker-compose logs worker --tail=100
```

**Resolution:**
```bash
# Scale up workers
docker-compose up -d --scale worker=5

# Or in AWS ECS
aws ecs update-service \
  --cluster whatsapp-notif-cluster \
  --service worker \
  --desired-count 5

# Monitor queue drain
watch -n 5 'aws sqs get-queue-attributes --queue-url $SQS_QUEUE_URL --attribute-names ApproximateNumberOfMessages'
```

---

### WhatsApp API Rate Limiting

**Symptoms:**
- 429 errors from WhatsApp
- "Rate limit exceeded" in logs
- Failed deliveries

**Investigation:**
```bash
# Check rate limit errors
aws logs filter-pattern "429" \
  --log-group-name /whatsapp-notif/worker \
  --start-time $(date -d '1 hour ago' +%s)000
```

**Resolution:**
```bash
# Reduce worker concurrency
# Edit docker-compose.yml or environment variable
WORKER_CONCURRENCY=2

# Restart workers
docker-compose restart worker

# Implement backoff strategy (already in code)
# Messages will auto-retry with exponential backoff
```

---

## Maintenance Tasks

### Database Backup

**Manual Backup**
```bash
# Create snapshot
aws rds create-db-snapshot \
  --db-instance-identifier whatsapp-notif-db \
  --db-snapshot-identifier backup-$(date +%Y%m%d-%H%M%S)

# Verify backup
aws rds describe-db-snapshots \
  --db-snapshot-identifier backup-20240101-120000
```

**Restore from Backup**
```bash
# Restore to new instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier whatsapp-notif-db-restored \
  --db-snapshot-identifier backup-20240101-120000

# Update connection string
# Point DATABASE_URL to new instance
```

---

### Database Migration

**Run Migration**
```bash
# Backup first!
npm run prisma:migrate deploy

# Verify
npm run prisma:studio
```

**Rollback Migration**
```bash
# Mark as rolled back
npx prisma migrate resolve --rolled-back <migration-name>

# Restore from backup if needed
```

---

### Log Rotation

**CloudWatch Logs**
```bash
# Set retention policy (30 days)
aws logs put-retention-policy \
  --log-group-name /whatsapp-notif/api \
  --retention-in-days 30

aws logs put-retention-policy \
  --log-group-name /whatsapp-notif/worker \
  --retention-in-days 30
```

---

### API Key Rotation

**Generate New Key**
```bash
# Generate secure key
openssl rand -hex 32

# Add to database
# Update API_KEYS environment variable
# Restart API service
docker-compose restart api
```

**Revoke Old Key**
```bash
# Remove from API_KEYS
# Restart API service
# Notify clients to update
```

---

## Performance Tuning

### Optimize Database Queries

**Find Slow Queries**
```sql
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Add Indexes**
```sql
-- Example: Index on recipient_phone for rate limiting
CREATE INDEX idx_notifications_recipient_phone 
ON notifications(recipient_phone);
```

---

### Scale Services

**Horizontal Scaling**
```bash
# Scale API
docker-compose up -d --scale api=3

# Scale Worker
docker-compose up -d --scale worker=5

# AWS ECS
aws ecs update-service \
  --cluster whatsapp-notif-cluster \
  --service api \
  --desired-count 3
```

---

## Monitoring Checklist

**Daily**
- [ ] Check error rate (< 1%)
- [ ] Verify queue depth (< 100)
- [ ] Review Sentry errors
- [ ] Check API response times

**Weekly**
- [ ] Review CloudWatch metrics
- [ ] Check database performance
- [ ] Verify backup completion
- [ ] Update dependencies (security)

**Monthly**
- [ ] Review capacity planning
- [ ] Analyze cost optimization
- [ ] Security audit
- [ ] Documentation updates

---

## Emergency Contacts

- **On-Call Engineer:** [Phone/Slack]
- **Database Admin:** [Contact]
- **AWS Support:** [Account details]
- **WhatsApp Support:** [Business API support]

---

## Useful Commands

```bash
# View API logs
docker-compose logs -f api

# View worker logs
docker-compose logs -f worker

# Check container status
docker-compose ps

# Restart all services
docker-compose restart

# View database logs
docker-compose logs postgres

# Connect to database
docker-compose exec postgres psql -U postgres -d whatsapp_notifications

# Redis CLI
docker-compose exec redis redis-cli

# Check SQS messages
aws sqs receive-message --queue-url $SQS_QUEUE_URL

# Purge SQS queue (DANGER!)
aws sqs purge-queue --queue-url $SQS_QUEUE_URL
```

---

## Troubleshooting Guide

### API Not Responding

1. Check if container is running: `docker-compose ps`
2. Check logs: `docker-compose logs api`
3. Check port binding: `netstat -tulpn | grep 3000`
4. Restart: `docker-compose restart api`

### Worker Not Processing

1. Check SQS connectivity
2. Verify AWS credentials
3. Check worker logs for errors
4. Verify database connection
5. Check WhatsApp API credentials

### Database Connection Errors

1. Verify DATABASE_URL is correct
2. Check if PostgreSQL is running
3. Test connection: `psql $DATABASE_URL`
4. Check connection pool settings
5. Review database logs

---

## Disaster Recovery

### Complete System Failure

1. **Assess Impact**
   - Check all services status
   - Identify root cause
   - Estimate recovery time

2. **Restore Services**
   ```bash
   # Restore database from backup
   # Update connection strings
   # Restart all services
   docker-compose down
   docker-compose up -d
   ```

3. **Verify Recovery**
   - Test API endpoints
   - Check worker processing
   - Verify database connectivity
   - Monitor error rates

4. **Post-Incident**
   - Document incident
   - Update runbook
   - Implement preventive measures
   - Conduct post-mortem

---

## Security Incidents

### Suspected API Key Compromise

1. **Immediate Actions**
   - Rotate compromised key
   - Review access logs
   - Check for unusual activity

2. **Investigation**
   ```bash
   # Check recent API calls
   aws logs filter-pattern "X-API-Key: compromised_key" \
     --log-group-name /whatsapp-notif/api
   ```

3. **Remediation**
   - Generate new keys
   - Update clients
   - Monitor for abuse

### Data Breach

1. Follow security incident response plan
2. Notify security team
3. Preserve evidence
4. Assess data exposure
5. Notify affected parties if required
