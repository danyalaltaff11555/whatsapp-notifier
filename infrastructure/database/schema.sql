-- WhatsApp Notification Microservice - Database Schema
-- PostgreSQL 14+
-- Version: 1.0.0
-- Last Updated: 2026-02-15

-- ============================================================================
-- Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE notification_status AS ENUM (
  'queued',
  'processing',
  'sent',
  'delivered',
  'read',
  'failed',
  'rate_limited',
  'scheduled'
);

CREATE TYPE notification_priority AS ENUM (
  'high',
  'normal',
  'low'
);

-- ============================================================================
-- Tables
-- ============================================================================

-- Notifications table - Main notification records
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(255) NOT NULL,
  
  -- Event information
  event_type VARCHAR(100) NOT NULL,
  
  -- Recipient
  recipient_phone VARCHAR(20) NOT NULL,
  recipient_country_code VARCHAR(2),
  
  -- Message content (JSONB for flexibility)
  template JSONB,
  message JSONB,
  metadata JSONB,
  
  -- Status tracking
  status notification_status NOT NULL DEFAULT 'queued',
  priority notification_priority NOT NULL DEFAULT 'normal',
  whatsapp_message_id VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  
  -- Error tracking
  error_code VARCHAR(50),
  error_message TEXT,
  
  -- Retry metadata
  attempt_number INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  
  -- Tracing
  trace_id UUID NOT NULL
);

-- Delivery logs table - Detailed attempt tracking
CREATE TABLE delivery_logs (
  id BIGSERIAL PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  
  -- Attempt details
  attempt_number INTEGER NOT NULL,
  status notification_status NOT NULL,
  
  -- WhatsApp response
  whatsapp_message_id VARCHAR(255),
  
  -- Error details
  error_code VARCHAR(50),
  error_message TEXT,
  
  -- Performance
  response_time_ms INTEGER,
  
  -- API response (for debugging)
  api_response JSONB,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Rate limits table - Track message counts per recipient
CREATE TABLE rate_limits (
  id BIGSERIAL PRIMARY KEY,
  recipient_phone VARCHAR(20) NOT NULL,
  
  -- Time windows
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Counters
  message_count INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- API keys table - Tenant authentication
CREATE TABLE api_keys (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL UNIQUE,
  api_key VARCHAR(255) NOT NULL UNIQUE,
  
  -- Metadata
  name VARCHAR(255),
  description TEXT,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Rate limits
  rate_limit_per_minute INTEGER DEFAULT 100,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  rate_limit_per_day INTEGER DEFAULT 10000,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Notifications indexes
CREATE INDEX idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_recipient_phone ON notifications(recipient_phone);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_scheduled_for ON notifications(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX idx_notifications_next_retry_at ON notifications(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX idx_notifications_trace_id ON notifications(trace_id);
CREATE INDEX idx_notifications_event_type ON notifications(event_type);

-- Composite indexes for common queries
CREATE INDEX idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX idx_notifications_tenant_created ON notifications(tenant_id, created_at DESC);

-- Delivery logs indexes
CREATE INDEX idx_delivery_logs_notification_id ON delivery_logs(notification_id);
CREATE INDEX idx_delivery_logs_created_at ON delivery_logs(created_at DESC);
CREATE INDEX idx_delivery_logs_status ON delivery_logs(status);

-- Rate limits indexes
CREATE INDEX idx_rate_limits_recipient_phone ON rate_limits(recipient_phone);
CREATE INDEX idx_rate_limits_window ON rate_limits(window_start, window_end);

-- API keys indexes
CREATE INDEX idx_api_keys_api_key ON api_keys(api_key);
CREATE INDEX idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limits_updated_at
  BEFORE UPDATE ON rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Views
-- ============================================================================

-- Notification summary view
CREATE VIEW notification_summary AS
SELECT 
  n.id,
  n.tenant_id,
  n.event_type,
  n.recipient_phone,
  n.status,
  n.priority,
  n.created_at,
  n.sent_at,
  n.delivered_at,
  n.attempt_number,
  n.trace_id,
  COUNT(dl.id) as total_attempts,
  MAX(dl.created_at) as last_attempt_at
FROM notifications n
LEFT JOIN delivery_logs dl ON n.id = dl.notification_id
GROUP BY n.id;

-- Rate limit status view
CREATE VIEW rate_limit_status AS
SELECT 
  recipient_phone,
  SUM(CASE WHEN window_end > NOW() THEN message_count ELSE 0 END) as active_count,
  MAX(window_end) as current_window_end
FROM rate_limits
GROUP BY recipient_phone;

-- ============================================================================
-- Functions
-- ============================================================================

-- Check rate limit for recipient
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_recipient_phone VARCHAR(20),
  p_limit_per_hour INTEGER DEFAULT 10
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COALESCE(SUM(message_count), 0)
  INTO v_count
  FROM rate_limits
  WHERE recipient_phone = p_recipient_phone
    AND window_end > NOW()
    AND window_start > NOW() - INTERVAL '1 hour';
  
  RETURN v_count < p_limit_per_hour;
END;
$$ LANGUAGE plpgsql;

-- Increment rate limit counter
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_recipient_phone VARCHAR(20)
)
RETURNS VOID AS $$
DECLARE
  v_window_start TIMESTAMP WITH TIME ZONE;
  v_window_end TIMESTAMP WITH TIME ZONE;
BEGIN
  v_window_start := DATE_TRUNC('hour', NOW());
  v_window_end := v_window_start + INTERVAL '1 hour';
  
  INSERT INTO rate_limits (recipient_phone, window_start, window_end, message_count)
  VALUES (p_recipient_phone, v_window_start, v_window_end, 1)
  ON CONFLICT (recipient_phone, window_start)
  DO UPDATE SET 
    message_count = rate_limits.message_count + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Clean up old rate limit records
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limits
  WHERE window_end < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Seed Data (Development)
-- ============================================================================

-- Insert default API key for development
INSERT INTO api_keys (tenant_id, api_key, name, description)
VALUES (
  'test-tenant',
  'test-key',
  'Development API Key',
  'Default API key for local development'
) ON CONFLICT (api_key) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE notifications IS 'Main notification records';
COMMENT ON TABLE delivery_logs IS 'Detailed delivery attempt tracking';
COMMENT ON TABLE rate_limits IS 'Rate limiting counters per recipient';
COMMENT ON TABLE api_keys IS 'Tenant API keys for authentication';

COMMENT ON COLUMN notifications.template IS 'WhatsApp template message (JSONB)';
COMMENT ON COLUMN notifications.message IS 'Plain text message (JSONB)';
COMMENT ON COLUMN notifications.metadata IS 'Custom metadata from client (JSONB)';
COMMENT ON COLUMN notifications.trace_id IS 'Distributed tracing ID';

-- ============================================================================
-- Grants (adjust as needed for your environment)
-- ============================================================================

-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
