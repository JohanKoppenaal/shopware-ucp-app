/**
 * Mollie Payment Handler
 * Integrates with Shopware's Mollie plugin and Mollie API
 */

import type { CheckoutSession as DbCheckoutSession } from '@prisma/client';
import type { PaymentHandler, PaymentData, PaymentResult } from '../types/ucp.js';
import { BasePaymentHandler } from './BasePaymentHandler.js';

interface MollieConfig {
  apiKey: string;
  profileId?: string;
  testMode: boolean;
  webhookUrl?: string;
}

interface MolliePaymentResponse {
  id: string;
  status: string;
  _links: {
    checkout?: { href: string };
    dashboard: { href: string };
  };
}

export class MollieHandler extends BasePaymentHandler {
  readonly id = 'mollie';
  readonly name = 'com.mollie.payments';

  private config: MollieConfig;
  private baseUrl: string;

  constructor() {
    super();
    this.config = this.loadConfig();
    this.baseUrl = this.config.testMode
      ? 'https://api.mollie.com/v2'
      : 'https://api.mollie.com/v2';
  }

  async processPayment(
    session: DbCheckoutSession,
    paymentData: PaymentData
  ): Promise<PaymentResult> {
    this.logPaymentAttempt(session, paymentData, { method: paymentData.type });

    // Validate payment data
    const validation = this.validateMolliePaymentData(paymentData);
    if (!validation.valid) {
      return this.createFailedResult('validation_error', validation.error!);
    }

    try {
      // Determine the Mollie payment method
      const mollieMethod = this.mapPaymentMethod(paymentData);

      // Create Mollie payment
      const molliePayment = await this.createMolliePayment(session, paymentData, mollieMethod);

      // Check if redirect is required
      if (molliePayment._links.checkout?.href) {
        // Redirect flow (iDEAL, Bancontact, etc.)
        return this.createRequiresActionResult(
          molliePayment._links.checkout.href,
          molliePayment.id
        );
      }

      // Direct payment (card with 3DS already completed)
      if (molliePayment.status === 'paid') {
        return this.createSuccessResult(molliePayment.id);
      }

      if (molliePayment.status === 'pending') {
        return {
          success: false,
          status: 'pending',
          transaction_id: molliePayment.id,
        };
      }

      if (molliePayment.status === 'failed' || molliePayment.status === 'canceled') {
        return this.createFailedResult('payment_failed', `Payment ${molliePayment.status}`);
      }

      // Default to pending for other statuses
      return {
        success: false,
        status: 'pending',
        transaction_id: molliePayment.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ error: errorMessage, sessionId: session.ucpSessionId }, 'Mollie payment failed');
      return this.createFailedResult('mollie_error', errorMessage);
    }
  }

  getHandlerConfig(): PaymentHandler {
    return {
      id: this.id,
      name: this.name,
      version: this.ucpVersion,
      spec: 'https://ucp.dev/handlers/mollie',
      config_schema: 'https://ucp.dev/schemas/handlers/mollie/config.json',
      instrument_schemas: [
        'https://ucp.dev/schemas/handlers/mollie/ideal.json',
        'https://ucp.dev/schemas/handlers/mollie/bancontact.json',
        'https://ucp.dev/schemas/handlers/mollie/card.json',
      ],
      config: {
        profile_id: this.config.profileId ?? '',
        test_mode: this.config.testMode,
        supported_methods: this.getSupportedMethods(),
        countries: ['NL', 'BE', 'DE', 'AT', 'FR'],
      },
    };
  }

  /**
   * Validate Mollie-specific payment data
   */
  private validateMolliePaymentData(paymentData: PaymentData): { valid: boolean; error?: string } {
    // For Mollie, we can accept either a token or a method selection
    if (!paymentData.type && !paymentData.credential?.token) {
      return { valid: false, error: 'Payment method or credential is required' };
    }

    return { valid: true };
  }

  /**
   * Map UCP payment type to Mollie method
   */
  private mapPaymentMethod(paymentData: PaymentData): string {
    const methodMap: Record<string, string> = {
      card: 'creditcard',
      ideal: 'ideal',
      bancontact: 'bancontact',
      paypal: 'paypal',
      applepay: 'applepay',
      googlepay: 'googlepay',
      klarna: 'klarnapaylater',
      eps: 'eps',
      giropay: 'giropay',
      sofort: 'sofort',
    };

    const type = paymentData.type?.toLowerCase() ?? 'creditcard';
    return methodMap[type] ?? type;
  }

  /**
   * Create a payment in Mollie
   */
  private async createMolliePayment(
    session: DbCheckoutSession,
    paymentData: PaymentData,
    method: string
  ): Promise<MolliePaymentResponse> {
    // In development/mock mode, simulate the response
    if (process.env['USE_MOCK_SHOPWARE'] === 'true' || process.env['NODE_ENV'] === 'development') {
      return this.createMockPayment(session, method);
    }

    const amount = this.getSessionAmount(session);

    const response = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: {
          currency: 'EUR',
          value: (amount / 100).toFixed(2), // Mollie expects decimal format
        },
        description: `Order for session ${session.ucpSessionId}`,
        redirectUrl: `${process.env['UCP_SERVER_URL']}/checkout/return?session=${session.ucpSessionId}`,
        webhookUrl: this.config.webhookUrl ?? `${process.env['UCP_SERVER_URL']}/webhooks/mollie`,
        method,
        metadata: {
          ucp_session_id: session.ucpSessionId,
          shop_id: session.shopId,
        },
        // Include card token if provided
        ...(paymentData.credential?.token && {
          cardToken: paymentData.credential.token,
        }),
        // Include iDEAL issuer if provided
        ...(paymentData.credential?.issuer && {
          issuer: paymentData.credential.issuer,
        }),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Mollie API error: ${response.status} - ${errorBody}`);
    }

    return response.json() as Promise<MolliePaymentResponse>;
  }

  /**
   * Create a mock Mollie payment for development
   */
  private createMockPayment(session: DbCheckoutSession, method: string): MolliePaymentResponse {
    const paymentId = `tr_mock_${Date.now()}`;

    // Simulate different behaviors based on method
    if (method === 'ideal' || method === 'bancontact') {
      // These always require redirect
      return {
        id: paymentId,
        status: 'open',
        _links: {
          checkout: { href: `http://localhost:3000/mock-mollie/checkout/${paymentId}` },
          dashboard: { href: `https://www.mollie.com/dashboard/payments/${paymentId}` },
        },
      };
    }

    if (method === 'creditcard') {
      // Cards might need 3DS
      return {
        id: paymentId,
        status: 'open',
        _links: {
          checkout: { href: `http://localhost:3000/mock-mollie/3ds/${paymentId}` },
          dashboard: { href: `https://www.mollie.com/dashboard/payments/${paymentId}` },
        },
      };
    }

    // Default: direct payment
    return {
      id: paymentId,
      status: 'paid',
      _links: {
        dashboard: { href: `https://www.mollie.com/dashboard/payments/${paymentId}` },
      },
    };
  }

  /**
   * Get session amount in cents
   */
  private getSessionAmount(session: DbCheckoutSession): number {
    // In a real implementation, this would calculate from the cart
    // For now, return a placeholder
    return 1000; // 10.00 EUR
  }

  /**
   * Get supported payment methods
   */
  private getSupportedMethods(): string[] {
    return [
      'ideal',
      'creditcard',
      'bancontact',
      'paypal',
      'applepay',
      'googlepay',
      'klarnapaylater',
      'eps',
      'giropay',
      'sofort',
    ];
  }

  /**
   * Load Mollie configuration from environment
   */
  private loadConfig(): MollieConfig {
    return {
      apiKey: process.env['MOLLIE_API_KEY'] ?? '',
      profileId: process.env['MOLLIE_PROFILE_ID'],
      testMode: process.env['MOLLIE_TEST_MODE'] !== 'false',
      webhookUrl: process.env['MOLLIE_WEBHOOK_URL'],
    };
  }

  /**
   * Handle Mollie webhook callback
   */
  async handleWebhook(paymentId: string): Promise<{ status: string; paid: boolean }> {
    this.logger.info({ paymentId }, 'Processing Mollie webhook');

    // In development, mock the response
    if (process.env['USE_MOCK_SHOPWARE'] === 'true' || process.env['NODE_ENV'] === 'development') {
      return { status: 'paid', paid: true };
    }

    const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch payment status: ${response.status}`);
    }

    const payment = await response.json() as MolliePaymentResponse;

    return {
      status: payment.status,
      paid: payment.status === 'paid',
    };
  }

  /**
   * Check if Mollie is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }
}

export const mollieHandler = new MollieHandler();
