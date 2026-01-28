/**
 * Payment Handler Registry
 * Manages payment handlers for UCP checkout
 */

import type { CheckoutSession as DbCheckoutSession } from '@prisma/client';
import type { PaymentHandler, PaymentData, PaymentResult } from '../types/ucp.js';
import { GooglePayHandler } from '../handlers/GooglePayHandler.js';
import { TokenizerHandler } from '../handlers/TokenizerHandler.js';
import { MollieHandler } from '../handlers/MollieHandler.js';
import { logger } from '../utils/logger.js';

/**
 * Base interface for payment handler processors
 */
export interface PaymentHandlerProcessor {
  id: string;
  name: string;
  canHandle(handlerId: string): boolean;
  processPayment(session: DbCheckoutSession, paymentData: PaymentData): Promise<PaymentResult>;
  getHandlerConfig(): PaymentHandler;
  isConfigured?(): boolean;
}

/**
 * Handler configuration stored per shop
 */
export interface HandlerConfiguration {
  handlerId: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Shop handler settings
 */
export interface ShopHandlerSettings {
  shopId: string;
  handlers: HandlerConfiguration[];
}

/**
 * Payment Handler Registry
 */
export class PaymentHandlerRegistry {
  private handlers: Map<string, PaymentHandlerProcessor> = new Map();
  private shopConfigurations: Map<string, ShopHandlerSettings> = new Map();

  constructor() {
    // Register default handlers
    this.registerHandler(new GooglePayHandler());
    this.registerHandler(new TokenizerHandler());
    this.registerHandler(new MollieHandler());
  }

  /**
   * Register a payment handler
   */
  registerHandler(handler: PaymentHandlerProcessor): void {
    this.handlers.set(handler.id, handler);
    logger.info({ handlerId: handler.id, handlerName: handler.name }, 'Payment handler registered');
  }

  /**
   * Unregister a payment handler
   */
  unregisterHandler(handlerId: string): boolean {
    const deleted = this.handlers.delete(handlerId);
    if (deleted) {
      logger.info({ handlerId }, 'Payment handler unregistered');
    }
    return deleted;
  }

  /**
   * Get handler by ID
   */
  getHandler(handlerId: string): PaymentHandlerProcessor | undefined {
    // Check direct match first
    const directMatch = this.handlers.get(handlerId);
    if (directMatch) {
      return directMatch;
    }

    // Check if any handler can handle this ID
    for (const handler of this.handlers.values()) {
      if (handler.canHandle(handlerId)) {
        return handler;
      }
    }

    return undefined;
  }

  /**
   * Check if a handler exists
   */
  hasHandler(handlerId: string): boolean {
    return this.getHandler(handlerId) !== undefined;
  }

  /**
   * Get all available handlers for a shop
   */
  async getHandlersForShop(shopId: string): Promise<PaymentHandler[]> {
    const handlers: PaymentHandler[] = [];
    const shopConfig = this.shopConfigurations.get(shopId);

    // If shop has specific configuration, use it
    if (shopConfig) {
      for (const handlerConfig of shopConfig.handlers) {
        if (handlerConfig.enabled) {
          const handler = this.handlers.get(handlerConfig.handlerId);
          if (handler) {
            handlers.push(handler.getHandlerConfig());
          }
        }
      }
      return handlers;
    }

    // Default behavior: return all configured handlers
    // Google Pay - only if merchant ID is configured
    if (process.env['GOOGLE_PAY_MERCHANT_ID']) {
      const googlePay = this.handlers.get('google-pay');
      if (googlePay) {
        handlers.push(googlePay.getHandlerConfig());
      }
    }

    // Business Tokenizer - always available
    const tokenizer = this.handlers.get('business-tokenizer');
    if (tokenizer) {
      handlers.push(tokenizer.getHandlerConfig());
    }

    // Mollie - if API key is configured
    const mollie = this.handlers.get('mollie') as MollieHandler | undefined;
    if (mollie?.isConfigured?.()) {
      handlers.push(mollie.getHandlerConfig());
    }

    return handlers;
  }

  /**
   * Configure handlers for a specific shop
   */
  configureShopHandlers(shopId: string, configurations: HandlerConfiguration[]): void {
    this.shopConfigurations.set(shopId, {
      shopId,
      handlers: configurations,
    });
    logger.info({ shopId, handlerCount: configurations.length }, 'Shop handlers configured');
  }

  /**
   * Get shop handler configuration
   */
  getShopConfiguration(shopId: string): ShopHandlerSettings | undefined {
    return this.shopConfigurations.get(shopId);
  }

  /**
   * Enable a handler for a shop
   */
  enableHandlerForShop(shopId: string, handlerId: string, config?: Record<string, unknown>): void {
    let shopConfig = this.shopConfigurations.get(shopId);
    if (!shopConfig) {
      shopConfig = { shopId, handlers: [] };
      this.shopConfigurations.set(shopId, shopConfig);
    }

    const existingIndex = shopConfig.handlers.findIndex((h) => h.handlerId === handlerId);
    const handlerConfig: HandlerConfiguration = {
      handlerId,
      enabled: true,
      config: config ?? {},
      createdAt: existingIndex >= 0 ? shopConfig.handlers[existingIndex]!.createdAt : new Date(),
      updatedAt: new Date(),
    };

    if (existingIndex >= 0) {
      shopConfig.handlers[existingIndex] = handlerConfig;
    } else {
      shopConfig.handlers.push(handlerConfig);
    }

    logger.info({ shopId, handlerId }, 'Handler enabled for shop');
  }

  /**
   * Disable a handler for a shop
   */
  disableHandlerForShop(shopId: string, handlerId: string): void {
    const shopConfig = this.shopConfigurations.get(shopId);
    if (!shopConfig) return;

    const handler = shopConfig.handlers.find((h) => h.handlerId === handlerId);
    if (handler) {
      handler.enabled = false;
      handler.updatedAt = new Date();
      logger.info({ shopId, handlerId }, 'Handler disabled for shop');
    }
  }

  /**
   * Test handler connection
   */
  async testHandlerConnection(handlerId: string): Promise<{ success: boolean; message: string }> {
    const handler = this.handlers.get(handlerId);
    if (!handler) {
      return { success: false, message: `Handler "${handlerId}" not found` };
    }

    // Check if handler has configuration check
    if ('isConfigured' in handler && typeof handler.isConfigured === 'function') {
      const isConfigured = handler.isConfigured();
      if (!isConfigured) {
        return { success: false, message: `Handler "${handlerId}" is not properly configured` };
      }
    }

    // For now, just check if handler is registered and configured
    return { success: true, message: `Handler "${handlerId}" is ready` };
  }

  /**
   * Get all available handler types (for admin UI)
   */
  getAvailableHandlerTypes(): Array<{
    id: string;
    name: string;
    configured: boolean;
    description: string;
  }> {
    const handlerDescriptions: Record<string, string> = {
      'google-pay': 'Accept payments via Google Pay wallet',
      'business-tokenizer': 'Process pre-tokenized card payments via PSP',
      mollie: 'Accept payments via Mollie (iDEAL, Cards, Bancontact, etc.)',
    };

    return Array.from(this.handlers.entries()).map(([id, handler]) => ({
      id,
      name: handler.name,
      configured:
        'isConfigured' in handler && typeof handler.isConfigured === 'function'
          ? handler.isConfigured()
          : true,
      description: handlerDescriptions[id] ?? 'Payment handler',
    }));
  }

  /**
   * Get all registered handler IDs
   */
  getRegisteredHandlerIds(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get handler configuration by ID
   */
  getHandlerConfig(handlerId: string): PaymentHandler | undefined {
    const handler = this.getHandler(handlerId);
    return handler?.getHandlerConfig();
  }

  /**
   * Validate that a handler ID is supported
   */
  validateHandlerId(handlerId: string): { valid: boolean; error?: string } {
    if (!handlerId) {
      return { valid: false, error: 'Handler ID is required' };
    }

    if (!this.hasHandler(handlerId)) {
      return { valid: false, error: `Handler "${handlerId}" is not supported` };
    }

    return { valid: true };
  }
}

export const paymentHandlerRegistry = new PaymentHandlerRegistry();
