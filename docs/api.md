# API Reference

## Overview

The WhatsApp Notification Microservice provides a RESTful API for sending WhatsApp notifications. All endpoints require authentication and return JSON responses.

**Base URL:** `http://localhost:3000` (development) or your production domain

---

## Authentication

All API requests require authentication using an API key.

### API Key Authentication

Include your API key in the request header:

```
X-API-Key: your_api_key_here
```

**Example:**
```bash
curl -H "X-API-Key: your_api_key_here" \
  http://localhost:3000/v1/notifications
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API key"
  }
}
```

---

## Endpoints

### Health Check

Check service health and status.

**Endpoint:** `GET /health`

**Authentication:** Not required

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-12-20T10:00:00Z"
}
```

---

### Detailed Health Check

Get detailed health information including database connectivity.

**Endpoint:** `GET /v1/health`

**Authentication:** Not required

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-12-20T10:00:00Z",
  "services": {
    "database": {
      "connected": true,
      "latency": 5
    },
    "redis": {
      "connected": true,
      "latency": 2
    }
  }
}
```

---

### Create Notification

Send a WhatsApp notification to a recipient.

**Endpoint:** `POST /v1/notifications`

**Authentication:** Required

**Request Body:**
```json
{
  "event_type": "order.placed",
  "recipient": {
    "phone_number": "+14155552671",
    "country_code": "US"
  },
  "template": {
    "name": "order_confirmation",
    "language": "en",
    "components": [
      {
        "type": "body",
        "parameters": [
          {
            "type": "text",
            "text": "ORDER-123"
          },
          {
            "type": "text",
            "text": "$99.99"
          }
        ]
      }
    ]
  },
  "priority": "high",
  "scheduled_for": "2024-12-25T10:00:00Z",
  "metadata": {
    "order_id": "ORDER-123",
    "customer_id": "CUST-456"
  }
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event_type` | string | Yes | Event identifier (e.g., "order.placed") |
| `recipient.phone_number` | string | Yes | E.164 format phone number |
| `recipient.country_code` | string | No | ISO country code |
| `template.name` | string | Yes* | WhatsApp template name |
| `template.language` | string | Yes* | Template language code |
| `template.components` | array | Yes* | Template parameters |
| `message.text` | string | Yes** | Plain text message |
| `priority` | string | No | "low", "normal", "high" (default: "normal") |
| `scheduled_for` | string | No | ISO 8601 datetime for scheduled delivery |
| `metadata` | object | No | Custom metadata (max 1KB) |

*Required if using template message
**Required if using text message (either template or message required)

**Success Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "notif_abc123def456",
    "status": "queued",
    "created_at": "2024-12-20T10:00:00Z",
    "scheduled_for": "2024-12-25T10:00:00Z"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid phone number format",
    "details": {
      "field": "recipient.phone_number",
      "value": "invalid",
      "expected": "E.164 format (e.g., +14155552671)"
    }
  }
}
```

---

### Create Bulk Notifications

Send multiple notifications in a single request.

**Endpoint:** `POST /v1/notifications/bulk`

**Authentication:** Required

**Request Body:**
```json
{
  "notifications": [
    {
      "event_type": "order.placed",
      "recipient": {
        "phone_number": "+14155552671"
      },
      "template": {
        "name": "order_confirmation",
        "language": "en",
        "components": [...]
      }
    },
    {
      "event_type": "order.placed",
      "recipient": {
        "phone_number": "+14155552672"
      },
      "template": {
        "name": "order_confirmation",
        "language": "en",
        "components": [...]
      }
    }
  ]
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "total": 2,
    "created": 2,
    "failed": 0,
    "notifications": [
      {
        "id": "notif_abc123",
        "status": "queued"
      },
      {
        "id": "notif_def456",
        "status": "queued"
      }
    ]
  }
}
```

---

### Get Notification Status

Retrieve the current status of a notification.

**Endpoint:** `GET /v1/notifications/:id/status`

**Authentication:** Required

**Path Parameters:**
- `id` - Notification ID

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "notif_abc123",
    "status": "delivered",
    "event_type": "order.placed",
    "recipient": {
      "phone_number": "+14155552671"
    },
    "priority": "high",
    "attempt_number": 1,
    "max_attempts": 5,
    "created_at": "2024-12-20T10:00:00Z",
    "sent_at": "2024-12-20T10:00:05Z",
    "delivered_at": "2024-12-20T10:00:08Z",
    "whatsapp_message_id": "wamid.xxx"
  }
}
```

**Possible Status Values:**
- `queued` - Waiting to be processed
- `scheduled` - Scheduled for future delivery
- `processing` - Currently being sent
- `sent` - Successfully sent to WhatsApp
- `delivered` - Delivered to recipient
- `read` - Read by recipient
- `failed` - Failed to deliver

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Notification not found"
  }
}
```

---

### Get Delivery Statistics

Retrieve delivery statistics for a date range.

**Endpoint:** `GET /v1/analytics/stats`

**Authentication:** Required

**Query Parameters:**
- `startDate` - Start date (ISO 8601 format)
- `endDate` - End date (ISO 8601 format)
- `tenantId` - Filter by tenant (optional)

**Example:**
```bash
GET /v1/analytics/stats?startDate=2024-12-01&endDate=2024-12-31
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2024-12-01T00:00:00Z",
      "end": "2024-12-31T23:59:59Z"
    },
    "stats": {
      "total": 10000,
      "successful": 9950,
      "failed": 50,
      "pending": 0,
      "successRate": 99.5,
      "avgResponseTime": 250,
      "byStatus": {
        "delivered": 9800,
        "read": 8500,
        "sent": 150,
        "failed": 50
      },
      "byPriority": {
        "high": 2000,
        "normal": 7500,
        "low": 500
      }
    }
  }
}
```

---

### List Notifications

List notifications with filtering and pagination.

**Endpoint:** `GET /v1/analytics/notifications`

**Authentication:** Required

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `status` - Filter by status
- `eventType` - Filter by event type
- `recipientPhone` - Filter by recipient
- `startDate` - Filter by creation date (from)
- `endDate` - Filter by creation date (to)

**Example:**
```bash
GET /v1/analytics/notifications?status=failed&page=1&limit=20
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif_abc123",
        "status": "failed",
        "event_type": "order.placed",
        "recipient_phone": "+14155552671",
        "created_at": "2024-12-20T10:00:00Z",
        "error_code": "RECIPIENT_UNAVAILABLE",
        "error_message": "Recipient phone number is not registered"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

---

### WhatsApp Webhook

Receive status updates from WhatsApp.

**Endpoint:** `POST /v1/webhooks/whatsapp`

**Authentication:** WhatsApp signature verification

**Webhook Verification (GET):**
```bash
GET /v1/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=xxx&hub.verify_token=your_token
```

**Status Update (POST):**
```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "statuses": [
              {
                "id": "wamid.xxx",
                "status": "delivered",
                "timestamp": "1703073608",
                "recipient_id": "14155552671"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

---

## Rate Limiting

### Limits

- **Per Tenant:** 100 requests/minute
- **Per Recipient:** 10 messages/hour

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1703073608
```

### Rate Limit Exceeded Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 45 seconds.",
    "retryAfter": 45
  }
}
```

---

## Examples

### Send Template Message

```bash
curl -X POST http://localhost:3000/v1/notifications \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "order.placed",
    "recipient": {
      "phone_number": "+14155552671"
    },
    "template": {
      "name": "order_confirmation",
      "language": "en",
      "components": [
        {
          "type": "body",
          "parameters": [
            {"type": "text", "text": "ORDER-123"}
          ]
        }
      ]
    }
  }'
```

### Send Text Message

```bash
curl -X POST http://localhost:3000/v1/notifications \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "custom.message",
    "recipient": {
      "phone_number": "+14155552671"
    },
    "message": {
      "text": "Hello! Your order has been confirmed."
    }
  }'
```

### Schedule Message

```bash
curl -X POST http://localhost:3000/v1/notifications \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "reminder",
    "recipient": {
      "phone_number": "+14155552671"
    },
    "message": {
      "text": "Reminder: Your appointment is tomorrow at 2 PM"
    },
    "scheduled_for": "2024-12-25T10:00:00Z"
  }'
```

### Check Status

```bash
curl -X GET http://localhost:3000/v1/notifications/notif_abc123/status \
  -H "X-API-Key: your_api_key"
```

---

## Best Practices

### Phone Numbers

- Always use E.164 format: `+[country_code][number]`
- Example: `+14155552671` (US), `+442071838750` (UK)
- Validate before sending

### Templates

- Pre-approve templates with WhatsApp
- Use template names exactly as registered
- Ensure parameter count matches template

### Error Handling

- Implement exponential backoff for retries
- Handle rate limits gracefully
- Log errors for debugging

### Webhooks

- Verify webhook signatures
- Respond quickly (< 5 seconds)
- Process updates asynchronously

### Performance

- Use bulk endpoints for multiple notifications
- Cache API keys
- Implement request timeouts

---

## SDKs and Libraries

### Node.js Example

```javascript
const axios = require('axios');

const client = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'X-API-Key': 'your_api_key',
    'Content-Type': 'application/json'
  }
});

async function sendNotification(data) {
  try {
    const response = await client.post('/v1/notifications', data);
    console.log('Notification sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
sendNotification({
  event_type: 'order.placed',
  recipient: { phone_number: '+14155552671' },
  template: {
    name: 'order_confirmation',
    language: 'en',
    components: [...]
  }
});
```

### Python Example

```python
import requests

class WhatsAppNotificationClient:
    def __init__(self, api_key, base_url='http://localhost:3000'):
        self.base_url = base_url
        self.headers = {
            'X-API-Key': api_key,
            'Content-Type': 'application/json'
        }
    
    def send_notification(self, data):
        response = requests.post(
            f'{self.base_url}/v1/notifications',
            json=data,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

# Usage
client = WhatsAppNotificationClient('your_api_key')
result = client.send_notification({
    'event_type': 'order.placed',
    'recipient': {'phone_number': '+14155552671'},
    'template': {...}
})
```

---

## Support

For API support and questions:
- [GitHub Issues](https://github.com/yourusername/whatsapp-notification-service/issues)
- [Documentation](../README.md)
