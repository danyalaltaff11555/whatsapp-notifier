import { Message } from '@aws-sdk/client-sqs';
import {
  logger,
  SQSMessagePayload,
  notificationRepository,
  deliveryLogRepository,
  createWhatsAppClient,
  WhatsAppClient,
} from '@whatsapp-notif/shared';
import { NotificationStatus } from '@prisma/client';
import { workerConfig } from '../config';
import { calculateRetryDelay } from '@whatsapp-notif/shared';

/**
 * Message processor - handles WhatsApp message sending
 */

export class MessageProcessor {
  private whatsappClient: WhatsAppClient;

  constructor() {
    this.whatsappClient = createWhatsAppClient(workerConfig.whatsapp);
  }

  /**
   * Process SQS message
   */
  async processMessage(message: Message): Promise<void> {
    if (!message.Body) {
      throw new Error('Message body is empty');
    }

    const payload: SQSMessagePayload = JSON.parse(message.Body);
    const startTime = Date.now();

    logger.info('Processing notification', {
      notificationId: payload.id,
      eventType: payload.event_type,
      recipient: payload.recipient.phone_number,
      attempt: payload.attempt_number + 1,
    });

    try {
      // Update status to processing
      await notificationRepository.updateStatus(payload.id, NotificationStatus.processing);

      // Send WhatsApp message
      const response = await this.sendWhatsAppMessage(payload);

      // Update notification as sent
      await notificationRepository.updateStatus(payload.id, NotificationStatus.sent, {
        whatsappMessageId: response.messages[0]?.id,
        sentAt: new Date(),
      });

      // Log successful delivery
      await deliveryLogRepository.create({
        notificationId: payload.id,
        attemptNumber: payload.attempt_number + 1,
        status: NotificationStatus.sent,
        whatsappMessageId: response.messages[0]?.id,
        responseTimeMs: Date.now() - startTime,
        apiResponse: response,
      });

      logger.info('Notification sent successfully', {
        notificationId: payload.id,
        whatsappMessageId: response.messages[0]?.id,
      });
    } catch (error: any) {
      await this.handleError(payload, error, startTime);
    }
  }

  /**
   * Send WhatsApp message based on payload
   */
  private async sendWhatsAppMessage(payload: SQSMessagePayload): Promise<any> {
    const recipient = payload.recipient.phone_number;

    // Send template message
    if (payload.template) {
      return this.whatsappClient.sendTemplateMessage(
        recipient,
        payload.template.name,
        payload.template.language,
        payload.template.components
      );
    }

    // Send text message
    if (payload.message) {
      return this.whatsappClient.sendTextMessage(recipient, payload.message.body);
    }

    throw new Error('No message content provided');
  }

  /**
   * Handle processing errors
   */
  private async handleError(
    payload: SQSMessagePayload,
    error: any,
    startTime: number
  ): Promise<void> {
    const attemptNumber = payload.attempt_number + 1;
    const isRetryable = this.whatsappClient.isRetryableError(error);

    logger.error('Failed to send notification', {
      notificationId: payload.id,
      error: error.message,
      attemptNumber,
      isRetryable,
    });

    // Log failed attempt
    await deliveryLogRepository.create({
      notificationId: payload.id,
      attemptNumber,
      status: NotificationStatus.failed,
      errorCode: error.response?.data?.error?.code?.toString(),
      errorMessage: error.message,
      responseTimeMs: Date.now() - startTime,
      apiResponse: error.response?.data,
    });

    // Check if we should retry
    if (isRetryable && attemptNumber < payload.max_attempts) {
      const retryDelay = calculateRetryDelay(attemptNumber);
      const nextRetryAt = new Date(Date.now() + retryDelay);

      await notificationRepository.updateStatus(payload.id, NotificationStatus.failed, {
        errorCode: error.response?.data?.error?.code?.toString(),
        errorMessage: error.message,
      });

      await notificationRepository.incrementAttempt(payload.id, nextRetryAt);

      logger.info('Notification will be retried', {
        notificationId: payload.id,
        nextRetryAt,
        attemptNumber,
      });
    } else {
      // Max attempts reached or non-retryable error
      await notificationRepository.updateStatus(payload.id, NotificationStatus.failed, {
        errorCode: error.response?.data?.error?.code?.toString(),
        errorMessage: error.message,
        failedAt: new Date(),
      });

      logger.error('Notification permanently failed', {
        notificationId: payload.id,
        attemptNumber,
        reason: isRetryable ? 'max_attempts_reached' : 'non_retryable_error',
      });
    }
  }
}
