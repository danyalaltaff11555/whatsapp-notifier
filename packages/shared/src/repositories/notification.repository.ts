import { Notification, NotificationStatus, NotificationPriority, Prisma } from '@prisma/client';
import { prisma } from '../database/client';

/**
 * Notification repository
 */

export interface CreateNotificationData {
  id: string;
  tenantId: string;
  eventType: string;
  recipientPhone: string;
  recipientCountryCode?: string;
  template?: any;
  message?: any;
  metadata?: any;
  priority: NotificationPriority;
  scheduledFor?: Date;
  traceId: string;
}

export interface NotificationFilters {
  status?: NotificationStatus;
  eventType?: string;
  recipientPhone?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export class NotificationRepository {
  /**
   * Create a new notification
   */
  async create(data: CreateNotificationData): Promise<Notification> {
    return prisma.notification.create({
      data: {
        id: data.id,
        tenantId: data.tenantId,
        eventType: data.eventType,
        recipientPhone: data.recipientPhone,
        recipientCountryCode: data.recipientCountryCode,
        template: data.template as Prisma.InputJsonValue,
        message: data.message as Prisma.InputJsonValue,
        metadata: data.metadata as Prisma.InputJsonValue,
        priority: data.priority,
        scheduledFor: data.scheduledFor,
        traceId: data.traceId,
        status: NotificationStatus.queued,
        attemptNumber: 0,
        maxAttempts: 5,
      },
    });
  }

  /**
   * Find notification by ID
   */
  async findById(id: string): Promise<Notification | null> {
    return prisma.notification.findUnique({
      where: { id },
      include: {
        deliveryLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  /**
   * Find notifications by tenant with filters
   */
  async findByTenant(
    tenantId: string,
    filters: NotificationFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<{ data: Notification[]; total: number }> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      tenantId,
      ...(filters.status && { status: filters.status }),
      ...(filters.eventType && { eventType: filters.eventType }),
      ...(filters.recipientPhone && { recipientPhone: filters.recipientPhone }),
      ...(filters.createdAfter && { createdAt: { gte: filters.createdAfter } }),
      ...(filters.createdBefore && { createdAt: { lte: filters.createdBefore } }),
    };

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Update notification status
   */
  async updateStatus(
    id: string,
    status: NotificationStatus,
    updates: {
      whatsappMessageId?: string;
      errorCode?: string;
      errorMessage?: string;
      sentAt?: Date;
      deliveredAt?: Date;
      readAt?: Date;
      failedAt?: Date;
    } = {}
  ): Promise<Notification> {
    return prisma.notification.update({
      where: { id },
      data: {
        status,
        ...updates,
      },
    });
  }

  /**
   * Increment attempt number and set next retry time
   */
  async incrementAttempt(id: string, nextRetryAt?: Date): Promise<Notification> {
    return prisma.notification.update({
      where: { id },
      data: {
        attemptNumber: { increment: 1 },
        nextRetryAt,
      },
    });
  }

  /**
   * Get notifications ready for retry
   */
  async findReadyForRetry(limit: number = 100): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: {
        status: NotificationStatus.failed,
        nextRetryAt: { lte: new Date() },
        attemptNumber: { lt: prisma.notification.fields.maxAttempts },
      },
      take: limit,
      orderBy: { nextRetryAt: 'asc' },
    });
  }

  /**
   * Get notifications scheduled for future delivery
   */
  async findScheduled(limit: number = 100): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: {
        status: NotificationStatus.scheduled,
        scheduledFor: { lte: new Date() },
      },
      take: limit,
      orderBy: { scheduledFor: 'asc' },
    });
  }
}

export const notificationRepository = new NotificationRepository();
