/**
 * Payment Handler Registry
 * Manages payment handlers for UCP checkout
 */

import type { CheckoutSession as DbCheckoutSession } from '@prisma/client';
import type { PaymentHandler, PaymentData, PaymentResult } from '../types/ucp.js';
import { GooglePayHandler } from '../handlers/GooglePayHandler.js';
import { TokenizerHandler } from '../handlers/TokenizerHandler.js';
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
}

/**
 * Payment Handler Registry
 */
export class PaymentHandlerRegistry {
  private handlers: Map<string, PaymentHandlerProcessor> = new Map();

  constructor() {
    // Register default handlers
    this.registerHandler(new GooglePayHandler());
    this.registerHandler(new TokenizerHandler());
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
  async getHandlersForShop(_shopId: string): Promise<PaymentHandler[]> {
    // In production, this would check shop configuration
    // For now, return all enabled handlers based on environment
    const handlers: PaymentHandler[] = [];

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

    return handlers;
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
