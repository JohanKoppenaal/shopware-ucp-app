/**
 * Base Payment Handler
 * Abstract base class for all payment handlers
 */

import type { CheckoutSession as DbCheckoutSession } from '@prisma/client';
import type { PaymentHandler, PaymentData, PaymentResult, Address } from '../types/ucp.js';
import { logger } from '../utils/logger.js';

const UCP_VERSION = process.env['UCP_VERSION'] ?? '2026-01-11';

export interface PaymentProcessingContext {
  session: DbCheckoutSession;
  paymentData: PaymentData;
  amount: number;
  currency: string;
  billingAddress?: Address;
  shopId: string;
}

export interface RiskSignals {
  session_id?: string;
  score?: number;
  ip_address?: string;
  user_agent?: string;
  device_fingerprint?: string;
}

export abstract class BasePaymentHandler {
  abstract readonly id: string;
  abstract readonly name: string;

  protected readonly ucpVersion = UCP_VERSION;
  protected readonly logger = logger.child({ handler: this.constructor.name });

  /**
   * Check if this handler can process the given handler ID
   */
  canHandle(handlerId: string): boolean {
    return handlerId === this.id || handlerId === this.name;
  }

  /**
   * Process a payment - must be implemented by subclasses
   */
  abstract processPayment(
    session: DbCheckoutSession,
    paymentData: PaymentData
  ): Promise<PaymentResult>;

  /**
   * Get the handler configuration for the UCP profile
   */
  abstract getHandlerConfig(): PaymentHandler;

  /**
   * Validate payment data before processing
   */
  protected validatePaymentData(paymentData: PaymentData): { valid: boolean; error?: string } {
    if (!paymentData.credential?.token) {
      return { valid: false, error: 'Payment credential token is required' };
    }

    if (!paymentData.handler_id) {
      return { valid: false, error: 'Handler ID is required' };
    }

    return { valid: true };
  }

  /**
   * Log payment attempt (without sensitive data)
   */
  protected logPaymentAttempt(
    session: DbCheckoutSession,
    paymentData: PaymentData,
    additionalContext?: Record<string, unknown>
  ): void {
    this.logger.info(
      {
        sessionId: session.ucpSessionId,
        handlerId: this.id,
        paymentType: paymentData.type,
        brand: paymentData.brand,
        lastDigits: paymentData.last_digits,
        ...additionalContext,
      },
      'Processing payment'
    );
  }

  /**
   * Log payment result (without sensitive data)
   */
  protected logPaymentResult(session: DbCheckoutSession, result: PaymentResult): void {
    const logData: Record<string, unknown> = {
      sessionId: session.ucpSessionId,
      handlerId: this.id,
      success: result.success,
      status: result.status,
    };

    if (result.transaction_id) {
      logData['transactionId'] = result.transaction_id;
    }

    if (result.error) {
      logData['errorCode'] = result.error.code;
      logData['errorMessage'] = result.error.message;
    }

    if (result.success) {
      this.logger.info(logData, 'Payment processed successfully');
    } else if (result.status === 'requires_action') {
      this.logger.info(logData, 'Payment requires additional action');
    } else {
      this.logger.warn(logData, 'Payment failed');
    }
  }

  /**
   * Create a failed payment result
   */
  protected createFailedResult(code: string, message: string): PaymentResult {
    return {
      success: false,
      status: 'failed',
      error: { code, message },
    };
  }

  /**
   * Create a successful payment result
   */
  protected createSuccessResult(
    transactionId: string,
    status: 'authorized' | 'captured' = 'captured'
  ): PaymentResult {
    return {
      success: true,
      status,
      transaction_id: transactionId,
    };
  }

  /**
   * Create a requires_action result (for 3DS/SCA)
   */
  protected createRequiresActionResult(actionUrl: string, transactionId?: string): PaymentResult {
    return {
      success: false,
      status: 'requires_action',
      action_url: actionUrl,
      transaction_id: transactionId,
    };
  }
}
