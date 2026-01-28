/**
 * BasePaymentHandler Unit Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { BasePaymentHandler } from '../../src/handlers/BasePaymentHandler.js';
import type { CheckoutSession } from '@prisma/client';
import type { PaymentData, PaymentResult, PaymentHandler } from '../../src/types/ucp.js';

// Concrete test implementation of the abstract BasePaymentHandler
class TestPaymentHandler extends BasePaymentHandler {
  readonly id = 'test-handler';
  readonly name = 'Test Handler';

  async processPayment(
    _session: CheckoutSession,
    _paymentData: PaymentData
  ): Promise<PaymentResult> {
    return { success: true, status: 'captured', transaction_id: 'test-txn' };
  }

  getHandlerConfig(): PaymentHandler {
    return {
      id: this.id,
      name: this.name,
      version: '1.0.0',
      spec: 'https://example.com/spec',
      config_schema: 'https://example.com/schema',
      instrument_schemas: ['https://example.com/card-schema'],
      config: { brands: ['visa', 'mastercard'] },
    };
  }

  // Expose protected methods for testing
  public testValidatePaymentData(paymentData: PaymentData) {
    return this.validatePaymentData(paymentData);
  }

  public testLogPaymentAttempt(
    session: CheckoutSession,
    paymentData: PaymentData,
    context?: Record<string, unknown>
  ) {
    return this.logPaymentAttempt(session, paymentData, context);
  }

  public testLogPaymentResult(session: CheckoutSession, result: PaymentResult) {
    return this.logPaymentResult(session, result);
  }

  public testCreateFailedResult(code: string, message: string) {
    return this.createFailedResult(code, message);
  }

  public testCreateSuccessResult(transactionId: string, status?: 'authorized' | 'captured') {
    return this.createSuccessResult(transactionId, status);
  }

  public testCreateRequiresActionResult(actionUrl: string, transactionId?: string) {
    return this.createRequiresActionResult(actionUrl, transactionId);
  }
}

describe('BasePaymentHandler', () => {
  let handler: TestPaymentHandler;

  const createMockSession = (): CheckoutSession => ({
    id: 'db-session-id',
    ucpSessionId: 'ucp-session-123',
    shopId: 'shop-123',
    shopwareCartToken: 'cart-token-123',
    status: 'incomplete',
    platformProfileUrl: null,
    platformId: null,
    platformCapabilities: null,
    activeCapabilities: null,
    activeExtensions: null,
    buyerEmail: null,
    buyerPhone: null,
    shippingAddress: null,
    billingAddress: null,
    selectedFulfillmentId: null,
    appliedDiscountCodes: null,
    shopwareOrderId: null,
    shopwareOrderNumber: null,
    paymentHandlerId: null,
    paymentTransactionId: null,
    expiresAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    handler = new TestPaymentHandler();
  });

  describe('canHandle', () => {
    it('should return true when handler id matches', () => {
      expect(handler.canHandle('test-handler')).toBe(true);
    });

    it('should return true when handler name matches', () => {
      expect(handler.canHandle('Test Handler')).toBe(true);
    });

    it('should return false when neither id nor name matches', () => {
      expect(handler.canHandle('other-handler')).toBe(false);
    });

    it('should return false for partial matches', () => {
      expect(handler.canHandle('test')).toBe(false);
      expect(handler.canHandle('handler')).toBe(false);
    });
  });

  describe('validatePaymentData', () => {
    it('should return valid for correct payment data', () => {
      const paymentData: PaymentData = {
        id: 'payment-1',
        handler_id: 'test-handler',
        type: 'card',
        credential: { type: 'token', token: 'tok_123' },
      };

      const result = handler.testValidatePaymentData(paymentData);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid when token is missing', () => {
      const paymentData = {
        id: 'payment-1',
        handler_id: 'test-handler',
        type: 'card',
        credential: { type: 'token' },
      } as PaymentData;

      const result = handler.testValidatePaymentData(paymentData);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Payment credential token is required');
    });

    it('should return invalid when credential is missing', () => {
      const paymentData = {
        id: 'payment-1',
        handler_id: 'test-handler',
        type: 'card',
      } as PaymentData;

      const result = handler.testValidatePaymentData(paymentData);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Payment credential token is required');
    });

    it('should return invalid when handler_id is missing', () => {
      const paymentData = {
        id: 'payment-1',
        type: 'card',
        credential: { type: 'token', token: 'tok_123' },
      } as PaymentData;

      const result = handler.testValidatePaymentData(paymentData);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Handler ID is required');
    });
  });

  describe('createFailedResult', () => {
    it('should create a failed payment result', () => {
      const result = handler.testCreateFailedResult('card_declined', 'Card was declined');

      expect(result).toEqual({
        success: false,
        status: 'failed',
        error: {
          code: 'card_declined',
          message: 'Card was declined',
        },
      });
    });
  });

  describe('createSuccessResult', () => {
    it('should create a captured success result by default', () => {
      const result = handler.testCreateSuccessResult('txn_123');

      expect(result).toEqual({
        success: true,
        status: 'captured',
        transaction_id: 'txn_123',
      });
    });

    it('should create an authorized success result when specified', () => {
      const result = handler.testCreateSuccessResult('txn_123', 'authorized');

      expect(result).toEqual({
        success: true,
        status: 'authorized',
        transaction_id: 'txn_123',
      });
    });
  });

  describe('createRequiresActionResult', () => {
    it('should create a requires_action result with URL', () => {
      const result = handler.testCreateRequiresActionResult('https://bank.example.com/3ds');

      expect(result).toEqual({
        success: false,
        status: 'requires_action',
        action_url: 'https://bank.example.com/3ds',
        transaction_id: undefined,
      });
    });

    it('should include transaction_id when provided', () => {
      const result = handler.testCreateRequiresActionResult(
        'https://bank.example.com/3ds',
        'txn_pending_123'
      );

      expect(result).toEqual({
        success: false,
        status: 'requires_action',
        action_url: 'https://bank.example.com/3ds',
        transaction_id: 'txn_pending_123',
      });
    });
  });

  describe('logPaymentAttempt', () => {
    it('should not throw when logging payment attempt', () => {
      const session = createMockSession();
      const paymentData: PaymentData = {
        id: 'payment-1',
        handler_id: 'test-handler',
        type: 'card',
        credential: { type: 'token', token: 'tok_123' },
        brand: 'visa',
        last_digits: '4242',
      };

      expect(() => {
        handler.testLogPaymentAttempt(session, paymentData);
      }).not.toThrow();
    });

    it('should accept additional context', () => {
      const session = createMockSession();
      const paymentData: PaymentData = {
        id: 'payment-1',
        handler_id: 'test-handler',
        type: 'card',
        credential: { type: 'token', token: 'tok_123' },
      };

      expect(() => {
        handler.testLogPaymentAttempt(session, paymentData, { customField: 'value' });
      }).not.toThrow();
    });
  });

  describe('logPaymentResult', () => {
    it('should not throw when logging successful result', () => {
      const session = createMockSession();
      const result: PaymentResult = {
        success: true,
        status: 'captured',
        transaction_id: 'txn_123',
      };

      expect(() => {
        handler.testLogPaymentResult(session, result);
      }).not.toThrow();
    });

    it('should not throw when logging failed result', () => {
      const session = createMockSession();
      const result: PaymentResult = {
        success: false,
        status: 'failed',
        error: { code: 'card_declined', message: 'Card declined' },
      };

      expect(() => {
        handler.testLogPaymentResult(session, result);
      }).not.toThrow();
    });

    it('should not throw when logging requires_action result', () => {
      const session = createMockSession();
      const result: PaymentResult = {
        success: false,
        status: 'requires_action',
        action_url: 'https://bank.example.com/3ds',
      };

      expect(() => {
        handler.testLogPaymentResult(session, result);
      }).not.toThrow();
    });
  });

  describe('getHandlerConfig', () => {
    it('should return handler configuration', () => {
      const config = handler.getHandlerConfig();

      expect(config.id).toBe('test-handler');
      expect(config.name).toBe('Test Handler');
      expect(config.version).toBe('1.0.0');
      expect(config.config).toEqual({ brands: ['visa', 'mastercard'] });
    });
  });
});
