/**
 * Shop Repository
 * Handles database operations for shop credentials
 */

import { PrismaClient, type Shop } from '@prisma/client';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();

export interface CreateShopData {
  shopId: string;
  shopUrl: string;
  apiKey: string;
  secretKey: string;
  appName?: string;
  salesChannelId?: string;
  currencyId?: string;
  languageId?: string;
}

export interface UpdateShopData {
  apiKey?: string;
  secretKey?: string;
  salesChannelId?: string;
  currencyId?: string;
  languageId?: string;
  active?: boolean;
}

export class ShopRepository {
  /**
   * Create or update shop credentials
   */
  async upsert(data: CreateShopData): Promise<Shop> {
    const shop = await prisma.shop.upsert({
      where: { shopId: data.shopId },
      create: {
        shopId: data.shopId,
        shopUrl: data.shopUrl,
        apiKey: data.apiKey,
        secretKey: data.secretKey,
        appName: data.appName ?? 'UcpCommerce',
        salesChannelId: data.salesChannelId,
        currencyId: data.currencyId,
        languageId: data.languageId,
      },
      update: {
        shopUrl: data.shopUrl,
        apiKey: data.apiKey,
        secretKey: data.secretKey,
        salesChannelId: data.salesChannelId,
        currencyId: data.currencyId,
        languageId: data.languageId,
        active: true,
      },
    });

    logger.info({ shopId: data.shopId }, 'Shop credentials upserted');
    return shop;
  }

  /**
   * Find shop by Shopware shop ID
   */
  async findByShopId(shopId: string): Promise<Shop | null> {
    return prisma.shop.findUnique({
      where: { shopId },
    });
  }

  /**
   * Find active shop by URL
   */
  async findByUrl(shopUrl: string): Promise<Shop | null> {
    return prisma.shop.findFirst({
      where: {
        shopUrl,
        active: true,
      },
    });
  }

  /**
   * Update shop
   */
  async update(shopId: string, data: UpdateShopData): Promise<Shop> {
    return prisma.shop.update({
      where: { shopId },
      data,
    });
  }

  /**
   * Deactivate shop (soft delete)
   */
  async deactivate(shopId: string): Promise<Shop> {
    const shop = await prisma.shop.update({
      where: { shopId },
      data: { active: false },
    });

    logger.info({ shopId }, 'Shop deactivated');
    return shop;
  }

  /**
   * Get all active shops
   */
  async findAllActive(): Promise<Shop[]> {
    return prisma.shop.findMany({
      where: { active: true },
    });
  }

  /**
   * Get the first registered shop (for admin dashboard fallback)
   */
  async findFirst(): Promise<Shop | null> {
    return prisma.shop.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Delete shop permanently
   */
  async delete(shopId: string): Promise<void> {
    await prisma.shop.delete({
      where: { shopId },
    });

    logger.info({ shopId }, 'Shop deleted');
  }
}

export const shopRepository = new ShopRepository();
