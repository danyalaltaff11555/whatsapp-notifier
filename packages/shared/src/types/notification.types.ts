/**
 * Core domain types for WhatsApp notification service
 */

// ============================================================================
// Enums
// ============================================================================

export enum NotificationStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  RATE_LIMITED = 'rate_limited',
  SCHEDULED = 'scheduled',
}

export enum Priority {
    HIGH = 'high',
    NORMAL = 'normal',
    LOW = 'low',
}

export interface TemplateParameter {
    type: 'text' | 'currency' | 'date_time';
    value: string;
}

export interface TemplateMessage {
    name: string;
    language: string;
    parameters?: TemplateParameter[];
}

export interface TextMessage {
    text: string;
}

export interface Recipient {
    phone_number: string;
    country_code?: string;
}

export interface Notification {
    // Identity
    id: string;
    tenant_id: string;

    // Event information
    event_type: string;

    // Recipient
    recipient: Recipient;

    // Message content
    template?: TemplateMessage;
    message?: TextMessage;

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
    metadata?: Record<string, unknown>;
    priority: Priority;

    // Tracing
    trace_id: string;
}

export interface SQSMessagePayload {
    id: string;
    event_type: string;
    recipient: Recipient;
    template?: TemplateMessage;
    message?: TextMessage;
    metadata?: Record<string, unknown>;
    priority: Priority;
    attempt_number: number;
    max_attempts: number;
    created_at: string;
    scheduled_for?: string;
    trace_id: string;
    tenant_id: string;
}

export interface DeliveryLog {
    id: number;
    notification_id: string;
    status: NotificationStatus;
    attempt_number: number;
    whatsapp_message_id?: string;
    error_code?: string;
    error_message?: string;
    created_at: Date;
    api_response?: Record<string, unknown>;
}

export interface RateLimit {
    id: number;
    recipient_phone: string;
    window_start: Date;
    window_end: Date;
    message_count: number;
    created_at: Date;
    updated_at: Date;
}

// ============================================================================
// Retry and Rate Limiting
// ============================================================================

export interface RetryPolicy {
  max_attempts: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
  jitter: boolean;
}

export interface RateLimitConfig {
  max_requests_per_minute: number;
  max_requests_per_hour: number;
  max_requests_per_day: number;
  burst_limit: number;
}

export interface RateLimitState {
  phone_number: string;
  requests_in_minute: number;
  requests_in_hour: number;
  requests_in_day: number;
  window_start: Date;
  is_limited: boolean;
  retry_after_seconds?: number;
}

// ============================================================================
// Enhanced Delivery Tracking
// ============================================================================

export interface DeliveryAttempt {
  attempt_number: number;
  attempted_at: Date;
  status: 'success' | 'failed' | 'rate_limited';
  error_code?: string;
  error_message?: string;
  response_time_ms?: number;
  whatsapp_message_id?: string;
}
