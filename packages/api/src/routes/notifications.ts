import { FastifyInstance } from 'fastify';
import {
  notificationRequestSchema,
  bulkNotificationRequestSchema,
  notificationRepository,
} from '@whatsapp-notif/shared';
import { authenticateApiKey } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import {
  createNotification,
  createBulkNotifications,
} from '../services/notification.service';

/**
 * Notification routes
 */

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/notifications - Create single notification
  app.post(
    '/v1/notifications',
    {
      preHandler: [authenticateApiKey, validateRequest(notificationRequestSchema)],
    },
    async (request, reply) => {
      const apiKey = (request as any).apiKey;
      const result = await createNotification(request.body as any, apiKey);

      return reply.status(201).send({
        success: true,
        data: result,
      });
    }
  );

  // POST /v1/notifications/bulk - Create bulk notifications
  app.post(
    '/v1/notifications/bulk',
    {
      preHandler: [
        authenticateApiKey,
        validateRequest(bulkNotificationRequestSchema),
      ],
    },
    async (request, reply) => {
      const apiKey = (request as any).apiKey;
      const body = request.body as any;

      const result = await createBulkNotifications(
        body.notifications,
        apiKey
      );

      return reply.status(201).send({
        success: true,
        data: {
          total: body.notifications.length,
          successful: result.successful.length,
          failed: result.failed.length,
          results: {
            successful: result.successful,
            failed: result.failed,
          },
        },
      });
    }
  );

  // GET /v1/notifications/:id/status - Get notification status
  app.get(
    '/v1/notifications/:id/status',
    {
      preHandler: [authenticateApiKey],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const apiKey = (request as any).apiKey;

      const notification = await notificationRepository.findById(id);

      if (!notification) {
        return reply.status(404).send({
          success: false,
          error: 'Notification not found',
          code: 'NOT_FOUND',
        });
      }

      // Check tenant access
      if (notification.tenantId !== apiKey) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
          code: 'FORBIDDEN',
        });
      }

      return reply.send({
        success: true,
        data: {
          id: notification.id,
          status: notification.status,
          eventType: notification.eventType,
          recipientPhone: notification.recipientPhone,
          priority: notification.priority,
          createdAt: notification.createdAt,
          sentAt: notification.sentAt,
          deliveredAt: notification.deliveredAt,
          readAt: notification.readAt,
          failedAt: notification.failedAt,
          attemptNumber: notification.attemptNumber,
          errorCode: notification.errorCode,
          errorMessage: notification.errorMessage,
          deliveryLogs: notification.deliveryLogs?.map((log) => ({
            attemptNumber: log.attemptNumber,
            status: log.status,
            createdAt: log.createdAt,
            errorCode: log.errorCode,
            errorMessage: log.errorMessage,
          })),
        },
      });
    }
  );
}
