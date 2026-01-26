/**
 * Payment Handler Registry
 * Manages payment handlers for UCP checkout
 */

import type { CheckoutSession as DbCheckoutSession } from '@prisma/client';
import type { PaymentHandler, PaymentData, PaymentResult } from '../types/ucp.js';
import { logger } from '../utils/logger.js';

const UCP_VERSION = process.env['UCP_VERSION'] ?? '2026-01-11';

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
 * Google Pay Handler
 */
class GooglePayHandler implements PaymentHandlerProcessor {
  id = 'google-pay';
  name = 'com.google.pay';

  canHandle(handlerId: string): boolean {
    return handlerId === this.id || handlerId === 'com.google.pay';
  }

  async processPayment(
    _session: DbCheckoutSession,
    paymentData: PaymentData
  ): Promise<PaymentResult> {
    logger.info({ handlerId: this.id }, 'Processing Google Pay payment');

    // In production, this would:
    // 1. Decrypt the Google Pay token
    // 2. Extract the network token (DPAN/FPAN)
    // 3. Forward to the configured PSP
    // 4. Return the result

    // For now, simulate successful payment
    const token = paymentData.credential.token;

    if (!token) {
      return {
        success: false,
        status: 'failed',
        error: {
          code: 'missing_token',
          message: 'Google Pay token is required',
        },
      };
    }

    // Simulate PSP call
    return {
      success: true,
      status: 'captured',
      transaction_id: `gpay_${Date.now()}`,
    };
  }

  getHandlerConfig(): PaymentHandler {
    return {
      id: this.id,
      name: this.name,
      version: UCP_VERSION,
      spec: 'https://ucp.dev/handlers/google-pay',
      config_schema: 'https://ucp.dev/schemas/handlers/google-pay/config.json',
      instrument_schemas: ['https://ucp.dev/schemas/handlers/google-pay/instrument.json'],
      config: {
        merchant_id: process.env['GOOGLE_PAY_MERCHANT_ID'] ?? '',
        merchant_name: process.env['GOOGLE_PAY_MERCHANT_NAME'] ?? '',
        environment: process.env['GOOGLE_PAY_ENVIRONMENT'] ?? 'TEST',
        allowed_card_networks: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'],
        allowed_auth_methods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
      },
    };
  }
}

/**
 * Business Tokenizer Handler (for PSP integrations)
 */
class BusinessTokenizerHandler implements PaymentHandlerProcessor {
  id = 'business-tokenizer';
  name = 'dev.ucp.business_tokenizer';

  canHandle(handlerId: string): boolean {
    return handlerId === this.id || handlerId === 'dev.ucp.business_tokenizer';
  }

  async processPayment(
    _session: DbCheckoutSession,
    paymentData: PaymentData
  ): Promise<PaymentResult> {
    logger.info({ handlerId: this.id }, 'Processing tokenized payment');

    const token = paymentData.credential.token;
    const pspType = process.env['PSP_TYPE'] ?? 'mollie';

    if (!token) {
      return {
        success: false,
        status: 'failed',
        error: {
          code: 'missing_token',
          message: 'Payment token is required',
        },
      };
    }

    // Route to appropriate PSP
    switch (pspType) {
      case 'mollie':
        return this.processMollie(token, paymentData);
      case 'stripe':
        return this.processStripe(token, paymentData);
      case 'adyen':
        return this.processAdyen(token, paymentData);
      default:
        return {
          success: false,
          status: 'failed',
          error: {
            code: 'unsupported_psp',
            message: `PSP ${pspType} is not supported`,
          },
        };
    }
  }

  private async processMollie(
    token: string,
    _paymentData: PaymentData
  ): Promise<PaymentResult> {
    // In production: call Mollie API
    logger.debug({ token: token.substring(0, 10) + '...' }, 'Processing with Mollie');

    // Simulate 3DS challenge for certain tokens
    if (token.includes('3ds')) {
      return {
        success: false,
        status: 'requires_action',
        action_url: 'https://mollie.com/checkout/3ds/challenge',
      };
    }

    return {
      success: true,
      status: 'captured',
      transaction_id: `mol_${Date.now()}`,
    };
  }

  private async processStripe(
    token: string,
    _paymentData: PaymentData
  ): Promise<PaymentResult> {
    logger.debug({ token: token.substring(0, 10) + '...' }, 'Processing with Stripe');

    return {
      success: true,
      status: 'captured',
      transaction_id: `pi_${Date.now()}`,
    };
  }

  private async processAdyen(
    token: string,
    _paymentData: PaymentData
  ): Promise<PaymentResult> {
    logger.debug({ token: token.substring(0, 10) + '...' }, 'Processing with Adyen');

    return {
      success: true,
      status: 'captured',
      transaction_id: `adyen_${Date.now()}`,
    };
  }

  getHandlerConfig(): PaymentHandler {
    const pspType = process.env['PSP_TYPE'] ?? 'mollie';

    return {
      id: this.id,
      name: this.name,
      version: UCP_VERSION,
      spec: 'https://ucp.dev/handlers/business-tokenizer',
      config_schema: 'https://ucp.dev/schemas/handlers/business-tokenizer/config.json',
      instrument_schemas: ['https://ucp.dev/schemas/handlers/business-tokenizer/card.json'],
      config: {
        psp_type: pspType,
        public_key: process.env['TOKENIZER_PUBLIC_KEY'] ?? '',
        tokenization_url: this.getTokenizationUrl(pspType),
        supported_brands: ['visa', 'mastercard', 'amex'],
      },
    };
  }

  private getTokenizationUrl(pspType: string): string {
    switch (pspType) {
      case 'mollie':
        return 'https://js.mollie.com/v1/';
      case 'stripe':
        return 'https://js.stripe.com/v3/';
      case 'adyen':
        return 'https://checkoutshopper-live.adyen.com/checkoutshopper/sdk/';
      default:
        return '';
    }
  }
}

/**
 * Payment Handler Registry
 */
export class PaymentHandlerRegistry {
  private handlers: Map<string, PaymentHandlerProcessor> = new Map();

  constructor() {
    // Register default handlers
    this.registerHandler(new GooglePayHandler());
    this.registerHandler(new BusinessTokenizerHandler());
  }

  /**
   * Register a payment handler
   */
  registerHandler(handler: PaymentHandlerProcessor): void {
    this.handlers.set(handler.id, handler);
    logger.info({ handlerId: handler.id, handlerName: handler.name }, 'Payment handler registered');
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
   * Get all available handlers for a shop
   */
  async getHandlersForShop(_shopId: string): Promise<PaymentHandler[]> {
    // In production, this would check shop configuration
    // For now, return all enabled handlers
    const handlers: PaymentHandler[] = [];

    if (process.env['GOOGLE_PAY_MERCHANT_ID']) {
      const googlePay = this.handlers.get('google-pay');
      if (googlePay) {
        handlers.push(googlePay.getHandlerConfig());
      }
    }

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
}

export const paymentHandlerRegistry = new PaymentHandlerRegistry();
