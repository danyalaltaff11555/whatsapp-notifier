# WhatsApp Notification Microservice - System Design Document

## Table of Contents
1. [Overview](#1-overview)
2. [System Requirements](#2-system-requirements)
3. [API Design](#3-api-design)
4. [Data Models](#4-data-models)
5. [Message Flow](#5-message-flow)
6. [Rate Limiting Design](#6-rate-limiting-design)
7. [Retry Mechanism](#7-retry-mechanism)
8. [Monitoring & Metrics](#8-monitoring--metrics)
9. [Security Design](#9-security-design)
10. [Scalability Considerations](#10-scalability-considerations)
11. [Failure Scenarios](#11-failure-scenarios)
12. [Performance Optimization](#12-performance-optimization)

---

## 1. Overview

### 1.1 Purpose
A production-ready, event-driven microservice that enables applications to send WhatsApp notifications reliably at scale. The service abstracts away the complexity of WhatsApp API integration, retry logic, rate limiting, and delivery tracking.

### 1.2 Design Goals
- **Reliability**: Guarantee message delivery with retry mechanisms
- **Scalability**: Handle 5,000+ messages per minute
- **Low Latency**: Process notifications within 5 seconds (p95)
- **Observability**: Complete visibility into system behavior
- **Maintainability**: Clean, testable, well-documented code

### 1.3 Success Metrics
- **Delivery Rate**: >99% successful delivery
- **API Latency**: p95 < 200ms
- **Processing Time**: p95 < 5 seconds
- **Uptime**: 99.9% availability
- **Error Rate**: <0.1%

---

## 2. System Requirements

### 2.1 Functional Requirements

**Core Features**
- FR1: Accept notification events via REST API
- FR2: Validate and enqueue messages to SQS
- FR3: Process messages asynchronously via Lambda
- FR4: Send messages via WhatsApp Business API
- FR5: Track delivery status (queued → sent → delivered → read)
- FR6: Implement retry logic with exponential backoff
- FR7: Handle rate limits (recipient-level and API-level)
- FR8: Support message templates with dynamic parameters
- FR9: Provide status query endpoint
- FR10: Send webhook callbacks to client apps

**Advanced Features**
- FR11: Bulk notification support
- FR12: Message scheduling
- FR13: Priority queue support
- FR14: Multi-language template support
- FR15: Dead letter queue for failed messages

### 2.2 Non-Functional Requirements

**Performance**
- NFR1: Support 5,000 messages/minute sustained load
- NFR2: Handle 10,000 messages/minute peak load
- NFR3: API response time p95 < 200ms
- NFR4: Message processing time p95 < 5 seconds

**Reliability**
- NFR5: 99.9% uptime SLA
- NFR6: Zero message loss
- NFR7: At-least-once delivery guarantee
- NFR8: Automatic failover within 30 seconds

**Scalability**
- NFR9: Horizontal scaling for all components
- NFR10: Auto-scaling based on queue depth
- NFR11: Support 10M+ messages/day

**Security**
- NFR12: TLS 1.3 for all communications
- NFR13: API key authentication
- NFR14: Encryption at rest and in transit
- NFR15: GDPR compliance

**Observability**
- NFR16: Structured logging for all events
- NFR17: Distributed tracing for request flow
- NFR18: Real-time metrics dashboard
- NFR19: Alerting within 2 minutes of incidents

### 2.3 Constraints

**Technical Constraints**
- WhatsApp API rate limit: 80 messages/second per phone number
- WhatsApp API timeout: 30 seconds
- Lambda execution timeout: 5 minutes (practical limit: 2 minutes)
- SQS message size limit: 256 KB
- Database connection limit: 100 connections per instance

**Business Constraints**
- WhatsApp templates must be pre-approved
- Message cost: $0.004 - $0.01 per message (varies by country)
- Operating budget: $1,500/month (excluding WhatsApp costs)

---

## 3. API Design

### 3.1 API Specification (OpenAPI 3.0)

#### 3.1.1 Send Notification

**Endpoint**: `POST /v1/notifications`

**Request Headers**
```
Authorization: Bearer {api_key}
Content-Type: application/json
X-Idempotency-Key: {uuid} (optional)
X-Trace-Id: {trace_id} (optional)
```

**Request Body**
```json
{
  "event_type": "order.placed",
  "recipient": {
    "phone_number": "+1234567890"
  },
  "template": {
    "name": "order_confirmation",
    "language": "en",
    "parameters": [
      { "type": "text", "value": "John Doe" },
      { "type": "text", "value": "ORD-12345" },
      { "type": "currency", "value": "99.99" }
    ]
  },
  "metadata": {
    "order_id": "ORD-12345",
    "customer_id": "CUST-789"
  },
  "priority": "normal",
  "scheduled_for": "2025-02-15T14:30:00Z"
}
```

**Response (201 Created)**
```json
{
  "id": "notif_7x8y9z0a1b2c3d4e",
  "status": "queued",
  "recipient": "+1234567890",
  "created_at": "2025-02-15T14:00:00Z",
  "estimated_delivery": "2025-02-15T14:30:05Z"
}
```

**Error Response (400 Bad Request)**
```json
{
  "error": {
    "code": "INVALID_PHONE_NUMBER",
    "message": "Phone number must be in E.164 format",
    "field": "recipient.phone_number",
    "trace_id": "abc123xyz"
  }
}
```

**Validation Rules**
```typescript
const notificationSchema = z.object({
  event_type: z.string().min(1).max(100),
  recipient: z.object({
    phone_number: z.string().regex(/^\+[1-9]\d{1,14}$/) // E.164 format
  }),
  template: z.object({
    name: z.string().min(1).max(255),
    language: z.string().length(2), // ISO 639-1
    parameters: z.array(z.object({
      type: z.enum(['text', 'currency', 'date_time']),
      value: z.string()
    }))
  }).optional(),
  message: z.object({
    text: z.string().min(1).max(4096)
  }).optional(),
  metadata: z.record(z.any()).optional(),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  scheduled_for: z.string().datetime().optional()
}).refine(
  data => data.template || data.message,
  { message: "Either 'template' or 'message' must be provided" }
);
```

#### 3.1.2 Get Notification Status

**Endpoint**: `GET /v1/notifications/{notification_id}`

**Response (200 OK)**
```json
{
  "id": "notif_7x8y9z0a1b2c3d4e",
  "event_type": "order.placed",
  "recipient": "+1234567890",
  "status": "delivered",
  "whatsapp_message_id": "wamid.ABCxyz123==",
  "created_at": "2025-02-15T14:00:00Z",
  "sent_at": "2025-02-15T14:00:03Z",
  "delivered_at": "2025-02-15T14:00:05Z",
  "delivery_attempts": 1,
  "metadata": {
    "order_id": "ORD-12345"
  }
}
```

#### 3.1.3 Bulk Send Notifications

**Endpoint**: `POST /v1/notifications/bulk`

**Request Body**
```json
{
  "notifications": [
    {
      "event_type": "order.shipped",
      "recipient": { "phone_number": "+1234567890" },
      "template": { /* ... */ }
    },
    // ... up to 100 notifications
  ],
  "batch_id": "batch_abc123"
}
```

**Response (202 Accepted)**
```json
{
  "batch_id": "batch_abc123",
  "total": 100,
  "queued": 98,
  "failed": 2,
  "errors": [
    {
      "index": 5,
      "error": "Invalid phone number format"
    },
    {
      "index": 23,
      "error": "Template not found"
    }
  ]
}
```

#### 3.1.4 Health Check

**Endpoint**: `GET /health`

**Response (200 OK)**
```json
{
  "status": "healthy",
  "timestamp": "2025-02-15T14:00:00Z",
  "version": "1.2.3",
  "checks": {
    "database": {
      "status": "healthy",
      "latency_ms": 15
    },
    "redis": {
      "status": "healthy",
      "latency_ms": 5
    },
    "sqs": {
      "status": "healthy",
      "queue_depth": 1234
    },
    "whatsapp_api": {
      "status": "healthy",
      "last_check": "2025-02-15T13:59:50Z"
    }
  }
}
```

### 3.2 Webhook Callbacks

**Client Webhook Specification**

Clients can register webhooks to receive delivery status updates.

**Webhook Configuration**
```json
{
  "url": "https://client-app.com/webhooks/notifications",
  "events": ["sent", "delivered", "failed"],
  "secret": "whsec_xyz123abc456" // For signature verification
}
```

**Webhook Payload**
```json
{
  "event": "notification.delivered",
  "timestamp": "2025-02-15T14:00:05Z",
  "data": {
    "notification_id": "notif_7x8y9z0a1b2c3d4e",
    "status": "delivered",
    "recipient": "+1234567890",
    "metadata": {
      "order_id": "ORD-12345"
    }
  }
}
```

**Webhook Signature** (HMAC-SHA256)
```
X-Webhook-Signature: t=1708006805,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

**Signature Verification**
```typescript
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const [timestampPart, signaturePart] = signature.split(',');
  const timestamp = timestampPart.split('=')[1];
  const expectedSignature = signaturePart.split('=')[1];
  
  const signedPayload = `${timestamp}.${payload}`;
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(computedSignature)
  );
}
```

---

## 4. Data Models

### 4.1 Core Domain Models

#### 4.1.1 Notification

```typescript
interface Notification {
  // Identity
  id: string;                        // UUID
  tenant_id: string;                 // Multi-tenancy
  
  // Event information
  event_type: string;                // e.g., "order.placed"
  
  // Recipient
  recipient_phone: string;           // E.164 format
  recipient_country: string;         // ISO 3166-1 alpha-2
  
  // Message content
  template_name?: string;
  template_language?: string;
  template_parameters?: TemplateParameter[];
  message_text?: string;
  
  // Status tracking
  status: NotificationStatus;
  whatsapp_message_id?: string;
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
  scheduled_for?: Date;
  sent_at?: Date;
  delivered_at?: Date;
  read_at?: Date;
  failed_at?: Date;
  
  // Error tracking
  error_code?: string;
  error_message?: string;
  
  // Retry metadata
  attempt_number: number;
  max_attempts: number;
  next_retry_at?: Date;
  
  // Client metadata
  metadata?: Record<string, any>;
  priority: Priority;
  
  // Tracing
  trace_id: string;
}

enum NotificationStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  RATE_LIMITED = 'rate_limited',
  SCHEDULED = 'scheduled'
}

enum Priority {
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low'
}

interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time';
  value: string;
}
```

#### 4.1.2 Delivery Log

```typescript
interface DeliveryLog {
  id: number;                        // Auto-increment
  notification_id: string;           // FK to Notification
  
  status: NotificationStatus;
  attempt_number: number;
  whatsapp_message_id?: string;
  
  // Error details
  error_code?: string;
  error_message?: string;
  
  // Timing
  created_at: Date;
  
  // API response (for debugging)
  api_response?: Record<string, any>;
}
```

#### 4.1.3 Rate Limit

```typescript
interface RateLimit {
  id: number;
  recipient_phone: string;
  
  // Time window
  window_start: Date;
  window_end: Date;
  
  // Counter
  message_count: number;
  
  created_at: Date;
  updated_at: Date;
}
```

#### 4.1.4 Template

```typescript
interface Template {
  id: string;
  tenant_id: string;
  
  // Template identity
  name: string;
  language: string;                  // ISO 639-1
  category: 'marketing' | 'utility' | 'authentication';
  status: 'approved' | 'pending' | 'rejected';
  
  // Template structure
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    example?: string;
  };
  body: {
    text: string;                    // Can contain {{1}}, {{2}}, etc.
    examples: string[][];
  };
  footer?: {
    text: string;
  };
  buttons?: Button[];
  
  // WhatsApp template ID
  whatsapp_template_id?: string;
  
  created_at: Date;
  updated_at: Date;
}

interface Button {
  type: 'quick_reply' | 'url' | 'phone_number';
  text: string;
  url?: string;
  phone_number?: string;
}
```

### 4.2 State Machine

**Notification Status Transitions**

```
                    ┌─────────┐
                    │SCHEDULED│
                    └────┬────┘
                         │ (when scheduled_for time arrives)
                         ▼
    ┌──────────┐    ┌───────┐    ┌──────────┐
    │   API    │───▶│QUEUED │───▶│PROCESSING│
    │ Request  │    └───┬───┘    └────┬─────┘
    └──────────┘        │             │
                        │             │ (WhatsApp API call)
                        │             ▼
                        │        ┌────────┐
                        │        │  SENT  │
                        │        └───┬────┘
                        │            │ (delivery confirmation)
                        │            ▼
                        │      ┌───────────┐
                        │      │ DELIVERED │
                        │      └─────┬─────┘
                        │            │ (read receipt)
                        │            ▼
                        │       ┌────────┐
                        │       │  READ  │
                        │       └────────┘
                        │
                        │ (rate limit hit)
                        ▼
                  ┌─────────────┐
                  │RATE_LIMITED │
                  └──────┬──────┘
                         │ (retry after cooldown)
                         │
                         │ (any retriable error)
                         ▼
                    ┌────────┐
                    │ QUEUED │ (with incremented attempt_number)
                    └────┬───┘
                         │
                         │ (max attempts reached or non-retriable error)
                         ▼
                    ┌────────┐
                    │ FAILED │
                    └────────┘
```

**Allowed Transitions**
```typescript
const ALLOWED_TRANSITIONS: Record<NotificationStatus, NotificationStatus[]> = {
  [NotificationStatus.SCHEDULED]: [NotificationStatus.QUEUED],
  [NotificationStatus.QUEUED]: [
    NotificationStatus.PROCESSING,
    NotificationStatus.FAILED
  ],
  [NotificationStatus.PROCESSING]: [
    NotificationStatus.SENT,
    NotificationStatus.RATE_LIMITED,
    NotificationStatus.FAILED,
    NotificationStatus.QUEUED // for retry
  ],
  [NotificationStatus.SENT]: [
    NotificationStatus.DELIVERED,
    NotificationStatus.FAILED
  ],
  [NotificationStatus.DELIVERED]: [NotificationStatus.READ],
  [NotificationStatus.READ]: [],
  [NotificationStatus.FAILED]: [],
  [NotificationStatus.RATE_LIMITED]: [NotificationStatus.QUEUED]
};
```

---

## 5. Message Flow

### 5.1 Happy Path Flow

```
1. Client App                 2. API Gateway               3. SQS Queue
   │                             │                            │
   │ POST /v1/notifications      │                            │
   ├────────────────────────────▶│                            │
   │                             │ Validate request           │
   │                             │ Check API key              │
   │                             │ Check rate limit           │
   │                             │                            │
   │                             │ Publish to SQS             │
   │                             ├───────────────────────────▶│
   │                             │                            │
   │                             │ Save to DB (status=queued) │
   │                             │                            │
   │ ◀────────────────────────────┤                            │
   │ 201 Created                 │                            │
   │ { id, status: "queued" }    │                            │
   │                             │                            │
   
4. Lambda Worker              5. WhatsApp API              6. Database
   │                             │                            │
   │ Poll messages               │                            │
   ◀─────────────────────────────┤                            │
   │                             │                            │
   │ Parse & validate            │                            │
   │ Check rate limit (Redis)    │                            │
   │                             │                            │
   │ Update status=processing    │                            │
   ├────────────────────────────────────────────────────────▶│
   │                             │                            │
   │ Send message                │                            │
   ├────────────────────────────▶│                            │
   │                             │ Process & deliver          │
   │                             │                            │
   │ ◀────────────────────────────┤                            │
   │ { message_id, status }      │                            │
   │                             │                            │
   │ Update status=sent          │                            │
   ├────────────────────────────────────────────────────────▶│
   │                             │                            │
   │ Log delivery                │                            │
   ├────────────────────────────────────────────────────────▶│
   │                             │                            │
   │ Delete from SQS             │                            │
   │                             │                            │

7. WhatsApp Webhook           8. API Gateway (webhook endpoint)
   │                             │
   │ POST /webhooks/whatsapp     │
   │ { status: "delivered" }     │
   ├────────────────────────────▶│
   │                             │ Verify signature
   │                             │ Update DB (status=delivered)
   │                             │ Trigger client webhooks
   │                             │
```

### 5.2 Detailed Processing Steps

#### Step 1: API Request Ingestion
```typescript
async function handleNotificationRequest(
  req: Request,
  res: Response
): Promise<void> {
  const startTime = Date.now();
  const traceId = req.headers['x-trace-id'] || generateTraceId();
  
  try {
    // 1. Authenticate
    const apiKey = extractApiKey(req);
    const tenant = await authenticateApiKey(apiKey);
    
    // 2. Validate request body
    const validatedData = notificationSchema.parse(req.body);
    
    // 3. Check rate limit
    const rateLimitKey = `ratelimit:tenant:${tenant.id}`;
    const allowed = await checkRateLimit(rateLimitKey, 100, 60);
    if (!allowed) {
      throw new RateLimitError('Rate limit exceeded');
    }
    
    // 4. Generate notification ID
    const notificationId = generateId('notif');
    
    // 5. Create database record
    const notification = await db.notification.create({
      data: {
        id: notificationId,
        tenant_id: tenant.id,
        status: NotificationStatus.QUEUED,
        trace_id: traceId,
        ...validatedData
      }
    });
    
    // 6. Publish to SQS
    const messageId = await publishToSQS({
      id: notificationId,
      ...validatedData,
      tenant_id: tenant.id,
      trace_id: traceId,
      attempt_number: 0,
      max_attempts: 3
    });
    
    // 7. Log metrics
    metrics.increment('notifications.created', {
      tenant_id: tenant.id,
      event_type: validatedData.event_type
    });
    
    // 8. Return response
    res.status(201).json({
      id: notificationId,
      status: NotificationStatus.QUEUED,
      recipient: validatedData.recipient.phone_number,
      created_at: notification.created_at,
      estimated_delivery: estimateDeliveryTime()
    });
    
    // 9. Log request
    logger.info('Notification created', {
      notification_id: notificationId,
      tenant_id: tenant.id,
      trace_id: traceId,
      duration_ms: Date.now() - startTime
    });
    
  } catch (error) {
    handleError(error, res, traceId);
  }
}
```

#### Step 2: Lambda Worker Processing
```typescript
async function processNotification(message: SQSMessage): Promise<void> {
  const notification = parseMessage(message);
  const startTime = Date.now();
  
  try {
    // 1. Update status to processing
    await updateNotificationStatus(
      notification.id,
      NotificationStatus.PROCESSING
    );
    
    // 2. Check recipient rate limit
    const recipientKey = `ratelimit:recipient:${notification.recipient_phone}`;
    const canSend = await checkRateLimitWithWindow(
      recipientKey,
      10,  // max 10 messages
      3600 // per hour
    );
    
    if (!canSend) {
      await handleRateLimitExceeded(notification);
      return;
    }
    
    // 3. Fetch template (if applicable)
    let messageContent: string;
    if (notification.template_name) {
      const template = await getTemplate(
        notification.tenant_id,
        notification.template_name,
        notification.template_language
      );
      messageContent = renderTemplate(template, notification.template_parameters);
    } else {
      messageContent = notification.message_text;
    }
    
    // 4. Send to WhatsApp API
    const result = await whatsappClient.sendMessage(
      notification.recipient_phone,
      messageContent,
      {
        template_name: notification.template_name,
        language: notification.template_language
      }
    );
    
    // 5. Update notification status
    await updateNotificationStatus(
      notification.id,
      NotificationStatus.SENT,
      {
        whatsapp_message_id: result.message_id,
        sent_at: new Date()
      }
    );
    
    // 6. Increment rate limit counter
    await incrementRateLimitCounter(recipientKey);
    
    // 7. Log delivery
    await logDelivery({
      notification_id: notification.id,
      status: 'success',
      attempt_number: notification.attempt_number,
      whatsapp_message_id: result.message_id,
      duration_ms: Date.now() - startTime
    });
    
    // 8. Record metrics
    metrics.increment('notifications.sent', {
      tenant_id: notification.tenant_id,
      event_type: notification.event_type
    });
    
    metrics.histogram('notification.processing_time', Date.now() - startTime, {
      tenant_id: notification.tenant_id
    });
    
  } catch (error) {
    await handleProcessingError(notification, error);
  }
}
```

---

## 6. Rate Limiting Design

### 6.1 Multi-Level Rate Limiting

**Rate Limit Hierarchy**
```
1. Global Level
   └─ 1000 requests/second across all tenants

2. Tenant Level
   ├─ 100 requests/minute per tenant
   ├─ 5000 requests/hour per tenant
   └─ 50000 requests/day per tenant

3. Recipient Level (Anti-Spam)
   ├─ 10 messages/hour per phone number
   └─ 50 messages/day per phone number

4. WhatsApp API Level
   └─ 80 messages/second per phone number ID
```

### 6.2 Sliding Window Algorithm Implementation

```typescript
class SlidingWindowRateLimiter {
  constructor(private redis: Redis) {}
  
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);
    
    // Use Redis sorted set for sliding window
    const pipeline = this.redis.pipeline();
    
    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart);
    
    // Count entries in current window
    pipeline.zcard(key);
    
    // Add current request with score = timestamp
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiration
    pipeline.expire(key, windowSeconds);
    
    const results = await pipeline.exec();
    const count = results[1][1] as number;
    
    const allowed = count < limit;
    const remaining = Math.max(0, limit - count - 1);
    const resetAt = new Date(now + (windowSeconds * 1000));
    
    return { allowed, remaining, resetAt };
  }
  
  async incrementCounter(
    key: string,
    windowSeconds: number
  ): Promise<void> {
    const now = Date.now();
    await this.redis.zadd(key, now, `${now}-${Math.random()}`);
    await this.redis.expire(key, windowSeconds);
  }
}
```

### 6.3 Rate Limit Response Headers

```typescript
// Add to API responses
function addRateLimitHeaders(
  res: Response,
  rateLimit: RateLimitResult
): void {
  res.setHeader('X-RateLimit-Limit', rateLimit.limit);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
  res.setHeader('X-RateLimit-Reset', rateLimit.resetAt.toISOString());
}

// Example response
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 2025-02-15T14:01:00Z
```

### 6.4 Rate Limit Exceeded Handling

```typescript
async function handleRateLimitExceeded(
  notification: Notification
): Promise<void> {
  // Update status
  await updateNotificationStatus(
    notification.id,
    NotificationStatus.RATE_LIMITED,
    {
      next_retry_at: calculateNextAvailableSlot(notification.recipient_phone)
    }
  );
  
  // Re-queue with delay
  const delaySeconds = calculateRateLimitDelay(notification.recipient_phone);
  await requeueMessage(notification, delaySeconds);
  
  // Log event
  logger.warn('Rate limit exceeded', {
    notification_id: notification.id,
    recipient: notification.recipient_phone,
    retry_at: new Date(Date.now() + delaySeconds * 1000)
  });
  
  // Metrics
  metrics.increment('notifications.rate_limited', {
    tenant_id: notification.tenant_id
  });
}

function calculateNextAvailableSlot(phoneNumber: string): Date {
  // Check how many messages have been sent in the current hour
  // Calculate when the oldest message will expire from the window
  // Return that timestamp
  // Implementation depends on sliding window data
  return new Date(Date.now() + 3600000); // 1 hour from now (simplified)
}
```

---

## 7. Retry Mechanism

### 7.1 Retry Policy

```typescript
interface RetryPolicy {
  max_attempts: 3;
  backoff_strategy: 'exponential';
  base_delay_seconds: 60;      // 1 minute
  max_delay_seconds: 3600;     // 1 hour
  jitter: true;                 // Add randomness to prevent thundering herd
  
  // Retryable error codes
  retryable_errors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    '500', // WhatsApp API server error
    '503', // Service unavailable
    '131047' // WhatsApp rate limit error
  ];
  
  // Non-retryable errors (fail immediately)
  permanent_errors: [
    '401', // Unauthorized
    '403', // Forbidden
    '404', // Not found
    '131026', // Invalid phone number
    '131031' // Invalid template
  ];
}
```

### 7.2 Exponential Backoff Implementation

```typescript
function calculateBackoff(attemptNumber: number): number {
  const baseDelay = 60; // 1 minute
  const maxDelay = 3600; // 1 hour
  const jitter = true;
  
  // Exponential: 60s, 120s, 240s, 480s, ...
  let delay = baseDelay * Math.pow(2, attemptNumber - 1);
  
  // Cap at max delay
  delay = Math.min(delay, maxDelay);
  
  // Add jitter (±25%)
  if (jitter) {
    const jitterAmount = delay * 0.25;
    delay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
  }
  
  return Math.floor(delay);
}

// Example delays:
// Attempt 1: 60s (± 15s jitter) = 45-75s
// Attempt 2: 120s (± 30s jitter) = 90-150s
// Attempt 3: 240s (± 60s jitter) = 180-300s
```

### 7.3 Retry Flow

```typescript
async function handleFailure(
  notification: Notification,
  error: Error
): Promise<void> {
  const isRetryable = determineIfRetryable(error);
  const hasAttemptsRemaining = 
    notification.attempt_number < notification.max_attempts;
  
  if (isRetryable && hasAttemptsRemaining) {
    // Calculate backoff delay
    const nextAttemptNumber = notification.attempt_number + 1;
    const delaySeconds = calculateBackoff(nextAttemptNumber);
    const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);
    
    // Update notification
    await updateNotification(notification.id, {
      status: NotificationStatus.QUEUED,
      attempt_number: nextAttemptNumber,
      next_retry_at: nextRetryAt,
      error_code: getErrorCode(error),
      error_message: error.message
    });
    
    // Re-queue message with delay
    await publishToSQS(
      {
        ...notification,
        attempt_number: nextAttemptNumber
      },
      delaySeconds
    );
    
    // Log retry
    logger.info('Scheduling retry', {
      notification_id: notification.id,
      attempt: nextAttemptNumber,
      max_attempts: notification.max_attempts,
      next_retry_at: nextRetryAt,
      delay_seconds: delaySeconds
    });
    
    // Metrics
    metrics.increment('notifications.retried', {
      attempt: nextAttemptNumber,
      error_code: getErrorCode(error)
    });
    
  } else {
    // Mark as permanently failed
    await updateNotification(notification.id, {
      status: NotificationStatus.FAILED,
      error_code: getErrorCode(error),
      error_message: error.message,
      failed_at: new Date()
    });
    
    // Send to DLQ for manual review
    await sendToDeadLetterQueue(notification, error);
    
    // Trigger failure webhook
    await triggerWebhook(notification, 'notification.failed');
    
    // Log failure
    logger.error('Notification permanently failed', {
      notification_id: notification.id,
      error_code: getErrorCode(error),
      error_message: error.message,
      attempts: notification.attempt_number
    });
    
    // Metrics
    metrics.increment('notifications.failed', {
      error_code: getErrorCode(error),
      retryable: isRetryable,
      max_attempts_reached: !hasAttemptsRemaining
    });
  }
}

function determineIfRetryable(error: Error): boolean {
  const errorCode = getErrorCode(error);
  
  // Check if error code is in retryable list
  if (RETRY_POLICY.retryable_errors.includes(errorCode)) {
    return true;
  }
  
  // Check if error code is in permanent failure list
  if (RETRY_POLICY.permanent_errors.includes(errorCode)) {
    return false;
  }
  
  // Default to non-retryable for unknown errors
  return false;
}
```

### 7.4 Dead Letter Queue (DLQ)

```typescript
interface DLQMessage {
  notification: Notification;
  error: {
    code: string;
    message: string;
    stack?: string;
  };
  attempts: number;
  first_failure_at: Date;
  last_failure_at: Date;
  metadata: {
    tenant_id: string;
    event_type: string;
    recipient: string;
  };
}

async function sendToDeadLetterQueue(
  notification: Notification,
  error: Error
): Promise<void> {
  const dlqMessage: DLQMessage = {
    notification,
    error: {
      code: getErrorCode(error),
      message: error.message,
      stack: error.stack
    },
    attempts: notification.attempt_number,
    first_failure_at: notification.created_at,
    last_failure_at: new Date(),
    metadata: {
      tenant_id: notification.tenant_id,
      event_type: notification.event_type,
      recipient: notification.recipient_phone
    }
  };
  
  await sqsClient.sendMessage({
    QueueUrl: DLQ_URL,
    MessageBody: JSON.stringify(dlqMessage),
    MessageAttributes: {
      tenant_id: {
        DataType: 'String',
        StringValue: notification.tenant_id
      },
      error_code: {
        DataType: 'String',
        StringValue: getErrorCode(error)
      }
    }
  });
  
  // Alert on-call team for DLQ messages
  await sendAlert({
    severity: 'warning',
    title: 'Notification sent to DLQ',
    description: `Notification ${notification.id} failed permanently`,
    metadata: dlqMessage.metadata
  });
}
```

---

## 8. Monitoring & Metrics

### 8.1 Key Metrics

**Business Metrics**
```typescript
// Throughput metrics
metrics.counter('notifications.created', { tenant_id, event_type });
metrics.counter('notifications.sent', { tenant_id, event_type });
metrics.counter('notifications.delivered', { tenant_id, event_type });
metrics.counter('notifications.failed', { tenant_id, error_code });

// Delivery rate (calculated)
const deliveryRate = 
  notifications_delivered / (notifications_sent + notifications_failed);

// Average time to delivery
metrics.histogram('notification.delivery_time', durationMs, { tenant_id });
```

**Technical Metrics**
```typescript
// API metrics
metrics.histogram('api.request_duration', durationMs, { 
  endpoint, 
  method, 
  status_code 
});
metrics.counter('api.requests', { endpoint, method, status_code });
metrics.gauge('api.active_requests', activeRequestCount);

// Lambda metrics
metrics.histogram('lambda.execution_duration', durationMs);
metrics.counter('lambda.invocations', { status: 'success' | 'error' });
metrics.gauge('lambda.concurrent_executions', count);

// Database metrics
metrics.histogram('db.query_duration', durationMs, { query_type });
metrics.gauge('db.connection_pool_size', size);
metrics.gauge('db.connection_pool_available', available);

// Queue metrics
metrics.gauge('sqs.queue_depth', messageCount);
metrics.gauge('sqs.queue_age', oldestMessageAgeSeconds);
metrics.counter('sqs.messages_received', { queue_name });
metrics.counter('sqs.messages_deleted', { queue_name });

// WhatsApp API metrics
metrics.histogram('whatsapp_api.request_duration', durationMs);
metrics.counter('whatsapp_api.requests', { status_code });
metrics.counter('whatsapp_api.errors', { error_code });

// Rate limiting metrics
metrics.counter('ratelimit.exceeded', { level: 'tenant' | 'recipient' });
metrics.counter('ratelimit.allowed', { level: 'tenant' | 'recipient' });
```

### 8.2 Logging Strategy

**Log Levels**
- **DEBUG**: Detailed diagnostic information
- **INFO**: General informational messages
- **WARN**: Warning messages for potentially harmful situations
- **ERROR**: Error events that might still allow the application to continue

**Structured Log Format**
```json
{
  "timestamp": "2025-02-15T14:00:00.123Z",
  "level": "info",
  "service": "whatsapp-notification-api",
  "environment": "production",
  "version": "1.2.3",
  
  "trace_id": "abc123xyz",
  "span_id": "span456",
  "parent_span_id": "span123",
  
  "request": {
    "method": "POST",
    "path": "/v1/notifications",
    "ip": "203.0.113.42",
    "user_agent": "Order-Service/2.1.0"
  },
  
  "tenant_id": "tenant_xyz",
  "notification_id": "notif_abc123",
  "recipient": "+1234567890",
  
  "event": "notification.created",
  "message": "Notification created successfully",
  
  "duration_ms": 45,
  
  "metadata": {
    "event_type": "order.placed",
    "priority": "normal"
  }
}
```

**What to Log**
```typescript
// Request/Response
logger.info('API request', {
  method: req.method,
  path: req.path,
  query: req.query,
  body: sanitize(req.body), // Remove sensitive data
  ip: req.ip,
  user_agent: req.headers['user-agent']
});

// Business events
logger.info('Notification created', {
  notification_id,
  tenant_id,
  event_type,
  recipient: maskPhoneNumber(phoneNumber)
});

// Errors
logger.error('WhatsApp API error', {
  notification_id,
  error_code: error.code,
  error_message: error.message,
  stack: error.stack,
  attempt_number
});

// Performance
logger.info('Slow query detected', {
  query: queryName,
  duration_ms,
  threshold_ms: 1000
});
```

**What NOT to Log**
- Full phone numbers (mask last 4 digits)
- API keys or tokens
- WhatsApp access tokens
- Personal identifiable information (PII)
- Credit card numbers
- Passwords or secrets

### 8.3 Alerting Rules

```yaml
# High Error Rate Alert
- name: HighErrorRate
  condition: error_rate > 1% for 5 minutes
  severity: critical
  channels: [pagerduty, slack]
  message: "Error rate is {{ $value }}% (threshold: 1%)"
  
# Queue Depth Alert
- name: HighQueueDepth
  condition: sqs_queue_depth > 10000
  severity: warning
  channels: [slack]
  message: "SQS queue depth is {{ $value }} (threshold: 10000)"
  
# API Latency Alert
- name: HighAPILatency
  condition: api_latency_p95 > 500ms for 10 minutes
  severity: warning
  channels: [slack]
  message: "API p95 latency is {{ $value }}ms (threshold: 500ms)"
  
# Database Connection Alert
- name: DatabaseConnectionPoolExhausted
  condition: db_connection_pool_available < 10%
  severity: critical
  channels: [pagerduty, slack]
  message: "Only {{ $value }}% of DB connections available"
  
# Delivery Success Rate Alert
- name: LowDeliveryRate
  condition: delivery_success_rate < 95% for 15 minutes
  severity: warning
  channels: [slack]
  message: "Delivery success rate is {{ $value }}% (threshold: 95%)"
  
# Lambda Throttling Alert
- name: LambdaThrottled
  condition: lambda_throttled_invocations > 10 for 5 minutes
  severity: critical
  channels: [pagerduty]
  message: "Lambda is being throttled ({{ $value }} throttled invocations)"
```

### 8.4 Dashboards

**Operational Dashboard**
- Requests per minute (by tenant, event type)
- Error rate (overall and by error code)
- API latency (p50, p95, p99)
- Queue depth and age
- Lambda execution metrics
- Database connection pool utilization

**Business Dashboard**
- Messages sent per hour/day
- Delivery success rate
- Average time to delivery
- Top event types
- Top tenants by volume
- Cost per message

**Debugging Dashboard**
- Recent errors (last 100)
- Failed notifications
- DLQ messages
- Slow queries
- Rate limit hits

---

## 9. Security Design

### 9.1 Authentication

**API Key Authentication**
```typescript
async function authenticateApiKey(apiKey: string): Promise<Tenant> {
  // Check cache first
  const cached = await redis.get(`apikey:${apiKey}`);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Hash the API key
  const keyHash = crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex');
  
  // Lookup in database
  const tenant = await db.tenant.findUnique({
    where: { api_key_hash: keyHash, active: true }
  });
  
  if (!tenant) {
    throw new UnauthorizedError('Invalid API key');
  }
  
  // Cache for 30 minutes
  await redis.setex(
    `apikey:${apiKey}`,
    1800,
    JSON.stringify(tenant)
  );
  
  return tenant;
}
```

**JWT Authentication (Optional)**
```typescript
function verifyJWT(token: string): JWTPayload {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    
    // Check expiration
    if (payload.exp < Date.now() / 1000) {
      throw new UnauthorizedError('Token expired');
    }
    
    return payload;
  } catch (error) {
    throw new UnauthorizedError('Invalid token');
  }
}
```

### 9.2 Authorization

**Permission-Based Access Control**
```typescript
enum Permission {
  NOTIFICATIONS_SEND = 'notifications:send',
  NOTIFICATIONS_READ = 'notifications:read',
  NOTIFICATIONS_DELETE = 'notifications:delete',
  TEMPLATES_MANAGE = 'templates:manage',
  WEBHOOKS_MANAGE = 'webhooks:manage'
}

function requirePermissions(...permissions: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenant = req.tenant;
    
    const hasPermissions = permissions.every(permission =>
      tenant.permissions.includes(permission)
    );
    
    if (!hasPermissions) {
      throw new ForbiddenError('Insufficient permissions');
    }
    
    next();
  };
}

// Usage
router.post(
  '/v1/notifications',
  requirePermissions(Permission.NOTIFICATIONS_SEND),
  handleNotificationRequest
);
```

### 9.3 Data Protection

**Encryption at Rest**
- Database: AWS RDS encryption with KMS
- S3 buckets: Server-side encryption (SSE-KMS)
- Secrets: AWS Secrets Manager

**Encryption in Transit**
- TLS 1.3 for all API endpoints
- mTLS for internal service communication
- Encrypted Redis connections

**PII Data Handling**
```typescript
// Mask phone numbers in logs
function maskPhoneNumber(phoneNumber: string): string {
  // +1234567890 → +1234***890
  return phoneNumber.slice(0, -4).replace(/\d(?=\d{3})/g, '*') + 
         phoneNumber.slice(-4);
}

// Sanitize request bodies before logging
function sanitizeRequestBody(body: any): any {
  const sanitized = { ...body };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'api_key', 'token', 'secret'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  // Mask phone numbers
  if (sanitized.recipient?.phone_number) {
    sanitized.recipient.phone_number = 
      maskPhoneNumber(sanitized.recipient.phone_number);
  }
  
  return sanitized;
}
```

### 9.4 Input Validation

```typescript
// Prevent injection attacks
function validatePhoneNumber(phoneNumber: string): boolean {
  // Must be E.164 format: +[country code][number]
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phoneNumber);
}

// Sanitize user input
function sanitizeInput(input: string): string {
  // Remove any potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .trim()
    .slice(0, 4096); // Limit length
}

// Validate against schema
const requestSchema = z.object({
  event_type: z.string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9._-]+$/), // Alphanumeric with delimiters only
  recipient: z.object({
    phone_number: z.string()
      .refine(validatePhoneNumber, 'Invalid phone number format')
  })
});
```

### 9.5 Secrets Management

```typescript
// Load secrets from AWS Secrets Manager
async function loadSecrets(): Promise<AppSecrets> {
  const secretsClient = new SecretsManagerClient();
  
  const response = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: process.env.SECRET_ARN
    })
  );
  
  const secrets = JSON.parse(response.SecretString);
  
  return {
    database_url: secrets.DATABASE_URL,
    redis_url: secrets.REDIS_URL,
    whatsapp_access_token: secrets.WHATSAPP_ACCESS_TOKEN,
    jwt_secret: secrets.JWT_SECRET
  };
}

// Rotate secrets automatically
async function rotateSecret(secretId: string): Promise<void> {
  // Generate new secret
  const newSecret = generateSecureToken();
  
  // Update in Secrets Manager
  await secretsClient.send(
    new UpdateSecretCommand({
      SecretId: secretId,
      SecretString: newSecret
    })
  );
  
  // Update application configuration
  await updateApplicationConfig(secretId, newSecret);
  
  // Log rotation
  logger.info('Secret rotated', { secret_id: secretId });
}
```

---

## 10. Scalability Considerations

### 10.1 Horizontal Scaling

**Auto-Scaling Configuration**
```typescript
// API Service Auto-Scaling (ECS/Fargate)
const autoScalingConfig = {
  minCapacity: 2,
  maxCapacity: 20,
  
  // CPU-based scaling
  cpuTargetUtilization: 70,
  
  // Request-based scaling
  requestsPerTarget: 1000,
  
  // Scale-out faster than scale-in
  scaleOutCooldown: 60,   // 1 minute
  scaleInCooldown: 300    // 5 minutes
};

// Lambda Auto-Scaling
const lambdaConfig = {
  reserved_concurrent_executions: 100,
  provisioned_concurrent_executions: 10, // For critical workloads
  
  // Event source mapping (SQS)
  batch_size: 10,
  max_concurrency: 10,
  max_batching_window: 5, // seconds
  
  // Auto-scaling based on queue depth
  scaling_config: {
    min_capacity: 1,
    max_capacity: 100,
    target_value: 10 // messages per Lambda
  }
};
```

### 10.2 Database Scaling

**Read Replicas**
```typescript
// Route read queries to replicas
const dbConfig = {
  primary: {
    host: 'primary.db.amazonaws.com',
    port: 5432,
    maxConnections: 100
  },
  replicas: [
    {
      host: 'replica1.db.amazonaws.com',
      port: 5432,
      maxConnections: 100
    },
    {
      host: 'replica2.db.amazonaws.com',
      port: 5432,
      maxConnections: 100
    }
  ]
};

// Query routing
async function executeQuery(
  query: string,
  params: any[],
  options: { readonly: boolean } = { readonly: false }
): Promise<any> {
  const connection = options.readonly
    ? getReadReplicaConnection()
    : getPrimaryConnection();
  
  return connection.query(query, params);
}
```

**Connection Pooling**
```typescript
const poolConfig = {
  min: 10,              // Minimum connections
  max: 100,             // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  
  // Health check
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
};

// Monitor pool metrics
setInterval(() => {
  metrics.gauge('db.pool.total', pool.totalCount);
  metrics.gauge('db.pool.idle', pool.idleCount);
  metrics.gauge('db.pool.waiting', pool.waitingCount);
}, 10000);
```

### 10.3 Caching Strategy

**Multi-Layer Caching**
```
1. In-Memory Cache (Node.js process)
   └─ TTL: 1 minute, Size: 100 items
   └─ Use for: API key validation, frequently accessed templates

2. Redis Cache (ElastiCache)
   └─ TTL: 5-60 minutes (varies by data type)
   └─ Use for: Rate limiting, session data, template cache

3. Database Query Cache
   └─ Automatic query result caching
```

**Cache Warming**
```typescript
// Pre-populate cache on startup
async function warmCache(): Promise<void> {
  logger.info('Warming cache...');
  
  // Load frequently used templates
  const popularTemplates = await db.template.findMany({
    where: { status: 'approved' },
    orderBy: { usage_count: 'desc' },
    take: 100
  });
  
  for (const template of popularTemplates) {
    const key = `template:${template.tenant_id}:${template.name}:${template.language}`;
    await redis.setex(
      key,
      86400, // 24 hours
      JSON.stringify(template)
    );
  }
  
  logger.info('Cache warmed', { templates: popularTemplates.length });
}
```

### 10.4 Load Testing

**Load Test Scenarios**
```typescript
// Scenario 1: Sustained Load
// 1000 req/sec for 10 minutes
// Expected: API latency < 200ms, no errors

// Scenario 2: Spike Load
// Ramp from 100 to 5000 req/sec in 1 minute
// Expected: Auto-scaling triggers, latency < 500ms

// Scenario 3: Endurance Load
// 500 req/sec for 24 hours
// Expected: No memory leaks, stable performance

// Scenario 4: Stress Test
// Ramp until system breaks
// Goal: Identify breaking point and failure mode
```

**Artillery Configuration**
```yaml
config:
  target: "https://api.whatsapp-notif.com"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 300
      arrivalRate: 1000
      name: "Sustained load"
    - duration: 60
      arrivalRate: 5000
      name: "Spike load"

scenarios:
  - name: "Send notification"
    flow:
      - post:
          url: "/v1/notifications"
          headers:
            Authorization: "Bearer {{ $env.API_KEY }}"
          json:
            event_type: "order.placed"
            recipient:
              phone_number: "+1234567890"
            template:
              name: "order_confirmation"
              language: "en"
              parameters:
                - type: "text"
                  value: "John Doe"
```

---

## 11. Failure Scenarios

### 11.1 Failure Modes and Recovery

| Failure Scenario | Detection | Impact | Recovery | MTTR |
|-----------------|-----------|---------|----------|------|
| Database failure | Health check fails | No new messages accepted | Failover to standby | 30s |
| Redis failure | Connection timeout | Rate limiting disabled | Restart Redis cluster | 2m |
| SQS unavailable | AWS service health | Messages queue in memory | Retry with backoff | 5m |
| Lambda timeout | CloudWatch logs | Message reprocessed | Increase timeout/memory | 10m |
| WhatsApp API down | 5xx errors | Messages queued for retry | Wait for recovery | 15m |
| API server crash | ALB health check | Requests routed to healthy instances | Auto-restart | 30s |
| Network partition | Increased latency | Degraded performance | AWS networking resolves | Variable |

### 11.2 Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private failureCount = 0;
  private lastFailureTime?: Date;
  
  constructor(
    private threshold: number = 5,      // Open after 5 failures
    private timeout: number = 60000,    // Try again after 60 seconds
    private resetTime: number = 120000  // Close after 2 minutes of success
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime.getTime() > this.timeout) {
        this.state = 'half_open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half_open') {
      this.state = 'closed';
      logger.info('Circuit breaker closed');
    }
  }
  
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
      logger.error('Circuit breaker opened', {
        failure_count: this.failureCount
      });
      
      // Alert
      sendAlert({
        severity: 'critical',
        title: 'Circuit breaker opened',
        description: `Circuit breaker opened after ${this.failureCount} failures`
      });
    }
  }
}

// Usage
const whatsappCircuitBreaker = new CircuitBreaker(5, 60000);

async function sendWhatsAppMessage(...args): Promise<any> {
  return whatsappCircuitBreaker.execute(async () => {
    return await whatsappClient.sendMessage(...args);
  });
}
```

### 11.3 Graceful Degradation

```typescript
// Feature flags for graceful degradation
const featureFlags = {
  enableWebhooks: true,
  enableRateLimiting: true,
  enableDetailedLogging: true,
  enableMetrics: true
};

// Disable non-critical features under load
async function handleHighLoad(): Promise<void> {
  const queueDepth = await getSQSQueueDepth();
  
  if (queueDepth > 50000) {
    logger.warn('High queue depth detected, disabling non-critical features');
    
    // Disable webhooks to reduce outbound requests
    featureFlags.enableWebhooks = false;
    
    // Reduce logging verbosity
    featureFlags.enableDetailedLogging = false;
    
    // Keep rate limiting enabled (critical for API protection)
    // Keep metrics enabled (need visibility)
  }
  
  if (queueDepth < 10000) {
    // Re-enable features
    featureFlags.enableWebhooks = true;
    featureFlags.enableDetailedLogging = true;
  }
}
```

### 11.4 Disaster Recovery

**Backup Strategy**
- Database: Automated daily backups + continuous backup (point-in-time recovery)
- Redis: Daily snapshots + AOF (append-only file)
- Configuration: Stored in Git + encrypted secrets in Secrets Manager

**Recovery Procedures**
```typescript
// Database recovery
async function recoverDatabase(timestamp: Date): Promise<void> {
  // 1. Identify backup snapshot
  const snapshot = await findSnapshotAtTime(timestamp);
  
  // 2. Create new RDS instance from snapshot
  const newInstance = await createRDSFromSnapshot(snapshot);
  
  // 3. Update application configuration
  await updateDatabaseEndpoint(newInstance.endpoint);
  
  // 4. Verify data integrity
  await verifyDataIntegrity();
  
  // 5. Resume normal operations
  logger.info('Database recovered', { 
    snapshot_id: snapshot.id,
    recovery_time: timestamp 
  });
}

// Infrastructure recovery
async function recoverInfrastructure(): Promise<void> {
  // 1. Apply Terraform/CDK configuration
  await applyInfrastructureAsCode();
  
  // 2. Restore secrets
  await restoreSecrets();
  
  // 3. Deploy application
  await deployApplication();
  
  // 4. Verify health
  await verifySystemHealth();
}
```

---

## 12. Performance Optimization

### 12.1 Database Optimization

**Indexes**
```sql
-- Frequently queried fields
CREATE INDEX idx_notifications_tenant_status 
  ON notifications(tenant_id, status);

CREATE INDEX idx_notifications_recipient_created 
  ON notifications(recipient_phone, created_at DESC);

CREATE INDEX idx_notifications_whatsapp_msg 
  ON notifications(whatsapp_message_id) 
  WHERE whatsapp_message_id IS NOT NULL;

-- Scheduled notifications
CREATE INDEX idx_notifications_scheduled 
  ON notifications(scheduled_for) 
  WHERE scheduled_for IS NOT NULL AND status = 'scheduled';

-- Retry queries
CREATE INDEX idx_notifications_retry 
  ON notifications(next_retry_at) 
  WHERE next_retry_at IS NOT NULL AND status = 'queued';
```

**Query Optimization**
```typescript
// Use database connection pooling
// Batch inserts for bulk operations
async function bulkCreateNotifications(
  notifications: NotificationInput[]
): Promise<void> {
  // Insert in batches of 1000
  const batchSize = 1000;
  for (let i = 0; i < notifications.length; i += batchSize) {
    const batch = notifications.slice(i, i + batchSize);
    await db.notification.createMany({
      data: batch,
      skipDuplicates: true
    });
  }
}

// Use select only needed fields
async function getNotificationStatus(id: string): Promise<StatusResponse> {
  return db.notification.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      created_at: true,
      sent_at: true,
      delivered_at: true,
      error_code: true,
      error_message: true
      // Don't select large fields like metadata, template_parameters
    }
  });
}
```

### 12.2 Lambda Optimization

**Cold Start Reduction**
```typescript
// 1. Minimize dependencies
// Only import what you need
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
// Don't import entire AWS SDK

// 2. Initialize clients outside handler
const sqsClient = new SQSClient({ region: 'us-east-1' });
const dbClient = createDatabaseClient();

// 3. Use provisioned concurrency for critical paths
// Configured in infrastructure as code

// 4. Connection pooling
let cachedDbConnection: DatabaseConnection;

export async function handler(event: SQSEvent): Promise<void> {
  // Reuse connection across invocations
  if (!cachedDbConnection) {
    cachedDbConnection = await createDatabaseConnection();
  }
  
  // Process event
  await processMessages(event.Records, cachedDbConnection);
}
```

**Memory Optimization**
```typescript
// Right-size Lambda memory (512MB is optimal for this workload)
// Test different memory sizes to find the sweet spot
const LAMBDA_MEMORY_SIZE = 512; // MB

// Process messages in batches
async function processMessages(
  records: SQSRecord[],
  db: DatabaseConnection
): Promise<void> {
  // Process 10 messages concurrently
  const concurrency = 10;
  
  for (let i = 0; i < records.length; i += concurrency) {
    const batch = records.slice(i, i + concurrency);
    await Promise.allSettled(
      batch.map(record => processMessage(record, db))
    );
  }
}
```

### 12.3 API Optimization

**Response Caching**
```typescript
// Cache GET requests
app.get('/v1/notifications/:id', 
  cacheMiddleware(60), // Cache for 60 seconds
  getNotificationHandler
);

function cacheMiddleware(ttlSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const cacheKey = `cache:${req.method}:${req.path}`;
    
    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    // Intercept response
    const originalJson = res.json.bind(res);
    res.json = (data: any) => {
      // Cache the response
      redis.setex(cacheKey, ttlSeconds, JSON.stringify(data));
      return originalJson(data);
    };
    
    next();
  };
}
```

**Request Batching**
```typescript
// Client-side: Batch multiple notifications into one request
async function sendNotifications(
  notifications: NotificationInput[]
): Promise<void> {
  // Send in batches of 100
  const batchSize = 100;
  for (let i = 0; i < notifications.length; i += batchSize) {
    const batch = notifications.slice(i, i + batchSize);
    await apiClient.post('/v1/notifications/bulk', {
      notifications: batch
    });
  }
}
```

**Compression**
```typescript
// Enable gzip compression for API responses
import compression from 'compression';

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Balance between speed and compression ratio
}));
```

---

## 13. Conclusion

This system design document provides a comprehensive blueprint for building a production-ready WhatsApp notification microservice. The design emphasizes:

**Reliability**
- At-least-once delivery guarantee
- Comprehensive retry logic
- Circuit breakers and graceful degradation

**Scalability**
- Horizontal scaling for all components
- Auto-scaling based on metrics
- Efficient resource utilization

**Performance**
- Low-latency API (<200ms p95)
- Fast message processing (<5s p95)
- Optimized database queries and caching

**Observability**
- Structured logging with trace IDs
- Real-time metrics and dashboards
- Proactive alerting

**Security**
- Multi-layer authentication and authorization
- Data encryption at rest and in transit
- PII protection and GDPR compliance

By following this design, you'll build a service that not only meets functional requirements but also demonstrates advanced system design skills and production-readiness.