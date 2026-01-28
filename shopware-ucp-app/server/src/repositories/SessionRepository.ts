/**
 * Session Repository
 * Handles database operations for checkout sessions
 */

import { PrismaClient, type CheckoutSession, type Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();

export interface CreateSessionData {
  shopId: string;
  shopwareCartToken: string;
  platformProfileUrl?: string;
  platformId?: string;
  platformCapabilities?: unknown;
  activeCapabilities?: unknown;
  activeExtensions?: unknown;
  buyerEmail?: string;
  buyerPhone?: string;
  expiresInHours?: number;
}

export interface UpdateSessionData {
  status?: string;
  shippingAddress?: unknown;
  billingAddress?: unknown;
  selectedFulfillmentId?: string;
  appliedDiscountCodes?: unknown;
  shopwareOrderId?: string;
  shopwareOrderNumber?: string;
  paymentHandlerId?: string;
  paymentTransactionId?: string;
  completedAt?: Date;
}

export class SessionRepository {
  /**
   * Create a new checkout session
   */
  async create(data: CreateSessionData): Promise<CheckoutSession> {
    const ucpSessionId = uuidv7();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (data.expiresInHours ?? 6));

    const session = await prisma.checkoutSession.create({
      data: {
        ucpSessionId,
        shopId: data.shopId,
        shopwareCartToken: data.shopwareCartToken,
        platformProfileUrl: data.platformProfileUrl,
        platformId: data.platformId,
        platformCapabilities: data.platformCapabilities as Prisma.InputJsonValue,
        activeCapabilities: data.activeCapabilities as Prisma.InputJsonValue,
        activeExtensions: data.activeExtensions as Prisma.InputJsonValue,
        buyerEmail: data.buyerEmail,
        buyerPhone: data.buyerPhone,
        expiresAt,
      },
    });

    logger.info({ sessionId: ucpSessionId, shopId: data.shopId }, 'Created checkout session');
    return session;
  }

  /**
   * Find session by UCP session ID
   */
  async findByUcpId(ucpSessionId: string): Promise<CheckoutSession | null> {
    return prisma.checkoutSession.findUnique({
      where: { ucpSessionId },
    });
  }

  /**
   * Find session by internal ID
   */
  async findById(id: string): Promise<CheckoutSession | null> {
    return prisma.checkoutSession.findUnique({
      where: { id },
    });
  }

  /**
   * Find active session by Shopware cart token
   */
  async findByCartToken(shopId: string, cartToken: string): Promise<CheckoutSession | null> {
    return prisma.checkoutSession.findFirst({
      where: {
        shopId,
        shopwareCartToken: cartToken,
        status: { not: 'completed' },
        expiresAt: { gt: new Date() },
      },
    });
  }

  /**
   * Update session
   */
  async update(ucpSessionId: string, data: UpdateSessionData): Promise<CheckoutSession> {
    const session = await prisma.checkoutSession.update({
      where: { ucpSessionId },
      data: {
        status: data.status,
        shippingAddress: data.shippingAddress as Prisma.InputJsonValue,
        billingAddress: data.billingAddress as Prisma.InputJsonValue,
        selectedFulfillmentId: data.selectedFulfillmentId,
        appliedDiscountCodes: data.appliedDiscountCodes as Prisma.InputJsonValue,
        shopwareOrderId: data.shopwareOrderId,
        shopwareOrderNumber: data.shopwareOrderNumber,
        paymentHandlerId: data.paymentHandlerId,
        paymentTransactionId: data.paymentTransactionId,
        completedAt: data.completedAt,
      },
    });

    logger.debug(
      { sessionId: ucpSessionId, updates: Object.keys(data) },
      'Updated checkout session'
    );
    return session;
  }

  /**
   * Mark session as completed
   */
  async complete(
    ucpSessionId: string,
    orderId: string,
    orderNumber: string,
    transactionId?: string
  ): Promise<CheckoutSession> {
    return this.update(ucpSessionId, {
      status: 'completed',
      shopwareOrderId: orderId,
      shopwareOrderNumber: orderNumber,
      paymentTransactionId: transactionId,
      completedAt: new Date(),
    });
  }

  /**
   * Mark session as canceled
   */
  async cancel(ucpSessionId: string): Promise<CheckoutSession> {
    return this.update(ucpSessionId, {
      status: 'canceled',
    });
  }

  /**
   * Find sessions for a shop
   */
  async findByShop(
    shopId: string,
    options?: {
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<CheckoutSession[]> {
    return prisma.checkoutSession.findMany({
      where: {
        shopId,
        status: options?.status,
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
  }

  /**
   * Find multiple sessions with flexible filtering
   */
  async findMany(
    filter: {
      shopId?: string;
      status?: 'incomplete' | 'complete' | 'failed' | 'expired';
      createdAfter?: Date;
    },
    options?: {
      limit?: number;
      offset?: number;
      orderBy?: { createdAt: 'asc' | 'desc' };
    }
  ): Promise<CheckoutSession[]> {
    const whereClause: Prisma.CheckoutSessionWhereInput = {};

    if (filter.shopId) {
      whereClause.shopId = filter.shopId;
    }

    if (filter.status) {
      // Map external status names to internal values
      const statusMap: Record<string, string> = {
        incomplete: 'incomplete',
        complete: 'completed',
        failed: 'canceled',
        expired: 'expired',
      };
      whereClause.status = statusMap[filter.status] || filter.status;
    }

    if (filter.createdAfter) {
      whereClause.createdAt = { gte: filter.createdAfter };
    }

    return prisma.checkoutSession.findMany({
      where: whereClause,
      orderBy: { createdAt: options?.orderBy?.createdAt || 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
  }

  /**
   * Delete expired sessions
   */
  async deleteExpired(): Promise<number> {
    const result = await prisma.checkoutSession.deleteMany({
      where: {
        status: { in: ['incomplete', 'canceled'] },
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      logger.info({ count: result.count }, 'Deleted expired sessions');
    }

    return result.count;
  }

  /**
   * Get session statistics for a shop
   */
  async getStats(
    shopId: string,
    since?: Date
  ): Promise<{
    total: number;
    completed: number;
    canceled: number;
    incomplete: number;
    conversionRate: number;
  }> {
    const whereClause: Prisma.CheckoutSessionWhereInput = {
      shopId,
      ...(since && { createdAt: { gte: since } }),
    };

    const [total, completed, canceled, incomplete] = await Promise.all([
      prisma.checkoutSession.count({ where: whereClause }),
      prisma.checkoutSession.count({ where: { ...whereClause, status: 'completed' } }),
      prisma.checkoutSession.count({ where: { ...whereClause, status: 'canceled' } }),
      prisma.checkoutSession.count({ where: { ...whereClause, status: 'incomplete' } }),
    ]);

    const conversionRate = total > 0 ? (completed / total) * 100 : 0;

    return { total, completed, canceled, incomplete, conversionRate };
  }
}

export const sessionRepository = new SessionRepository();
