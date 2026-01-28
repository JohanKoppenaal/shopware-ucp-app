/**
 * Webhook Delivery Repository
 * Handles database operations for webhook delivery tracking
 */

import { PrismaClient, type WebhookDelivery, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export type WebhookStatus = 'pending' | 'sent' | 'failed' | 'retrying';

export interface CreateWebhookDeliveryInput {
  shopId: string;
  sessionId?: string;
  orderId?: string;
  event: string;
  targetUrl: string;
  payload: Record<string, unknown>;
}

export interface WebhookDeliveryFilters {
  status?: WebhookStatus;
  shopId?: string;
  event?: string;
  afterDate?: Date;
  beforeDate?: Date;
  createdAfter?: Date;
}

class WebhookDeliveryRepository {
  /**
   * Create a new webhook delivery record
   */
  async create(data: CreateWebhookDeliveryInput): Promise<WebhookDelivery> {
    return prisma.webhookDelivery.create({
      data: {
        shopId: data.shopId,
        sessionId: data.sessionId,
        orderId: data.orderId,
        event: data.event,
        targetUrl: data.targetUrl,
        payload: data.payload as Prisma.InputJsonValue,
        status: 'pending',
        attempts: 0,
      },
    });
  }

  /**
   * Find a delivery by ID
   */
  async findById(id: string): Promise<WebhookDelivery | null> {
    return prisma.webhookDelivery.findUnique({
      where: { id },
    });
  }

  /**
   * Find deliveries pending retry
   */
  async findPendingRetries(limit = 100): Promise<WebhookDelivery[]> {
    return prisma.webhookDelivery.findMany({
      where: {
        status: { in: ['pending', 'retrying'] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Find deliveries by filters
   */
  async findMany(
    filters: WebhookDeliveryFilters,
    options: { limit?: number; offset?: number } = {}
  ): Promise<WebhookDelivery[]> {
    const where: Prisma.WebhookDeliveryWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.shopId) {
      where.shopId = filters.shopId;
    }
    if (filters.event) {
      where.event = filters.event;
    }
    // Support both afterDate and createdAfter (alias)
    const afterDate = filters.afterDate || filters.createdAfter;
    if (afterDate && filters.beforeDate) {
      where.createdAt = { gte: afterDate, lte: filters.beforeDate };
    } else if (afterDate) {
      where.createdAt = { gte: afterDate };
    } else if (filters.beforeDate) {
      where.createdAt = { lte: filters.beforeDate };
    }

    return prisma.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      skip: options.offset,
    });
  }

  /**
   * Mark delivery as sent
   */
  async markSent(id: string): Promise<WebhookDelivery> {
    return prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'sent',
        deliveredAt: new Date(),
        lastAttemptAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  }

  /**
   * Mark delivery as failed with retry
   */
  async markFailedWithRetry(
    id: string,
    error: string,
    nextRetryAt: Date
  ): Promise<WebhookDelivery> {
    return prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'retrying',
        lastError: error,
        lastAttemptAt: new Date(),
        nextRetryAt,
        attempts: { increment: 1 },
      },
    });
  }

  /**
   * Mark delivery as permanently failed
   */
  async markFailed(id: string, error: string): Promise<WebhookDelivery> {
    return prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'failed',
        lastError: error,
        lastAttemptAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  }

  /**
   * Get delivery statistics for a shop
   */
  async getStats(shopId: string): Promise<{
    total: number;
    sent: number;
    failed: number;
    pending: number;
  }> {
    const [total, sent, failed, pending] = await Promise.all([
      prisma.webhookDelivery.count({ where: { shopId } }),
      prisma.webhookDelivery.count({ where: { shopId, status: 'sent' } }),
      prisma.webhookDelivery.count({ where: { shopId, status: 'failed' } }),
      prisma.webhookDelivery.count({
        where: { shopId, status: { in: ['pending', 'retrying'] } },
      }),
    ]);

    return { total, sent, failed, pending };
  }

  /**
   * Delete old delivered webhooks
   */
  async deleteOldDelivered(olderThan: Date): Promise<number> {
    const result = await prisma.webhookDelivery.deleteMany({
      where: {
        status: 'sent',
        deliveredAt: { lt: olderThan },
      },
    });
    return result.count;
  }

  /**
   * Find deliveries by order ID
   */
  async findByOrderId(orderId: string): Promise<WebhookDelivery[]> {
    return prisma.webhookDelivery.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find deliveries by session ID
   */
  async findBySessionId(sessionId: string): Promise<WebhookDelivery[]> {
    return prisma.webhookDelivery.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const webhookDeliveryRepository = new WebhookDeliveryRepository();
