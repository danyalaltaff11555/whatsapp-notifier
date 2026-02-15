import { FastifyInstance } from 'fastify';
import { notificationRepository, deliveryLogRepository } from '@whatsapp-notif/shared';
import { authenticateApiKey } from '../middleware/auth';

/**
 * Analytics and reporting routes
 */

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // GET /v1/analytics/stats - Get delivery statistics
  app.get(
    '/v1/analytics/stats',
    {
      preHandler: [authenticateApiKey],
    },
    async (request, reply) => {
      const apiKey = (request as any).apiKey;
      const { startDate, endDate } = request.query as {
        startDate?: string;
        endDate?: string;
      };

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const stats = await deliveryLogRepository.getStats(apiKey, start, end);

      return reply.send({
        success: true,
        data: {
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
          stats: {
            total: stats.total,
            successful: stats.successful,
            failed: stats.failed,
            successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
            avgResponseTime: stats.avgResponseTime,
          },
        },
      });
    }
  );

  // GET /v1/analytics/notifications - List notifications with filters
  app.get(
    '/v1/analytics/notifications',
    {
      preHandler: [authenticateApiKey],
    },
    async (request, reply) => {
      const apiKey = (request as any).apiKey;
      const { status, eventType, page = 1, limit = 20 } = request.query as {
        status?: string;
        eventType?: string;
        page?: number;
        limit?: number;
      };

      const result = await notificationRepository.findByTenant(
        apiKey,
        {
          status: status as any,
          eventType,
        },
        {
          page: Number(page),
          limit: Number(limit),
        }
      );

      return reply.send({
        success: true,
        data: result.data,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: result.total,
          pages: Math.ceil(result.total / Number(limit)),
        },
      });
    }
  );
}
