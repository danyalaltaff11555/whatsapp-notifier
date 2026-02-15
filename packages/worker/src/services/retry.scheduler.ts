import { logger, notificationRepository } from '@whatsapp-notif/shared';
import { NotificationStatus } from '@prisma/client';
import { MessageProcessor } from './message.processor';

/**
 * Retry scheduler - processes failed notifications for retry
 */

export class RetryScheduler {
  private processor: MessageProcessor;
  private isRunning: boolean = false;
  private intervalMs: number;

  constructor(intervalMs: number = 60000) {
    // Default: check every minute
    this.processor = new MessageProcessor();
    this.intervalMs = intervalMs;
  }

  /**
   * Start retry scheduler
   */
  start(): void {
    this.isRunning = true;
    logger.info('Retry scheduler started', { intervalMs: this.intervalMs });
    this.scheduleNext();
  }

  /**
   * Stop retry scheduler
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Retry scheduler stopped');
  }

  /**
   * Schedule next retry check
   */
  private scheduleNext(): void {
    if (!this.isRunning) {
      return;
    }

    setTimeout(async () => {
      try {
        await this.processRetries();
      } catch (error) {
        logger.error('Error in retry scheduler', { error });
      }
      this.scheduleNext();
    }, this.intervalMs);
  }

  /**
   * Process notifications ready for retry
   */
  private async processRetries(): Promise<void> {
    const notifications = await notificationRepository.findReadyForRetry(100);

    if (notifications.length === 0) {
      return;
    }

    logger.info('Processing retries', { count: notifications.length });

    for (const notification of notifications) {
      try {
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

        logger.info('Retry processed', {
          notificationId: notification.id,
          attemptNumber: notification.attemptNumber + 1,
        });
      } catch (error) {
        logger.error('Failed to process retry', {
          notificationId: notification.id,
          error,
        });
      }
    }
  }
}
