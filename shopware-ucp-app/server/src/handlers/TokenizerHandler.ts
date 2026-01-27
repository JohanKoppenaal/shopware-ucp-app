/**
 * Business Tokenizer Handler
 * Handles pre-tokenized card payments from various PSPs
 */

import type { CheckoutSession as DbCheckoutSession } from '@prisma/client';
import type { PaymentHandler, PaymentData, PaymentResult } from '../types/ucp.js';
import { BasePaymentHandler } from './BasePaymentHandler.js';

type PSPType = 'mollie' | 'stripe' | 'adyen' | 'mock';

interface PSPConfig {
  apiKey: string;
  apiUrl: string;
  webhookSecret?: string;
}

export class TokenizerHandler extends BasePaymentHandler {
  readonly id = 'business-tokenizer';
  readonly name = 'dev.ucp.business_tokenizer';

  private pspType: PSPType;
  private pspConfig: PSPConfig;

  constructor() {
    super();
    this.pspType = (process.env['PSP_TYPE'] as PSPType) ?? 'mock';
    this.pspConfig = this.loadPSPConfig();
  }

  async processPayment(
    session: DbCheckoutSession,
    paymentData: PaymentData
  ): Promise<PaymentResult> {
    this.logPaymentAttempt(session, paymentData, { psp: this.pspType });

    // Validate payment data
    const validation = this.validatePaymentData(paymentData);
    if (!validation.valid) {
      return this.createFailedResult('validation_error', validation.error!);
    }

    try {
      const token = paymentData.credential.token;

      // Route to appropriate PSP processor
      const result = await this.routeToPSP(token, paymentData, session);

      this.logPaymentResult(session, result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ error: errorMessage, sessionId: session.ucpSessionId }, 'Payment processing failed');
      return this.createFailedResult('processing_error', errorMessage);
    }
  }

  getHandlerConfig(): PaymentHandler {
    return {
      id: this.id,
      name: this.name,
      version: this.ucpVersion,
      spec: 'https://ucp.dev/handlers/business-tokenizer',
      config_schema: 'https://ucp.dev/schemas/handlers/business-tokenizer/config.json',
      instrument_schemas: ['https://ucp.dev/schemas/handlers/business-tokenizer/card.json'],
      config: {
        psp_type: this.pspType,
        public_key: process.env['TOKENIZER_PUBLIC_KEY'] ?? '',
        tokenization_url: this.getTokenizationUrl(),
        supported_brands: ['visa', 'mastercard', 'amex'],
        supports_3ds: true,
      },
    };
  }

  /**
   * Route payment to the configured PSP
   */
  private async routeToPSP(
    token: string,
    paymentData: PaymentData,
    session: DbCheckoutSession
  ): Promise<PaymentResult> {
    switch (this.pspType) {
      case 'mollie':
        return this.processMollie(token, paymentData, session);
      case 'stripe':
        return this.processStripe(token, paymentData, session);
      case 'adyen':
        return this.processAdyen(token, paymentData, session);
      case 'mock':
      default:
        return this.processMock(token, paymentData);
    }
  }

  /**
   * Process payment with Mollie
   */
  private async processMollie(
    token: string,
    paymentData: PaymentData,
    _session: DbCheckoutSession
  ): Promise<PaymentResult> {
    this.logger.debug({ tokenPrefix: token.substring(0, 10) }, 'Processing with Mollie');

    // In production, this would call the Mollie API:
    // POST https://api.mollie.com/v2/payments
    // with the card token and amount

    // Simulate 3DS challenge for tokens containing '3ds'
    if (token.includes('3ds') || token.includes('challenge')) {
      return this.createRequiresActionResult(
        `https://www.mollie.com/checkout/select-issuer/creditcard/${token}`,
        `tr_${Date.now()}`
      );
    }

    // Simulate failure for tokens containing 'fail'
    if (token.includes('fail') || token.includes('decline')) {
      return this.createFailedResult('card_declined', 'The card was declined by the issuer');
    }

    // Simulate insufficient funds
    if (token.includes('insufficient')) {
      return this.createFailedResult('insufficient_funds', 'Insufficient funds on the card');
    }

    // Success
    return this.createSuccessResult(`tr_${Date.now()}`);
  }

  /**
   * Process payment with Stripe
   */
  private async processStripe(
    token: string,
    paymentData: PaymentData,
    _session: DbCheckoutSession
  ): Promise<PaymentResult> {
    this.logger.debug({ tokenPrefix: token.substring(0, 10) }, 'Processing with Stripe');

    // In production, this would:
    // 1. Create a PaymentIntent with the token
    // 2. Confirm the PaymentIntent
    // 3. Handle 3DS authentication if required

    // Simulate 3DS challenge
    if (token.includes('3ds') || token.includes('authenticate')) {
      return this.createRequiresActionResult(
        `https://hooks.stripe.com/3d_secure_2/authenticate/${token}`,
        `pi_${Date.now()}`
      );
    }

    // Simulate failures
    if (token.includes('fail') || token.includes('decline')) {
      return this.createFailedResult('card_declined', 'Your card was declined');
    }

    // Success
    return this.createSuccessResult(`pi_${Date.now()}`);
  }

  /**
   * Process payment with Adyen
   */
  private async processAdyen(
    token: string,
    paymentData: PaymentData,
    _session: DbCheckoutSession
  ): Promise<PaymentResult> {
    this.logger.debug({ tokenPrefix: token.substring(0, 10) }, 'Processing with Adyen');

    // In production, this would:
    // 1. Create a payment request with the token
    // 2. Handle any required actions (3DS, redirect)
    // 3. Return the result

    // Simulate 3DS challenge
    if (token.includes('3ds') || token.includes('redirect')) {
      return this.createRequiresActionResult(
        `https://checkoutshopper-test.adyen.com/checkoutshopper/threeDS2.shtml?token=${token}`,
        `adyen_${Date.now()}`
      );
    }

    // Simulate failures
    if (token.includes('fail')) {
      return this.createFailedResult('refused', 'Payment was refused by Adyen');
    }

    // Success
    return this.createSuccessResult(`adyen_${Date.now()}`);
  }

  /**
   * Process with mock PSP (for development/testing)
   */
  private async processMock(
    token: string,
    _paymentData: PaymentData
  ): Promise<PaymentResult> {
    this.logger.debug({ token }, 'Processing with mock PSP');

    // Simulate various scenarios based on token content
    if (token.includes('3ds') || token.includes('challenge')) {
      return this.createRequiresActionResult(
        `http://localhost:3000/mock-3ds?token=${token}`,
        `mock_${Date.now()}`
      );
    }

    if (token.includes('fail') || token.includes('decline')) {
      return this.createFailedResult('card_declined', 'Mock: Card declined');
    }

    if (token.includes('pending')) {
      return {
        success: false,
        status: 'pending',
        transaction_id: `mock_pending_${Date.now()}`,
      };
    }

    // Default: success
    return this.createSuccessResult(`mock_${Date.now()}`);
  }

  /**
   * Load PSP configuration from environment
   */
  private loadPSPConfig(): PSPConfig {
    switch (this.pspType) {
      case 'mollie':
        return {
          apiKey: process.env['MOLLIE_API_KEY'] ?? '',
          apiUrl: process.env['MOLLIE_API_URL'] ?? 'https://api.mollie.com/v2',
          webhookSecret: process.env['MOLLIE_WEBHOOK_SECRET'],
        };
      case 'stripe':
        return {
          apiKey: process.env['STRIPE_SECRET_KEY'] ?? '',
          apiUrl: 'https://api.stripe.com/v1',
          webhookSecret: process.env['STRIPE_WEBHOOK_SECRET'],
        };
      case 'adyen':
        return {
          apiKey: process.env['ADYEN_API_KEY'] ?? '',
          apiUrl: process.env['ADYEN_API_URL'] ?? 'https://checkout-test.adyen.com/v70',
          webhookSecret: process.env['ADYEN_HMAC_KEY'],
        };
      default:
        return {
          apiKey: 'mock-key',
          apiUrl: 'http://localhost:3000/mock-psp',
        };
    }
  }

  /**
   * Get the tokenization URL for the configured PSP
   */
  private getTokenizationUrl(): string {
    switch (this.pspType) {
      case 'mollie':
        return 'https://js.mollie.com/v1/';
      case 'stripe':
        return 'https://js.stripe.com/v3/';
      case 'adyen':
        return 'https://checkoutshopper-live.adyen.com/checkoutshopper/sdk/';
      default:
        return 'http://localhost:3000/mock-tokenizer.js';
    }
  }
}

export const tokenizerHandler = new TokenizerHandler();
