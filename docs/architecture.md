# WhatsApp Notification Microservice - Architecture Document

## Executive Summary

This document outlines the architecture for a production-grade WhatsApp notification microservice designed to handle event-driven notifications at scale. The service follows clean architecture principles, leveraging AWS services for reliability and scalability.

**Key Features:**
- Event-driven architecture using SQS for message queuing
- Serverless processing with AWS Lambda
- RESTful API for event ingestion
- Comprehensive retry logic and error handling
- Rate limiting and throttling
- Delivery status tracking and webhooks
- Multi-tenancy support

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────┐
│  Client Apps    │
│ (Order Service, │
│  Auth Service,  │
│ Payment Service)│
└────────┬────────┘
         │ HTTP POST
         ▼
┌─────────────────────────────────────────────────────────┐
│                     API Gateway                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │          REST API (Express.js/Fastify)            │  │
│  │  - Authentication (API Keys/JWT)                  │  │
│  │  - Rate Limiting (Redis)                          │  │
│  │  - Request Validation (Zod)                       │  │
│  │  - Metrics Collection (Prometheus)                │  │
│  └──────────────┬───────────────────────────────────┘  │
└─────────────────┼───────────────────────────────────────┘
                  │ Publish Event
                  ▼
         ┌────────────────┐
         │   Amazon SQS   │
         │  (Message Queue)│
         │                 │
         │  - Standard Queue │
         │  - DLQ Support  │
         │  - FIFO Option  │
         └────────┬────────┘
                  │ Poll Messages
                  ▼
┌──────────────────────────────────────────────────────┐
│           AWS Lambda Worker Functions                 │
│  ┌────────────────────────────────────────────────┐  │
│  │          Message Processor                      │  │
│  │  - Rate Limit Check                             │  │
│  │  - Template Rendering                           │  │
│  │  - WhatsApp API Call                            │  │
│  │  - Status Update                                │  │
│  │  - Retry Logic                                  │  │
│  └──────────────┬─────────────────────────────────┘  │
└─────────────────┼─────────────────────────────────────┘
                  │
        ┌─────────┴────────┐
        │                  │
        ▼                  ▼
┌──────────────┐    ┌─────────────────┐
│  PostgreSQL  │    │ WhatsApp Business│
│   Database   │    │       API        │
│              │    │                  │
│ - Notifications│  │ - Send Messages  │
│ - Delivery Logs│  │ - Get Status     │
│ - Rate Limits │   │ - Webhooks       │
└──────────────┘    └─────────┬────────┘
                              │ Status Updates
                              ▼
                    ┌──────────────────┐
                    │ Webhook Endpoint │
                    │  (API Service)   │
                    └──────────────────┘
```

### 1.2 Component Responsibilities

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| API Gateway | Request ingestion, authentication, validation | Express.js/Fastify |
| Message Queue | Event buffering, decoupling, guaranteed delivery | Amazon SQS |
| Lambda Worker | Message processing, WhatsApp integration | AWS Lambda (Node.js) |
| Database | State management, audit trail | PostgreSQL (RDS) |
| Cache | Rate limiting, session management | Redis (ElastiCache) |
| WhatsApp API | Message delivery | WhatsApp Business API |

---

## 2. Detailed Component Architecture

### 2.1 API Gateway Service

**Purpose**: Accept notification events from client applications and publish them to the message queue.

#### 2.1.1 Technology Stack
- **Runtime**: Node.js 20.x LTS
- **Framework**: Express.js or Fastify
- **Language**: TypeScript 5.x
- **Validation**: Zod or Joi
- **Logging**: Winston or Pino
- **Metrics**: Prometheus client

#### 2.1.2 Key Components

```typescript
// API Layer Structure
src/
├── api/
│   ├── routes/
│   │   ├── notifications.routes.ts    // POST /v1/notifications
│   │   ├── status.routes.ts           // GET /v1/notifications/:id
│   │   └── health.routes.ts           // GET /health
│   ├── middleware/
│   │   ├── authentication.ts          // API key/JWT validation
│   │   ├── rate-limiter.ts            // Redis-based rate limiting
│   │   ├── validator.ts               // Request schema validation
│   │   ├── error-handler.ts           // Global error handling
│   │   └── logger.ts                  // Request/response logging
│   └── controllers/
│       ├── notification.controller.ts // Business logic
│       └── status.controller.ts       // Status queries
├── services/
│   ├── sqs.service.ts                 // SQS publisher
│   ├── notification.service.ts        // Notification management
│   └── auth.service.ts                // Authentication logic
└── config/
    └── app.config.ts                  // Configuration management
```

#### 2.1.3 API Endpoints

**POST /v1/notifications**
```typescript
interface NotificationRequest {
  event_type: 'order.placed' | 'payment.failed' | 'account.created' | string;
  recipient: {
    phone_number: string;      // E.164 format: +1234567890
    country_code?: string;
  };
  template?: {
    name: string;              // WhatsApp approved template
    language: string;          // ISO 639-1 code
    parameters: Array<{
      type: 'text' | 'currency' | 'date_time';
      value: string;
    }>;
  };
  message?: {
    text: string;              // Plain text message (fallback)
  };
  metadata?: Record<string, any>;  // Client-specific data
  priority?: 'high' | 'normal' | 'low';
  scheduled_for?: string;      // ISO 8601 timestamp
}

// Response
interface NotificationResponse {
  id: string;                  // UUID
  status: 'queued' | 'processing' | 'sent' | 'failed';
  created_at: string;
  estimated_delivery?: string;
}
```

**GET /v1/notifications/:id/status**
```typescript
interface StatusResponse {
  id: string;
  status: 'queued' | 'processing' | 'sent' | 'delivered' | 'read' | 'failed';
  recipient: string;
  created_at: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  delivery_attempts: number;
}
```

**POST /v1/notifications/bulk**
```typescript
interface BulkNotificationRequest {
  notifications: NotificationRequest[];
  batch_id?: string;
}

interface BulkNotificationResponse {
  batch_id: string;
  total: number;
  queued: number;
  failed: number;
  errors?: Array<{ index: number; error: string }>;
}
```

#### 2.1.4 Authentication & Authorization

**API Key Authentication**
```typescript
// Request Header
Authorization: Bearer sk_live_xxxxxxxxxxxxx

// Key Structure
interface ApiKey {
  id: string;
  tenant_id: string;
  key_hash: string;        // bcrypt hash
  permissions: string[];   // ['notifications:send', 'notifications:read']
  rate_limit: {
    requests_per_minute: number;
    requests_per_day: number;
  };
  active: boolean;
  expires_at?: Date;
}
```

**JWT Authentication (Optional)**
```typescript
// Token Payload
interface JWTPayload {
  sub: string;             // User/Service ID
  tenant_id: string;
  permissions: string[];
  iat: number;
  exp: number;
}
```

#### 2.1.5 Rate Limiting Strategy

**Multi-Tier Rate Limiting**
```typescript
interface RateLimitConfig {
  // Global limits
  global: {
    requests_per_second: 1000;
    burst_size: 1500;
  };
  
  // Per-tenant limits
  tenant: {
    requests_per_minute: 100;
    requests_per_hour: 5000;
    requests_per_day: 50000;
  };
  
  // Per-recipient limits (prevent spam)
  recipient: {
    messages_per_hour: 10;
    messages_per_day: 50;
  };
}
```

**Implementation Using Redis**
```typescript
// Sliding window counter
async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);
  
  // Remove old entries
  await redis.zremrangebyscore(key, 0, windowStart);
  
  // Count current window
  const count = await redis.zcard(key);
  
  if (count >= limit) {
    return false; // Rate limit exceeded
  }
  
  // Add current request
  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, windowSeconds);
  
  return true;
}
```

### 2.2 Message Queue (Amazon SQS)

**Purpose**: Decouple API from workers, provide buffering, and ensure message durability.

#### 2.2.1 Queue Configuration

**Standard Queue for High Throughput**
```typescript
interface SQSQueueConfig {
  queue_name: 'whatsapp-notifications-queue';
  
  // Message settings
  message_retention_period: 1209600;  // 14 days (max)
  visibility_timeout: 300;             // 5 minutes
  max_message_size: 262144;            // 256 KB
  
  // Delivery settings
  delay_seconds: 0;
  receive_wait_time: 20;               // Long polling
  
  // Dead Letter Queue
  redrive_policy: {
    max_receive_count: 3;
    dead_letter_queue_arn: 'arn:aws:sqs:...:dlq';
  };
}
```

**FIFO Queue for Ordered Messages (Optional)**
```typescript
interface FIFOQueueConfig extends SQSQueueConfig {
  queue_name: 'whatsapp-notifications-queue.fifo';
  fifo_queue: true;
  content_based_deduplication: true;
  deduplication_scope: 'messageGroup';  // Per recipient
  fifo_throughput_limit: 'perMessageGroupId';
}
```

#### 2.2.2 Message Format

```typescript
interface SQSMessage {
  id: string;                    // Notification UUID
  event_type: string;
  recipient: {
    phone_number: string;
    country_code: string;
  };
  template?: TemplateMessage;
  message?: TextMessage;
  metadata: Record<string, any>;
  priority: 'high' | 'normal' | 'low';
  
  // Retry metadata
  attempt_number: number;
  max_attempts: number;
  
  // Timestamps
  created_at: string;
  scheduled_for?: string;
  
  // Tracing
  trace_id: string;              // For distributed tracing
  tenant_id: string;
}
```

#### 2.2.3 Message Attributes

```typescript
interface MessageAttributes {
  tenant_id: {
    DataType: 'String';
    StringValue: string;
  };
  priority: {
    DataType: 'String';
    StringValue: 'high' | 'normal' | 'low';
  };
  event_type: {
    DataType: 'String';
    StringValue: string;
  };
  recipient_country: {
    DataType: 'String';
    StringValue: string;          // For filtering/routing
  };
}
```

### 2.3 Lambda Worker Functions

**Purpose**: Process messages from SQS, interact with WhatsApp API, and manage delivery state.

#### 2.3.1 Lambda Configuration

```typescript
interface LambdaConfig {
  function_name: 'whatsapp-notification-worker';
  runtime: 'nodejs20.x';
  handler: 'dist/index.handler';
  memory_size: 512;                // MB
  timeout: 300;                    // 5 minutes (max)
  reserved_concurrent_executions: 100;
  
  // Environment variables
  environment: {
    DATABASE_URL: string;
    REDIS_URL: string;
    WHATSAPP_API_URL: string;
    WHATSAPP_ACCESS_TOKEN: string;
    RATE_LIMIT_PER_HOUR: string;
    LOG_LEVEL: string;
  };
  
  // VPC configuration (for database access)
  vpc_config: {
    subnet_ids: string[];
    security_group_ids: string[];
  };
  
  // Event source (SQS)
  event_source: {
    queue_arn: string;
    batch_size: 10;              // Process 10 messages per invocation
    max_batching_window: 5;      // Wait up to 5 seconds for full batch
    max_concurrency: 10;         // Concurrent Lambda executions
  };
}
```

#### 2.3.2 Worker Processing Flow

```typescript
// Lambda handler
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const results: SQSBatchItemFailure[] = [];
  
  for (const record of event.Records) {
    try {
      await processMessage(record);
    } catch (error) {
      // Mark message as failed for retry
      results.push({ itemIdentifier: record.messageId });
      logger.error('Message processing failed', { 
        messageId: record.messageId, 
        error 
      });
    }
  }
  
  return { batchItemFailures: results };
}

async function processMessage(record: SQSRecord): Promise<void> {
  const message: SQSMessage = JSON.parse(record.body);
  
  // 1. Validate message
  const validationResult = validateMessage(message);
  if (!validationResult.valid) {
    throw new ValidationError(validationResult.errors);
  }
  
  // 2. Check rate limit
  const canSend = await checkRecipientRateLimit(message.recipient.phone_number);
  if (!canSend) {
    await handleRateLimitExceeded(message);
    return;
  }
  
  // 3. Render template (if applicable)
  const renderedMessage = message.template 
    ? await renderTemplate(message.template)
    : message.message;
  
  // 4. Send to WhatsApp
  const result = await sendWhatsAppMessage(
    message.recipient.phone_number,
    renderedMessage
  );
  
  // 5. Update delivery status
  await updateDeliveryStatus(message.id, {
    status: 'sent',
    whatsapp_message_id: result.message_id,
    sent_at: new Date()
  });
  
  // 6. Log delivery
  await logDelivery(message.id, {
    status: 'success',
    attempt_number: message.attempt_number,
    whatsapp_message_id: result.message_id
  });
}
```

#### 2.3.3 Retry Logic

```typescript
interface RetryPolicy {
  max_attempts: 3;
  backoff_strategy: 'exponential' | 'linear';
  base_delay_seconds: 60;
  max_delay_seconds: 3600;
  retryable_errors: string[];     // WhatsApp error codes
}

async function handleFailure(
  message: SQSMessage, 
  error: WhatsAppAPIError
): Promise<void> {
  const isRetryable = RETRYABLE_ERROR_CODES.includes(error.code);
  
  if (isRetryable && message.attempt_number < MAX_ATTEMPTS) {
    // Calculate backoff delay
    const delay = calculateBackoff(message.attempt_number);
    
    // Re-queue message with delay
    await requeueMessage(message, delay);
    
    // Update status
    await updateDeliveryStatus(message.id, {
      status: 'retry_scheduled',
      next_retry_at: new Date(Date.now() + delay * 1000),
      last_error: error.message
    });
  } else {
    // Mark as permanently failed
    await updateDeliveryStatus(message.id, {
      status: 'failed',
      error_code: error.code,
      error_message: error.message,
      failed_at: new Date()
    });
    
    // Send to DLQ for manual review
    await sendToDeadLetterQueue(message, error);
  }
}

function calculateBackoff(attemptNumber: number): number {
  // Exponential backoff: 60s, 120s, 240s
  const baseDelay = 60;
  const maxDelay = 3600;
  const delay = baseDelay * Math.pow(2, attemptNumber - 1);
  return Math.min(delay, maxDelay);
}
```

### 2.4 WhatsApp Business API Integration

**Purpose**: Send messages to WhatsApp recipients and receive delivery status updates.

#### 2.4.1 API Client Implementation

```typescript
class WhatsAppAPIClient {
  private baseURL: string;
  private accessToken: string;
  private httpClient: AxiosInstance;
  
  constructor(config: WhatsAppConfig) {
    this.baseURL = config.apiUrl;
    this.accessToken = config.accessToken;
    
    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Add retry logic for transient errors
    this.httpClient.interceptors.response.use(
      response => response,
      async error => {
        if (this.isRetryableError(error)) {
          return this.retryRequest(error.config);
        }
        throw error;
      }
    );
  }
  
  async sendTemplateMessage(
    phoneNumber: string,
    template: TemplateMessage
  ): Promise<SendMessageResponse> {
    const response = await this.httpClient.post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        components: this.buildTemplateComponents(template.parameters)
      }
    });
    
    return {
      message_id: response.data.messages[0].id,
      status: 'sent'
    };
  }
  
  async sendTextMessage(
    phoneNumber: string,
    text: string
  ): Promise<SendMessageResponse> {
    const response = await this.httpClient.post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber,
      type: 'text',
      text: { body: text }
    });
    
    return {
      message_id: response.data.messages[0].id,
      status: 'sent'
    };
  }
  
  async getMessageStatus(
    messageId: string
  ): Promise<MessageStatus> {
    const response = await this.httpClient.get(`/messages/${messageId}`);
    return response.data;
  }
  
  private isRetryableError(error: any): boolean {
    // Retry on network errors and 5xx status codes
    return !error.response || 
           error.response.status >= 500 ||
           error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT';
  }
}
```

#### 2.4.2 Template Management

```typescript
interface TemplateDefinition {
  id: string;
  name: string;
  language: string;
  category: 'marketing' | 'utility' | 'authentication';
  status: 'approved' | 'pending' | 'rejected';
  
  // Template structure
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    example?: string;
  };
  body: {
    text: string;
    examples: string[][];        // Parameter examples
  };
  footer?: {
    text: string;
  };
  buttons?: Array<{
    type: 'quick_reply' | 'url' | 'phone_number';
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

// Template rendering
function renderTemplate(
  template: TemplateDefinition,
  parameters: Record<string, string>
): string {
  let rendered = template.body.text;
  
  // Replace {{1}}, {{2}}, etc. with actual values
  Object.entries(parameters).forEach(([key, value], index) => {
    rendered = rendered.replace(`{{${index + 1}}}`, value);
  });
  
  return rendered;
}
```

#### 2.4.3 Webhook Handler for Status Updates

```typescript
// Webhook endpoint: POST /webhooks/whatsapp
interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        statuses?: Array<{
          id: string;              // WhatsApp message ID
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
          errors?: Array<{
            code: number;
            title: string;
            message: string;
          }>;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text: { body: string };
          type: 'text';
        }>;
      };
      field: 'messages';
    }>;
  }>;
}

async function handleWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      // Process status updates
      if (change.value.statuses) {
        for (const status of change.value.statuses) {
          await processStatusUpdate(status);
        }
      }
      
      // Process incoming messages (for interactive features)
      if (change.value.messages) {
        for (const message of change.value.messages) {
          await processIncomingMessage(message);
        }
      }
    }
  }
}

async function processStatusUpdate(status: WhatsAppStatus): Promise<void> {
  // Find notification by WhatsApp message ID
  const notification = await db.notification.findFirst({
    where: { whatsapp_message_id: status.id }
  });
  
  if (!notification) {
    logger.warn('Notification not found for WhatsApp message', { 
      whatsapp_message_id: status.id 
    });
    return;
  }
  
  // Update status
  await db.notification.update({
    where: { id: notification.id },
    data: {
      status: status.status,
      [`${status.status}_at`]: new Date(parseInt(status.timestamp) * 1000),
      ...(status.errors && {
        error_code: status.errors[0].code,
        error_message: status.errors[0].message
      })
    }
  });
  
  // Log delivery event
  await db.deliveryLog.create({
    data: {
      notification_id: notification.id,
      status: status.status,
      whatsapp_message_id: status.id,
      timestamp: new Date(parseInt(status.timestamp) * 1000),
      ...(status.errors && {
        error_code: status.errors[0].code,
        error_message: status.errors[0].message
      })
    }
  });
  
  // Trigger webhooks for client apps
  await triggerClientWebhook(notification, status);
}
```

### 2.5 Database Schema

**Purpose**: Persist notification state, delivery logs, and configuration.

#### 2.5.1 Schema Design (PostgreSQL)

```sql
-- Tenants (multi-tenancy support)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  api_key_hash VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT true,
  rate_limit_config JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenants_api_key ON tenants(api_key_hash);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  event_type VARCHAR(100) NOT NULL,
  recipient_phone VARCHAR(20) NOT NULL,
  recipient_country VARCHAR(2),
  
  -- Message content
  template_name VARCHAR(255),
  template_language VARCHAR(10),
  template_parameters JSONB,
  message_text TEXT,
  
  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  -- queued | processing | sent | delivered | read | failed | rate_limited
  
  whatsapp_message_id VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  scheduled_for TIMESTAMP,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  failed_at TIMESTAMP,
  
  -- Error tracking
  error_code VARCHAR(50),
  error_message TEXT,
  
  -- Retry metadata
  attempt_number INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,
  
  -- Client metadata
  metadata JSONB,
  priority VARCHAR(20) DEFAULT 'normal',
  
  -- Tracing
  trace_id VARCHAR(255)
);

CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_phone);
CREATE INDEX idx_notifications_scheduled ON notifications(scheduled_for) 
  WHERE scheduled_for IS NOT NULL;
CREATE INDEX idx_notifications_whatsapp_msg ON notifications(whatsapp_message_id);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- Delivery logs (append-only audit trail)
CREATE TABLE delivery_logs (
  id BIGSERIAL PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES notifications(id),
  status VARCHAR(50) NOT NULL,
  attempt_number INTEGER NOT NULL,
  whatsapp_message_id VARCHAR(255),
  
  -- Error details
  error_code VARCHAR(50),
  error_message TEXT,
  
  -- Timing
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- API response
  api_response JSONB
);

CREATE INDEX idx_delivery_logs_notification ON delivery_logs(notification_id);
CREATE INDEX idx_delivery_logs_created ON delivery_logs(created_at DESC);

-- Templates (cache of approved WhatsApp templates)
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  language VARCHAR(10) NOT NULL,
  category VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  
  -- Template definition
  header JSONB,
  body JSONB NOT NULL,
  footer JSONB,
  buttons JSONB,
  
  -- WhatsApp template ID
  whatsapp_template_id VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(tenant_id, name, language)
);

CREATE INDEX idx_templates_tenant ON templates(tenant_id);
CREATE INDEX idx_templates_status ON templates(status);

-- Rate limits (tracking message counts per recipient)
CREATE TABLE rate_limits (
  id BIGSERIAL PRIMARY KEY,
  recipient_phone VARCHAR(20) NOT NULL,
  window_start TIMESTAMP NOT NULL,
  window_end TIMESTAMP NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(recipient_phone, window_start)
);

CREATE INDEX idx_rate_limits_recipient ON rate_limits(recipient_phone);
CREATE INDEX idx_rate_limits_window ON rate_limits(window_start, window_end);

-- Webhook configurations (for client notifications)
CREATE TABLE webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  url VARCHAR(500) NOT NULL,
  events VARCHAR(255)[] NOT NULL,  -- ['sent', 'delivered', 'failed']
  active BOOLEAN DEFAULT true,
  secret VARCHAR(255),  -- For signature verification
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_configs_tenant ON webhook_configs(tenant_id);

-- Webhook deliveries (audit trail of webhook calls)
CREATE TABLE webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  webhook_config_id UUID NOT NULL REFERENCES webhook_configs(id),
  notification_id UUID NOT NULL REFERENCES notifications(id),
  
  -- Delivery details
  status VARCHAR(50) NOT NULL,  -- success | failed | retry
  http_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_config_id);
CREATE INDEX idx_webhook_deliveries_notification ON webhook_deliveries(notification_id);
```

#### 2.5.2 Data Access Layer (Repository Pattern)

```typescript
interface NotificationRepository {
  create(data: CreateNotificationData): Promise<Notification>;
  findById(id: string): Promise<Notification | null>;
  updateStatus(id: string, status: NotificationStatus): Promise<void>;
  findPendingRetries(): Promise<Notification[]>;
  findByWhatsAppMessageId(messageId: string): Promise<Notification | null>;
}

interface DeliveryLogRepository {
  create(data: CreateDeliveryLogData): Promise<DeliveryLog>;
  findByNotificationId(notificationId: string): Promise<DeliveryLog[]>;
}

interface RateLimitRepository {
  getMessageCount(
    phone: string, 
    windowStart: Date, 
    windowEnd: Date
  ): Promise<number>;
  incrementMessageCount(
    phone: string, 
    windowStart: Date, 
    windowEnd: Date
  ): Promise<void>;
}
```

### 2.6 Caching Layer (Redis)

**Purpose**: High-performance rate limiting, session management, and frequently accessed data.

#### 2.6.1 Cache Structure

```typescript
// Rate limiting keys
const RATE_LIMIT_KEY_PATTERN = 'ratelimit:{recipient}:{window}';
// Example: ratelimit:+1234567890:2025-02-15:14

// Template cache
const TEMPLATE_KEY_PATTERN = 'template:{tenant_id}:{name}:{language}';

// API key cache (reduce DB lookups)
const API_KEY_PATTERN = 'apikey:{key_hash}';

// Webhook configuration cache
const WEBHOOK_CONFIG_PATTERN = 'webhook:{tenant_id}';
```

#### 2.6.2 Cache Invalidation Strategy

```typescript
enum CacheInvalidationStrategy {
  TTL = 'ttl',           // Time-based expiration
  EVENT = 'event',       // Invalidate on write events
  WRITE_THROUGH = 'write_through'  // Update cache on write
}

const CACHE_TTL_CONFIG = {
  rate_limits: 3600,      // 1 hour
  templates: 86400,       // 24 hours
  api_keys: 1800,         // 30 minutes
  webhook_configs: 3600   // 1 hour
};
```

---

## 3. Cross-Cutting Concerns

### 3.1 Error Handling

**Error Categories and Handling Strategy**

```typescript
enum ErrorCategory {
  VALIDATION = 'validation',        // 400 - Bad request
  AUTHENTICATION = 'authentication', // 401 - Unauthorized
  AUTHORIZATION = 'authorization',   // 403 - Forbidden
  NOT_FOUND = 'not_found',          // 404 - Not found
  RATE_LIMIT = 'rate_limit',        // 429 - Too many requests
  WHATSAPP_API = 'whatsapp_api',    // External API error
  DATABASE = 'database',             // Database error
  INTERNAL = 'internal'              // 500 - Internal server error
}

class ApplicationError extends Error {
  constructor(
    public category: ErrorCategory,
    public code: string,
    public message: string,
    public retryable: boolean = false,
    public statusCode: number = 500,
    public metadata?: Record<string, any>
  ) {
    super(message);
  }
}

// Error mapping for WhatsApp API
const WHATSAPP_ERROR_MAP: Record<number, { 
  category: ErrorCategory, 
  retryable: boolean 
}> = {
  131047: { category: ErrorCategory.RATE_LIMIT, retryable: true },
  131026: { category: ErrorCategory.VALIDATION, retryable: false },
  131031: { category: ErrorCategory.WHATSAPP_API, retryable: false },
  // ... more error codes
};
```

### 3.2 Logging & Observability

**Structured Logging Format**

```typescript
interface LogEntry {
  timestamp: string;        // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  trace_id: string;
  span_id?: string;
  
  // Request context
  request?: {
    method: string;
    path: string;
    ip: string;
    user_agent: string;
  };
  
  // Business context
  tenant_id?: string;
  notification_id?: string;
  recipient?: string;
  
  // Event data
  event: string;
  message: string;
  data?: Record<string, any>;
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
  
  // Performance
  duration_ms?: number;
}
```

**Distributed Tracing with X-Ray**

```typescript
// Instrument critical paths
const segment = AWSXRay.getSegment();
const subsegment = segment.addNewSubsegment('whatsapp_api_call');

try {
  const result = await whatsappClient.sendMessage(...);
  subsegment.addMetadata('result', result);
} catch (error) {
  subsegment.addError(error);
  throw error;
} finally {
  subsegment.close();
}
```

### 3.3 Security

**Security Measures**

1. **API Security**
   - API key rotation policy (90 days)
   - TLS 1.3 for all external communication
   - Request signing for sensitive operations
   - IP whitelisting (optional)

2. **Data Protection**
   - Encryption at rest (AWS KMS)
   - Encryption in transit (TLS)
   - PII data masking in logs
   - GDPR compliance (right to be forgotten)

3. **Access Control**
   - IAM roles with least privilege principle
   - Service-to-service authentication
   - Audit logging for all API calls

4. **Secret Management**
   - AWS Secrets Manager for credentials
   - Automatic secret rotation
   - Never log secrets

### 3.4 Scalability

**Horizontal Scaling Strategy**

| Component | Scaling Approach | Max Capacity |
|-----------|------------------|--------------|
| API Gateway | Auto-scaling group (ALB) | 100+ instances |
| Lambda Worker | Concurrent executions | 1000+ |
| Database | Read replicas + connection pooling | 10,000 connections |
| Redis | Cluster mode | 5+ nodes |
| SQS | Unlimited (managed by AWS) | N/A |

**Performance Targets**

- API latency (p95): < 200ms
- Message processing time (p95): < 5 seconds
- Throughput: 5,000 messages/minute
- Database query time (p95): < 100ms

### 3.5 Monitoring & Alerting

**Key Metrics**

1. **Business Metrics**
   - Messages sent per minute/hour/day
   - Delivery success rate (target: >99%)
   - Average time to delivery

2. **Technical Metrics**
   - API response time (p50, p95, p99)
   - Lambda execution duration
   - Database connection pool utilization
   - SQS queue depth and age
   - Error rate by type

3. **Cost Metrics**
   - Lambda invocation cost
   - SQS message cost
   - Database I/O cost
   - WhatsApp API cost per message

**Alerting Rules**

| Alert | Condition | Severity | Action |
|-------|-----------|----------|---------|
| High error rate | >1% in 5 min | Critical | Page on-call |
| Queue depth | >10,000 messages | Warning | Auto-scale workers |
| API latency | p95 >500ms | Warning | Investigate |
| Database CPU | >80% for 10 min | Critical | Scale up |
| Failed deliveries | >5% in 15 min | Warning | Review logs |

---

## 4. Deployment Architecture

### 4.1 AWS Infrastructure

```
┌─────────────────────────────────────────────────────────┐
│                        VPC                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │             Public Subnets (Multi-AZ)              │ │
│  │  ┌──────────────┐         ┌──────────────┐        │ │
│  │  │ Application  │         │ Application  │        │ │
│  │  │ Load Balancer│         │ Load Balancer│        │ │
│  │  │   (AZ-1)     │         │   (AZ-2)     │        │ │
│  │  └──────┬───────┘         └──────┬───────┘        │ │
│  └─────────┼────────────────────────┼────────────────┘ │
│            │                        │                   │
│  ┌─────────┼────────────────────────┼────────────────┐ │
│  │         │   Private Subnets      │                │ │
│  │  ┌──────▼─────┐          ┌──────▼─────┐          │ │
│  │  │ ECS/Fargate│          │ ECS/Fargate│          │ │
│  │  │API Service │          │API Service │          │ │
│  │  │   (AZ-1)   │          │   (AZ-2)   │          │ │
│  │  └──────┬─────┘          └──────┬─────┘          │ │
│  │         │                       │                 │ │
│  │         │   ┌───────────────┐   │                 │ │
│  │         └───► Lambda Workers◄───┘                 │ │
│  │             └───────┬───────┘                     │ │
│  │                     │                             │ │
│  │  ┌──────────────────┼──────────────────┐         │ │
│  │  │                  │                  │         │ │
│  │  │  ┌───────────────▼────────┐  ┌─────▼──────┐  │ │
│  │  │  │RDS PostgreSQL (Multi-AZ)│  │ ElastiCache│  │ │
│  │  │  │Primary + Read Replica   │  │   Redis    │  │ │
│  │  │  └─────────────────────────┘  └────────────┘  │ │
│  │  │           Data Tier                           │ │
│  │  └───────────────────────────────────────────────┘ │
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘

External Services:
┌──────────────┐     ┌──────────────┐
│  Amazon SQS  │     │  CloudWatch  │
└──────────────┘     └──────────────┘
```

### 4.2 Multi-Environment Strategy

| Environment | Purpose | Deployment | Monitoring |
|-------------|---------|------------|------------|
| Development | Local dev | Manual | Minimal |
| Staging | Pre-production testing | Auto on merge to main | Full monitoring |
| Production | Live service | Manual approval | Full monitoring + alerting |

### 4.3 High Availability

**Architecture Principles**
- Multi-AZ deployment for all stateful services
- Active-active configuration for API services
- Auto-scaling based on metrics
- Health checks and automatic failover
- Database backups (point-in-time recovery)
- Cross-region backups for disaster recovery

**SLA Targets**
- Availability: 99.9% (8.76 hours downtime/year)
- RPO (Recovery Point Objective): 1 hour
- RTO (Recovery Time Objective): 30 minutes

---

## 5. Technology Stack Summary

### 5.1 Core Technologies

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Runtime | Node.js 20.x LTS | Mature, performant, great async support |
| Language | TypeScript 5.x | Type safety, better developer experience |
| API Framework | Express.js/Fastify | Battle-tested, extensive ecosystem |
| Message Queue | Amazon SQS | Managed, highly scalable, cost-effective |
| Compute | AWS Lambda | Serverless, auto-scaling, pay-per-use |
| Database | PostgreSQL (RDS) | ACID compliance, JSON support, mature |
| Cache | Redis (ElastiCache) | High performance, versatile data structures |
| Monitoring | CloudWatch + Grafana | Native AWS integration + visualization |
| Logging | Winston/Pino | Structured logging, high performance |
| Testing | Jest | Popular, good TypeScript support |
| IaC | Terraform/CDK | Declarative infrastructure management |

### 5.2 Key Libraries

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "axios": "^1.6.0",
    "aws-sdk": "^2.1400.0",
    "prisma": "^5.8.0",
    "ioredis": "^5.3.0",
    "zod": "^3.22.0",
    "winston": "^3.11.0",
    "prom-client": "^15.1.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "@types/node": "^20.10.0",
    "eslint": "^8.56.0",
    "prettier": "^3.1.0"
  }
}
```

---

## 6. Architectural Decisions (ADRs)

### ADR-001: Use SQS Instead of Kafka
**Decision**: Use Amazon SQS for message queueing
**Rationale**: 
- Simpler operational overhead (managed service)
- Cost-effective for current scale
- Native AWS integration
- Sufficient throughput for requirements
**Consequences**: Limited to AWS ecosystem, less suitable for event streaming

### ADR-002: Serverless Processing with Lambda
**Decision**: Use AWS Lambda for message processing
**Rationale**:
- Auto-scaling based on queue depth
- Pay-per-use pricing model
- No server management overhead
- Built-in retry and DLQ support
**Consequences**: Cold start latency, execution time limits

### ADR-003: PostgreSQL Over DynamoDB
**Decision**: Use PostgreSQL for primary data store
**Rationale**:
- Complex queries and relationships
- ACID compliance required
- Team familiarity
- JSON support for flexibility
**Consequences**: Scaling requires careful planning, higher operational cost

### ADR-004: Multi-Tenancy at Application Layer
**Decision**: Single database with tenant_id column
**Rationale**:
- Simpler infrastructure management
- Cost-effective
- Easier to implement features across tenants
**Consequences**: Requires careful query filtering, potential for data leakage

---

## 7. Future Enhancements

### Phase 2 Features
- Multi-channel support (SMS, Email fallback)
- Advanced analytics dashboard
- A/B testing for message templates
- Message scheduling with cron expressions
- Interactive message support (buttons, lists)

### Scalability Improvements
- Kafka for high-throughput event streaming
- DynamoDB for delivery logs (write-heavy workload)
- Multi-region deployment
- Edge computing for geographically distributed users

### Advanced Features
- ML-based delivery time optimization
- Natural language template generation
- Conversation management (chat bot support)
- Rich media support (images, videos, documents)

---

## 8. Conclusion

This architecture provides a solid foundation for a production-grade WhatsApp notification microservice. The design emphasizes:

- **Reliability**: Through retry logic, DLQs, and comprehensive error handling
- **Scalability**: Leveraging serverless and managed services
- **Maintainability**: Clean architecture with clear separation of concerns
- **Observability**: Comprehensive logging, metrics, and tracing
- **Security**: Multiple layers of protection for data and access

The modular design allows for incremental improvements and easy integration with new channels or features in the future.