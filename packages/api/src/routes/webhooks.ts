import { FastifyInstance, FastifyRequest } from 'fastify';
import { logger, notificationRepository, deliveryLogRepository } from '@whatsapp-notif/shared';
import { NotificationStatus } from '@prisma/client';

/**
 * WhatsApp webhook routes
 */

interface WebhookVerification {
  'hub.mode': string;
  'hub.verify_token': string;
  'hub.challenge': string;
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // GET /v1/webhooks/whatsapp - Webhook verification
  app.get('/v1/webhooks/whatsapp', async (request: FastifyRequest<{ Querystring: WebhookVerification }>, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'your-verify-token';

    if (mode === 'subscribe' && token === verifyToken) {
      logger.info('Webhook verified');
      return reply.status(200).send(challenge);
    } else {
      logger.warn('Webhook verification failed');
      return reply.status(403).send('Forbidden');
    }
  });

  // POST /v1/webhooks/whatsapp - Receive webhook events
  app.post('/v1/webhooks/whatsapp', async (request, reply) => {
    const body = request.body as any;

    logger.info('Received webhook', { body });

    try {
      // Process webhook payload
      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            if (change.value?.statuses) {
              await processStatusUpdates(change.value.statuses);
            }
            if (change.value?.messages) {
              await processIncomingMessages(change.value.messages);
            }
          }
        }
      }

      return reply.status(200).send({ success: true });
    } catch (error) {
      logger.error('Error processing webhook', { error });
      return reply.status(500).send({ success: false });
    }
  });
}

/**
 * Process status updates from WhatsApp
 */
async function processStatusUpdates(statuses: any[]): Promise<void> {
  for (const status of statuses) {
    const whatsappMessageId = status.id;
    const statusValue = status.status; // sent, delivered, read, failed

    logger.info('Processing status update', {
      whatsappMessageId,
      status: statusValue,
    });

    try {
      // Find notification by WhatsApp message ID
      const notification = await notificationRepository.findById(whatsappMessageId);

      if (!notification) {
        logger.warn('Notification not found for status update', { whatsappMessageId });
        continue;
      }

      // Update notification status
      const updates: any = {};
      let newStatus: NotificationStatus = notification.status;

      switch (statusValue) {
        case 'sent':
          newStatus = NotificationStatus.sent;
          updates.sentAt = new Date(parseInt(status.timestamp) * 1000);
          break;
        case 'delivered':
          newStatus = NotificationStatus.delivered;
          updates.deliveredAt = new Date(parseInt(status.timestamp) * 1000);
          break;
        case 'read':
          newStatus = NotificationStatus.read;
          updates.readAt = new Date(parseInt(status.timestamp) * 1000);
          break;
        case 'failed':
          newStatus = NotificationStatus.failed;
          updates.failedAt = new Date(parseInt(status.timestamp) * 1000);
          if (status.errors && status.errors.length > 0) {
            updates.errorCode = status.errors[0].code?.toString();
            updates.errorMessage = status.errors[0].title;
          }
          break;
      }

      await notificationRepository.updateStatus(notification.id, newStatus, updates);

      // Log status update
      await deliveryLogRepository.create({
        notificationId: notification.id,
        attemptNumber: notification.attemptNumber,
        status: newStatus,
        whatsappMessageId,
        errorCode: updates.errorCode,
        errorMessage: updates.errorMessage,
      });

      logger.info('Status update processed', {
        notificationId: notification.id,
        status: newStatus,
      });
    } catch (error) {
      logger.error('Error processing status update', { error, whatsappMessageId });
    }
  }
}

/**
 * Process incoming messages (for future two-way communication)
 */
async function processIncomingMessages(messages: any[]): Promise<void> {
  for (const message of messages) {
    logger.info('Received incoming message', {
      from: message.from,
      type: message.type,
      messageId: message.id,
    });

    // TODO: Implement incoming message handling in future phase
  }
}
