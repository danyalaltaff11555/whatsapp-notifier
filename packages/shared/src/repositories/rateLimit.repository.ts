import { RateLimit } from '@prisma/client';
import { prisma } from '../database/client';

/**
 * Rate limit repository
 */

export class RateLimitRepository {
  /**
   * Check if recipient is under rate limit
   */
  async checkLimit(recipientPhone: string, limitPerHour: number = 10): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const count = await prisma.rateLimit.aggregate({
      where: {
        recipientPhone,
        windowEnd: { gt: new Date() },
        windowStart: { gt: oneHourAgo },
      },
      _sum: {
        messageCount: true,
      },
    });

    const currentCount = count._sum.messageCount || 0;
    return currentCount < limitPerHour;
  }

  /**
   * Increment rate limit counter
   */
  async increment(recipientPhone: string): Promise<RateLimit> {
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);

    // Try to find existing record for this hour
    const existing = await prisma.rateLimit.findFirst({
      where: {
        recipientPhone,
        windowStart,
      },
    });

    if (existing) {
      // Increment existing counter
      return prisma.rateLimit.update({
        where: { id: existing.id },
        data: {
          messageCount: { increment: 1 },
        },
      });
    } else {
      // Create new counter
      return prisma.rateLimit.create({
        data: {
          recipientPhone,
          windowStart,
          windowEnd,
          messageCount: 1,
        },
      });
    }
  }

  /**
   * Get current count for recipient
   */
  async getCount(recipientPhone: string): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await prisma.rateLimit.aggregate({
      where: {
        recipientPhone,
        windowEnd: { gt: new Date() },
        windowStart: { gt: oneHourAgo },
      },
      _sum: {
        messageCount: true,
      },
    });

    return result._sum.messageCount || 0;
  }

  /**
   * Clean up old rate limit records
   */
  async cleanup(olderThan: Date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)): Promise<number> {
    const result = await prisma.rateLimit.deleteMany({
      where: {
        windowEnd: { lt: olderThan },
      },
    });

    return result.count;
  }

  /**
   * Get retry-after time in seconds
   */
  async getRetryAfter(recipientPhone: string): Promise<number | null> {
    const record = await prisma.rateLimit.findFirst({
      where: {
        recipientPhone,
        windowEnd: { gt: new Date() },
      },
      orderBy: {
        windowEnd: 'desc',
      },
    });

    if (!record) {
      return null;
    }

    const retryAfterMs = record.windowEnd.getTime() - Date.now();
    return Math.ceil(retryAfterMs / 1000);
  }
}

export const rateLimitRepository = new RateLimitRepository();
