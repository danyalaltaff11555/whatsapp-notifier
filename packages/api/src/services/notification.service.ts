import { randomUUID } from 'crypto';
import {
  logger,
  NotificationRequest,
  SQSMessagePayload,
  Priority,
  notificationRepository,
  rateLimitRepository,
} from '@whatsapp-notif/shared';
import { NotificationPriority } from '@prisma/client';
import { publishMessage } from './sqs.service';

/**
 * Notification service - business logic layer
 */

/**
 * Create and publish single notification
 */
export async function createNotification(
  request: NotificationRequest,
  apiKey: string
): Promise<{ id: string; status: string }> {
  const notificationId = randomUUID();
  const traceId = randomUUID();

  // Check rate limit
  const isUnderLimit = await rateLimitRepository.checkLimit(
    request.recipient.phone_number,
    10 // TODO: Get from API key config
  );

  if (!isUnderLimit) {
    throw new Error('Rate limit exceeded');
  }

  // Create notification in database
  const notification = await notificationRepository.create({
    id: notificationId,
    tenantId: apiKey,
    eventType: request.event_type,
    recipientPhone: request.recipient.phone_number,
    recipientCountryCode: request.recipient.country_code,
    template: request.template,
    message: request.message,
    metadata: request.metadata,
    priority: request.priority as NotificationPriority,
    scheduledFor: request.scheduled_for ? new Date(request.scheduled_for) : undefined,
    traceId,
  });

  // Increment rate limit
  await rateLimitRepository.increment(request.recipient.phone_number);

  // Prepare SQS payload
  const payload: SQSMessagePayload = {
    id: notification.id,
    event_type: notification.eventType,
    recipient: {
      phone_number: notification.recipientPhone,
      country_code: notification.recipientCountryCode,
    },
    template: notification.template as any,
    message: notification.message as any,
    metadata: notification.metadata as any,
    priority: notification.priority as Priority,
    attempt_number: 0,
    max_attempts: 5,
    created_at: notification.createdAt.toISOString(),
    scheduled_for: notification.scheduledFor?.toISOString(),
    trace_id: notification.traceId,
    tenant_id: notification.tenantId,
  };

  logger.info('Creating notification', {
    notificationId,
    eventType: request.event_type,
    recipient: request.recipient.phone_number,
    traceId,
  });

  // Publish to SQS
  await publishMessage({
    id: notificationId,
    body: JSON.stringify(payload),
    deduplicationId: notificationId,
  });

  return {
    id: notificationId,
    status: 'queued',
  };
}

/**
 * Create and publish bulk notifications
 */
export async function createBulkNotifications(
  requests: NotificationRequest[],
  apiKey: string
): Promise<{
  successful: Array<{ id: string; status: string }>;
  failed: Array<{ index: number; error: string }>;
}> {
  const results = {
    successful: [] as Array<{ id: string; status: string }>,
    failed: [] as Array<{ index: number; error: string }>,
  };

  // Process each notification
  for (let i = 0; i < requests.length; i++) {
    try {
      const result = await createNotification(requests[i], apiKey);
      results.successful.push(result);
    } catch (error) {
      results.failed.push({
        index: i,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  logger.info('Bulk notifications processed', {
    total: requests.length,
    successful: results.successful.length,
    failed: results.failed.length,
  });

  return results;
}
