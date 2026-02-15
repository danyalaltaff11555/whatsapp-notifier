import { NotificationRepository } from '../notification.repository';
import { prisma } from '../../database/client';
import { NotificationStatus, NotificationPriority } from '@prisma/client';

// Mock Prisma client
jest.mock('../../database/client', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('NotificationRepository', () => {
  let repository: NotificationRepository;

  beforeEach(() => {
    repository = new NotificationRepository();
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a notification', async () => {
      const mockNotification = {
        id: 'test-id',
        tenantId: 'tenant-1',
        eventType: 'order.placed',
        recipientPhone: '+14155552671',
        status: NotificationStatus.queued,
        priority: NotificationPriority.normal,
        attemptNumber: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.notification.create as jest.Mock).mockResolvedValue(mockNotification);

      const result = await repository.create({
        id: 'test-id',
        tenantId: 'tenant-1',
        eventType: 'order.placed',
        recipientPhone: '+14155552671',
        priority: NotificationPriority.normal,
        traceId: 'trace-123',
      });

      expect(result).toEqual(mockNotification);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'test-id',
          tenantId: 'tenant-1',
          status: NotificationStatus.queued,
        }),
      });
    });
  });

  describe('findById', () => {
    it('should find notification by ID', async () => {
      const mockNotification = {
        id: 'test-id',
        deliveryLogs: [],
      };

      (prisma.notification.findUnique as jest.Mock).mockResolvedValue(mockNotification);

      const result = await repository.findById('test-id');

      expect(result).toEqual(mockNotification);
      expect(prisma.notification.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        include: expect.any(Object),
      });
    });

    it('should return null if notification not found', async () => {
      (prisma.notification.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update notification status', async () => {
      const mockUpdated = {
        id: 'test-id',
        status: NotificationStatus.sent,
        sentAt: new Date(),
      };

      (prisma.notification.update as jest.Mock).mockResolvedValue(mockUpdated);

      const result = await repository.updateStatus('test-id', NotificationStatus.sent, {
        sentAt: mockUpdated.sentAt,
      });

      expect(result).toEqual(mockUpdated);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: {
          status: NotificationStatus.sent,
          sentAt: mockUpdated.sentAt,
        },
      });
    });
  });

  describe('findReadyForRetry', () => {
    it('should find notifications ready for retry', async () => {
      const mockNotifications = [
        { id: 'retry-1', status: NotificationStatus.failed },
        { id: 'retry-2', status: NotificationStatus.failed },
      ];

      (prisma.notification.findMany as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await repository.findReadyForRetry(10);

      expect(result).toEqual(mockNotifications);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: NotificationStatus.failed,
        }),
        take: 10,
        orderBy: { nextRetryAt: 'asc' },
      });
    });
  });
});
