/**
 * Payment Processor Service
 * Central service for processing payments in UCP checkout
 */

import type { CheckoutSession as DbCheckoutSession } from '@prisma/client';
import type { PaymentData, PaymentResult, CompleteCheckoutResponse } from '../types/ucp.js';
import type { ShopwareApiClient } from './ShopwareApiClient.js';
import type { MockShopwareApiClient } from './MockShopwareApiClient.js';
import { paymentHandlerRegistry } from './PaymentHandlerRegistry.js';
import { orderService } from './OrderService.js';
import { sessionRepository } from '../repositories/SessionRepository.js';
import { logger } from '../utils/logger.js';

type ApiClient = ShopwareApiClient | MockShopwareApiClient;

export interface PaymentProcessingResult {
  success: boolean;
  response: CompleteCheckoutResponse;
  transactionId?: string;
}

export interface RiskSignals {
  session_id?: string;
  score?: number;
}

/**
 * Payment processing error
 */
export class PaymentError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PaymentError';
  }
}

export class PaymentProcessor {
  /**
   * Process the complete checkout flow
   */
  async processCheckout(
    client: ApiClient,
    session: DbCheckoutSession,
    paymentData: PaymentData,
    riskSignals?: RiskSignals
  ): Promise<PaymentProcessingResult> {
    const sessionId = session.ucpSessionId;

    logger.info(
      {
        sessionId,
        handlerId: paymentData.handler_id,
        paymentType: paymentData.type,
      },
      'Processing checkout payment'
    );

    // Validate session state
    const sessionValidation = this.validateSession(session);
    if (!sessionValidation.valid) {
      throw new PaymentError(sessionValidation.code!, sessionValidation.error!);
    }

    // Validate order can be created
    const orderValidation = orderService.validateForOrderCreation(session);
    if (!orderValidation.valid) {
      throw new PaymentError('session_incomplete', orderValidation.error!);
    }

    // Get the payment handler
    const handler = paymentHandlerRegistry.getHandler(paymentData.handler_id);
    if (!handler) {
      logger.warn({ handlerId: paymentData.handler_id }, 'Payment handler not found');
      throw new PaymentError(
        'handler_not_found',
        `Payment handler "${paymentData.handler_id}" not found`
      );
    }

    // Update session status to processing
    await sessionRepository.update(sessionId, { status: 'complete_in_progress' });

    try {
      // Log risk signals if provided
      if (riskSignals) {
        logger.debug({ sessionId, riskSignals }, 'Risk signals received');
      }

      // Process the payment
      const paymentResult = await handler.processPayment(session, paymentData);

      // Handle payment result
      return await this.handlePaymentResult(client, session, paymentData, paymentResult);
    } catch (error) {
      // Revert session status on error
      await sessionRepository.update(sessionId, { status: 'incomplete' });

      // Re-throw PaymentError
      if (error instanceof PaymentError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ sessionId, error: errorMessage }, 'Payment processing failed');

      throw new PaymentError('payment_failed', errorMessage);
    }
  }

  /**
   * Handle the payment result and create order if successful
   */
  private async handlePaymentResult(
    client: ApiClient,
    session: DbCheckoutSession,
    paymentData: PaymentData,
    paymentResult: PaymentResult
  ): Promise<PaymentProcessingResult> {
    const sessionId = session.ucpSessionId;

    // Handle requires_action (3DS/SCA)
    if (paymentResult.status === 'requires_action' && paymentResult.action_url) {
      logger.info({ sessionId, actionUrl: paymentResult.action_url }, 'Payment requires action');

      await sessionRepository.update(sessionId, { status: 'requires_escalation' });

      return {
        success: false,
        response: {
          status: 'requires_escalation',
          messages: [
            {
              type: 'error',
              code: 'requires_3ds',
              message: 'Bank requires verification',
              severity: 'requires_buyer_input',
            },
          ],
          continue_url: paymentResult.action_url,
        },
        transactionId: paymentResult.transaction_id,
      };
    }

    // Handle failed payment
    if (!paymentResult.success) {
      logger.warn(
        {
          sessionId,
          errorCode: paymentResult.error?.code,
          errorMessage: paymentResult.error?.message,
        },
        'Payment failed'
      );

      await sessionRepository.update(sessionId, { status: 'incomplete' });

      throw new PaymentError(
        paymentResult.error?.code ?? 'payment_failed',
        paymentResult.error?.message ?? 'Payment was not successful'
      );
    }

    // Payment successful - create the order
    logger.info(
      { sessionId, transactionId: paymentResult.transaction_id },
      'Payment successful, creating order'
    );

    const orderResult = await orderService.createOrder(
      client,
      session,
      paymentData.handler_id,
      paymentResult.transaction_id
    );

    if (!orderResult.success || !orderResult.order) {
      // Payment succeeded but order creation failed
      // This is a critical error - payment was taken but no order created
      logger.error(
        {
          sessionId,
          transactionId: paymentResult.transaction_id,
          error: orderResult.error,
        },
        'CRITICAL: Payment successful but order creation failed'
      );

      await sessionRepository.update(sessionId, { status: 'incomplete' });

      throw new PaymentError(
        'order_creation_failed',
        'Payment was processed but order could not be created. Please contact support.'
      );
    }

    // Complete the session
    await sessionRepository.complete(
      sessionId,
      orderResult.order.id,
      orderResult.order.orderNumber,
      paymentResult.transaction_id
    );

    logger.info(
      {
        sessionId,
        orderId: orderResult.order.id,
        orderNumber: orderResult.order.orderNumber,
        transactionId: paymentResult.transaction_id,
      },
      'Checkout completed successfully'
    );

    return {
      success: true,
      response: {
        status: 'completed',
        order: {
          id: orderResult.order.id,
          order_number: orderResult.order.orderNumber,
          created_at: orderResult.order.createdAt,
        },
      },
      transactionId: paymentResult.transaction_id,
    };
  }

  /**
   * Validate session state for payment processing
   */
  private validateSession(session: DbCheckoutSession): {
    valid: boolean;
    code?: string;
    error?: string;
  } {
    if (session.status === 'completed') {
      return { valid: false, code: 'session_completed', error: 'Session already completed' };
    }

    if (session.status === 'cancelled') {
      return { valid: false, code: 'session_cancelled', error: 'Session has been cancelled' };
    }

    if (session.expiresAt < new Date()) {
      return { valid: false, code: 'session_expired', error: 'Session has expired' };
    }

    return { valid: true };
  }

  /**
   * Resume a payment that required action (after 3DS/SCA)
   */
  async resumePayment(
    client: ApiClient,
    sessionId: string,
    actionResult: { success: boolean; transaction_id?: string; error?: string }
  ): Promise<PaymentProcessingResult> {
    const session = await sessionRepository.findByUcpId(sessionId);
    if (!session) {
      throw new PaymentError('session_not_found', 'Session not found');
    }

    if (session.status !== 'requires_escalation') {
      throw new PaymentError('invalid_session_state', 'Session is not awaiting action completion');
    }

    if (!actionResult.success) {
      await sessionRepository.update(sessionId, { status: 'incomplete' });
      throw new PaymentError(
        'authentication_failed',
        actionResult.error ?? '3DS authentication failed'
      );
    }

    // Action completed successfully - create the order
    // Note: In a real implementation, we'd need to store and retrieve the original payment data
    const orderResult = await orderService.createOrder(
      client,
      session,
      'resumed', // Would need to store original handler_id
      actionResult.transaction_id
    );

    if (!orderResult.success || !orderResult.order) {
      await sessionRepository.update(sessionId, { status: 'incomplete' });
      throw new PaymentError('order_creation_failed', 'Order could not be created');
    }

    await sessionRepository.complete(
      sessionId,
      orderResult.order.id,
      orderResult.order.orderNumber,
      actionResult.transaction_id
    );

    return {
      success: true,
      response: {
        status: 'completed',
        order: {
          id: orderResult.order.id,
          order_number: orderResult.order.orderNumber,
          created_at: orderResult.order.createdAt,
        },
      },
      transactionId: actionResult.transaction_id,
    };
  }
}

export const paymentProcessor = new PaymentProcessor();
