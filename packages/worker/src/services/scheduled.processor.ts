import { logger, notificationRepository } from '@whatsapp-notif/shared';
import { NotificationStatus } from '@prisma/client';
import { MessageProcessor } from './message.processor';

/**
 * Scheduled message processor - processes scheduled notifications
 */

export class ScheduledProcessor {
  private processor: MessageProcessor;
  private isRunning: boolean = false;
  private intervalMs: number;

  constructor(intervalMs: number = 30000) {
    // Default: check every 30 seconds
    this.processor = new MessageProcessor();
    this.intervalMs = intervalMs;
  }

  /**
   * Start scheduled processor
   */
  start(): void {
    this.isRunning = true;
    logger.info('Scheduled processor started', { intervalMs: this.intervalMs });
    this.scheduleNext();
  }

  /**
   * Stop scheduled processor
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Scheduled processor stopped');
  }

  /**
   * Schedule next check
   */
  private scheduleNext(): void {
    if (!this.isRunning) {
      return;
    }

    setTimeout(async () => {
      try {
        await this.processScheduled();
      } catch (error) {
        logger.error('Error in scheduled processor', { error });
      }
      this.scheduleNext();
    }, this.intervalMs);
  }

  /**
   * Process scheduled notifications
   */
  private async processScheduled(): Promise<void> {
    const notifications = await notificationRepository.findScheduled(100);

    if (notifications.length === 0) {
      return;
    }

    logger.info('Processing scheduled notifications', { count: notifications.length });

    for (const notification of notifications) {
      try {
        // Update status from scheduled to queued
        await notificationRepository.updateStatus(notification.id, NotificationStatus.queued);

        // Create SQS-like message for processor
        const message = {
          MessageId: notification.id,
          Body: JSON.stringify({
            id: notification.id,
            event_type: notification.eventType,
            recipient: {
              phone_number: notification.recipientPhone,
              country_code: notification.recipientCountryCode,
            },
            template: notification.template,
            message: notification.message,
            metadata: notification.metadata,
            priority: notification.priority,
            attempt_number: notification.attemptNumber,
            max_attempts: notification.maxAttempts,
            created_at: notification.createdAt.toISOString(),
            scheduled_for: notification.scheduledFor?.toISOString(),
            trace_id: notification.traceId,
            tenant_id: notification.tenantId,
          }),
        };

        await this.processor.processMessage(message as any);

        logger.info('Scheduled notification processed', {
          notificationId: notification.id,
          scheduledFor: notification.scheduledFor,
        });
      } catch (error) {
        logger.error('Failed to process scheduled notification', {
          notificationId: notification.id,
          error,
        });
      }
    }
  }
}
