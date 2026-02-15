import { DeliveryLog, NotificationStatus, Prisma } from '@prisma/client';
import { prisma } from '../database/client';

/**
 * Delivery log repository
 */

export interface CreateDeliveryLogData {
  notificationId: string;
  attemptNumber: number;
  status: NotificationStatus;
  whatsappMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  responseTimeMs?: number;
  apiResponse?: any;
}

export class DeliveryLogRepository {
  /**
   * Create a delivery log entry
   */
  async create(data: CreateDeliveryLogData): Promise<DeliveryLog> {
    return prisma.deliveryLog.create({
      data: {
        notificationId: data.notificationId,
        attemptNumber: data.attemptNumber,
        status: data.status,
        whatsappMessageId: data.whatsappMessageId,
        errorCode: data.errorCode,
        errorMessage: data.errorMessage,
        responseTimeMs: data.responseTimeMs,
        apiResponse: data.apiResponse as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Find all delivery logs for a notification
   */
  async findByNotification(notificationId: string): Promise<DeliveryLog[]> {
    return prisma.deliveryLog.findMany({
      where: { notificationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get latest delivery log for a notification
   */
  async findLatest(notificationId: string): Promise<DeliveryLog | null> {
    return prisma.deliveryLog.findFirst({
      where: { notificationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get delivery statistics
   */
  async getStats(tenantId: string, startDate: Date, endDate: Date): Promise<{
    total: number;
    successful: number;
    failed: number;
    avgResponseTime: number;
  }> {
    const logs = await prisma.deliveryLog.findMany({
      where: {
        notification: { tenantId },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        status: true,
        responseTimeMs: true,
      },
    });

    const total = logs.length;
    const successful = logs.filter(
      (l) =>
        l.status === NotificationStatus.sent ||
        l.status === NotificationStatus.delivered ||
        l.status === NotificationStatus.read
    ).length;
    const failed = logs.filter((l) => l.status === NotificationStatus.failed).length;
    const avgResponseTime =
      logs.reduce((sum, l) => sum + (l.responseTimeMs || 0), 0) / total || 0;

    return {
      total,
      successful,
      failed,
      avgResponseTime: Math.round(avgResponseTime),
    };
  }
}

export const deliveryLogRepository = new DeliveryLogRepository();
