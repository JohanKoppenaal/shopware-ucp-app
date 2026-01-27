/**
 * Profile Builder Service
 * Builds the UCP profile for /.well-known/ucp endpoint
 */

import type { UcpProfile, UcpCapability, PaymentHandler } from '../types/ucp.js';
import { paymentHandlerRegistry } from './PaymentHandlerRegistry.js';
import { keyManager } from './KeyManager.js';
import { logger } from '../utils/logger.js';

const UCP_VERSION = process.env['UCP_VERSION'] ?? '2026-01-11';
const UCP_SERVER_URL = process.env['UCP_SERVER_URL'] ?? 'http://localhost:3000';

interface ProfileOptions {
  shopId?: string;
  enabledCapabilities?: string[];
  enabledExtensions?: string[];
  enableMcp?: boolean;
}

export class ProfileBuilder {
  private cachedProfile: UcpProfile | null = null;
  private cacheExpiresAt: Date | null = null;
  private cacheTtlMinutes: number;

  constructor(cacheTtlMinutes = 5) {
    this.cacheTtlMinutes = cacheTtlMinutes;
  }

  /**
   * Build or return cached UCP profile
   */
  async buildProfile(options: ProfileOptions = {}): Promise<UcpProfile> {
    // Check cache
    if (this.cachedProfile && this.cacheExpiresAt && this.cacheExpiresAt > new Date()) {
      return this.cachedProfile;
    }

    logger.debug('Building UCP profile');

    // Build capabilities
    const capabilities = this.buildCapabilities(
      options.enabledCapabilities,
      options.enabledExtensions
    );

    // Build payment handlers
    const paymentHandlers = await this.buildPaymentHandlers(options.shopId);

    // Get signing keys
    const signingKeys = await keyManager.getPublicKeys();

    const profile: UcpProfile = {
      ucp: {
        version: UCP_VERSION,
        services: {
          'dev.ucp.shopping': {
            version: UCP_VERSION,
            spec: 'https://ucp.dev/specification/overview',
            rest: {
              schema: 'https://ucp.dev/services/shopping/rest.openapi.json',
              endpoint: `${UCP_SERVER_URL}/api/v1`,
            },
            ...(options.enableMcp !== false && {
              mcp: {
                schema: `${UCP_SERVER_URL}/mcp/openrpc`,
                endpoint: `${UCP_SERVER_URL}/mcp`,
                streaming_endpoint: `${UCP_SERVER_URL}/mcp/sse`,
                protocol_version: '2024-11-05',
              },
            }),
          },
        },
        capabilities,
      },
      payment: {
        handlers: paymentHandlers,
      },
      signing_keys: signingKeys,
    };

    // Cache profile
    this.cachedProfile = profile;
    this.cacheExpiresAt = new Date(Date.now() + this.cacheTtlMinutes * 60 * 1000);

    return profile;
  }

  /**
   * Build capabilities array
   */
  private buildCapabilities(
    enabledCapabilities?: string[],
    enabledExtensions?: string[]
  ): UcpCapability[] {
    const capabilities: UcpCapability[] = [];

    // Core checkout capability (always enabled)
    const checkoutEnabled =
      !enabledCapabilities || enabledCapabilities.includes('dev.ucp.shopping.checkout');
    if (checkoutEnabled) {
      capabilities.push({
        name: 'dev.ucp.shopping.checkout',
        version: UCP_VERSION,
        spec: 'https://ucp.dev/specification/checkout',
        schema: 'https://ucp.dev/schemas/shopping/checkout.json',
      });
    }

    // Order capability
    const orderEnabled =
      !enabledCapabilities || enabledCapabilities.includes('dev.ucp.shopping.order');
    if (orderEnabled) {
      capabilities.push({
        name: 'dev.ucp.shopping.order',
        version: UCP_VERSION,
        spec: 'https://ucp.dev/specification/order',
        schema: 'https://ucp.dev/schemas/shopping/order.json',
      });
    }

    // Fulfillment extension
    const fulfillmentEnabled =
      !enabledExtensions || enabledExtensions.includes('fulfillment');
    if (checkoutEnabled && fulfillmentEnabled) {
      capabilities.push({
        name: 'dev.ucp.shopping.checkout.fulfillment',
        version: UCP_VERSION,
        spec: 'https://ucp.dev/specification/fulfillment',
        schema: 'https://ucp.dev/schemas/shopping/fulfillment.json',
        extends: 'dev.ucp.shopping.checkout',
      });
    }

    // Discounts extension
    const discountsEnabled =
      !enabledExtensions || enabledExtensions.includes('discounts');
    if (checkoutEnabled && discountsEnabled) {
      capabilities.push({
        name: 'dev.ucp.shopping.checkout.discounts',
        version: UCP_VERSION,
        spec: 'https://ucp.dev/specification/discounts',
        schema: 'https://ucp.dev/schemas/shopping/discounts.json',
        extends: 'dev.ucp.shopping.checkout',
      });
    }

    return capabilities;
  }

  /**
   * Build payment handlers
   */
  private async buildPaymentHandlers(shopId?: string): Promise<PaymentHandler[]> {
    if (shopId) {
      return paymentHandlerRegistry.getHandlersForShop(shopId);
    }

    // Return default handlers
    return paymentHandlerRegistry.getHandlersForShop('default');
  }

  /**
   * Invalidate cache
   */
  invalidateCache(): void {
    this.cachedProfile = null;
    this.cacheExpiresAt = null;
    logger.debug('Profile cache invalidated');
  }
}

export const profileBuilder = new ProfileBuilder();
