/**
 * PaymentProcessor Unit Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { PaymentProcessor, PaymentError } from '../../src/services/PaymentProcessor.js';
import type { CheckoutSession } from '@prisma/client';
import type { PaymentData, PaymentResult } from '../../src/types/ucp.js';

// Mock dependencies
jest.mock('../../src/services/PaymentHandlerRegistry.js', () => ({
  paymentHandlerRegistry: {
    getHandler: jest.fn(),
  },
}));

jest.mock('../../src/services/OrderService.js', () => ({
  orderService: {
    validateForOrderCreation: jest.fn(),
    createOrder: jest.fn(),
  },
}));

jest.mock('../../src/repositories/SessionRepository.js', () => ({
  sessionRepository: {
    findByUcpId: jest.fn(),
    update: jest.fn(),
    complete: jest.fn(),
  },
}));

import { paymentHandlerRegistry } from '../../src/services/PaymentHandlerRegistry.js';
import { orderService } from '../../src/services/OrderService.js';
import { sessionRepository } from '../../src/repositories/SessionRepository.js';

describe('PaymentProcessor', () => {
  let paymentProcessor: PaymentProcessor;
  let mockClient: any;

  const createMockSession = (overrides?: Partial<CheckoutSession>): CheckoutSession => ({
    id: 'db-session-id',
    ucpSessionId: 'ucp-session-123',
    shopId: 'shop-123',
    shopwareCartToken: 'cart-token-123',
    status: 'incomplete',
    platformProfileUrl: 'https://platform.example.com',
    platformId: 'platform-123',
    platformCapabilities: null,
    activeCapabilities: null,
    activeExtensions: null,
    buyerEmail: 'test@example.com',
    buyerPhone: null,
    shippingAddress: { first_name: 'John', last_name: 'Doe' },
    billingAddress: { first_name: 'John', last_name: 'Doe' },
    selectedFulfillmentId: 'shipping-1',
    appliedDiscountCodes: null,
    shopwareOrderId: null,
    shopwareOrderNumber: null,
    paymentHandlerId: null,
    paymentTransactionId: null,
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createMockPaymentData = (overrides?: Partial<PaymentData>): PaymentData => ({
    id: 'payment-123',
    handler_id: 'tokenizer',
    type: 'card',
    credential: {
      type: 'token',
      token: 'tok_test_123456',
    },
    brand: 'visa',
    last_digits: '4242',
    ...overrides,
  });

  const createMockHandler = () => ({
    id: 'tokenizer',
    name: 'Tokenizer',
    canHandle: jest.fn<(id: string) => boolean>().mockReturnValue(true),
    processPayment: jest.fn<() => Promise<PaymentResult>>(),
    getHandlerConfig: jest.fn(),
  });

  beforeEach(() => {
    paymentProcessor = new PaymentProcessor();
    mockClient = {
      getCart: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('processCheckout', () => {
    it('should process a successful payment and create order', async () => {
      const session = createMockSession();
      const paymentData = createMockPaymentData();
      const mockHandler = createMockHandler();

      mockHandler.processPayment.mockResolvedValue({
        success: true,
        status: 'captured',
        transaction_id: 'txn_123456',
      });

      (paymentHandlerRegistry.getHandler as unknown as Mock).mockReturnValue(mockHandler);
      (orderService.validateForOrderCreation as unknown as Mock).mockReturnValue({ valid: true });
      (orderService.createOrder as unknown as Mock).mockResolvedValue({
        success: true,
        order: {
          id: 'order-123',
          orderNumber: 'ORD-10001',
          createdAt: '2024-01-15T10:00:00Z',
        },
      });
      (sessionRepository.update as unknown as Mock).mockResolvedValue(session);
      (sessionRepository.complete as unknown as Mock).mockResolvedValue(session);

      const result = await paymentProcessor.processCheckout(mockClient, session, paymentData);

      expect(result.success).toBe(true);
      expect(result.response.status).toBe('completed');
      expect(result.response.order?.id).toBe('order-123');
      expect(result.response.order?.order_number).toBe('ORD-10001');
      expect(result.transactionId).toBe('txn_123456');

      expect(sessionRepository.update).toHaveBeenCalledWith(
        'ucp-session-123',
        { status: 'complete_in_progress' }
      );
      expect(sessionRepository.complete).toHaveBeenCalledWith(
        'ucp-session-123',
        'order-123',
        'ORD-10001',
        'txn_123456'
      );
    });

    it('should throw error for completed session', async () => {
      const session = createMockSession({ status: 'completed' });
      const paymentData = createMockPaymentData();

      await expect(
        paymentProcessor.processCheckout(mockClient, session, paymentData)
      ).rejects.toThrow(PaymentError);

      await expect(
        paymentProcessor.processCheckout(mockClient, session, paymentData)
      ).rejects.toMatchObject({
        code: 'session_completed',
      });
    });

    it('should throw error for cancelled session', async () => {
      const session = createMockSession({ status: 'cancelled' });
      const paymentData = createMockPaymentData();

      await expect(
        paymentProcessor.processCheckout(mockClient, session, paymentData)
      ).rejects.toMatchObject({
        code: 'session_cancelled',
      });
    });

    it('should throw error for expired session', async () => {
      const session = createMockSession({
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      });
      const paymentData = createMockPaymentData();

      await expect(
        paymentProcessor.processCheckout(mockClient, session, paymentData)
      ).rejects.toMatchObject({
        code: 'session_expired',
      });
    });

    it('should throw error when handler not found', async () => {
      const session = createMockSession();
      const paymentData = createMockPaymentData({ handler_id: 'unknown' });

      (orderService.validateForOrderCreation as unknown as Mock).mockReturnValue({ valid: true });
      (paymentHandlerRegistry.getHandler as unknown as Mock).mockReturnValue(null);
      (sessionRepository.update as unknown as Mock).mockResolvedValue(session);

      await expect(
        paymentProcessor.processCheckout(mockClient, session, paymentData)
      ).rejects.toMatchObject({
        code: 'handler_not_found',
      });
    });

    it('should throw error when order validation fails', async () => {
      const session = createMockSession();
      const paymentData = createMockPaymentData();

      (orderService.validateForOrderCreation as unknown as Mock).mockReturnValue({
        valid: false,
        error: 'Missing shipping address',
      });

      await expect(
        paymentProcessor.processCheckout(mockClient, session, paymentData)
      ).rejects.toMatchObject({
        code: 'session_incomplete',
        message: 'Missing shipping address',
      });
    });

    it('should handle requires_action result (3DS)', async () => {
      const session = createMockSession();
      const paymentData = createMockPaymentData();
      const mockHandler = createMockHandler();

      mockHandler.processPayment.mockResolvedValue({
        success: false,
        status: 'requires_action',
        action_url: 'https://bank.example.com/3ds',
        transaction_id: 'txn_pending',
      });

      (paymentHandlerRegistry.getHandler as unknown as Mock).mockReturnValue(mockHandler);
      (orderService.validateForOrderCreation as unknown as Mock).mockReturnValue({ valid: true });
      (sessionRepository.update as unknown as Mock).mockResolvedValue(session);

      const result = await paymentProcessor.processCheckout(mockClient, session, paymentData);

      expect(result.success).toBe(false);
      expect(result.response.status).toBe('requires_escalation');
      expect(result.response.continue_url).toBe('https://bank.example.com/3ds');
      expect(result.transactionId).toBe('txn_pending');

      expect(sessionRepository.update).toHaveBeenCalledWith(
        'ucp-session-123',
        { status: 'requires_escalation' }
      );
    });

    it('should handle failed payment', async () => {
      const session = createMockSession();
      const paymentData = createMockPaymentData();
      const mockHandler = createMockHandler();

      mockHandler.processPayment.mockResolvedValue({
        success: false,
        status: 'failed',
        error: { code: 'card_declined', message: 'Your card was declined' },
      });

      (paymentHandlerRegistry.getHandler as unknown as Mock).mockReturnValue(mockHandler);
      (orderService.validateForOrderCreation as unknown as Mock).mockReturnValue({ valid: true });
      (sessionRepository.update as unknown as Mock).mockResolvedValue(session);

      await expect(
        paymentProcessor.processCheckout(mockClient, session, paymentData)
      ).rejects.toMatchObject({
        code: 'card_declined',
        message: 'Your card was declined',
      });

      // Should revert session status
      expect(sessionRepository.update).toHaveBeenCalledWith(
        'ucp-session-123',
        { status: 'incomplete' }
      );
    });

    it('should handle order creation failure after successful payment', async () => {
      const session = createMockSession();
      const paymentData = createMockPaymentData();
      const mockHandler = createMockHandler();

      mockHandler.processPayment.mockResolvedValue({
        success: true,
        status: 'captured',
        transaction_id: 'txn_123456',
      });

      (paymentHandlerRegistry.getHandler as unknown as Mock).mockReturnValue(mockHandler);
      (orderService.validateForOrderCreation as unknown as Mock).mockReturnValue({ valid: true });
      (orderService.createOrder as unknown as Mock).mockResolvedValue({
        success: false,
        error: 'Shopware API error',
      });
      (sessionRepository.update as unknown as Mock).mockResolvedValue(session);

      await expect(
        paymentProcessor.processCheckout(mockClient, session, paymentData)
      ).rejects.toMatchObject({
        code: 'order_creation_failed',
      });
    });

    it('should pass risk signals to handler', async () => {
      const session = createMockSession();
      const paymentData = createMockPaymentData();
      const mockHandler = createMockHandler();
      const riskSignals = { session_id: 'risk-123', score: 85 };

      mockHandler.processPayment.mockResolvedValue({
        success: true,
        status: 'captured',
        transaction_id: 'txn_123456',
      });

      (paymentHandlerRegistry.getHandler as unknown as Mock).mockReturnValue(mockHandler);
      (orderService.validateForOrderCreation as unknown as Mock).mockReturnValue({ valid: true });
      (orderService.createOrder as unknown as Mock).mockResolvedValue({
        success: true,
        order: { id: 'order-123', orderNumber: 'ORD-10001', createdAt: '2024-01-15T10:00:00Z' },
      });
      (sessionRepository.update as unknown as Mock).mockResolvedValue(session);
      (sessionRepository.complete as unknown as Mock).mockResolvedValue(session);

      await paymentProcessor.processCheckout(mockClient, session, paymentData, riskSignals);

      expect(mockHandler.processPayment).toHaveBeenCalledWith(session, paymentData);
    });
  });

  describe('resumePayment', () => {
    it('should resume payment after successful 3DS', async () => {
      const session = createMockSession({ status: 'requires_escalation' });

      (sessionRepository.findByUcpId as unknown as Mock).mockResolvedValue(session);
      (orderService.createOrder as unknown as Mock).mockResolvedValue({
        success: true,
        order: { id: 'order-123', orderNumber: 'ORD-10001', createdAt: '2024-01-15T10:00:00Z' },
      });
      (sessionRepository.complete as unknown as Mock).mockResolvedValue(session);

      const result = await paymentProcessor.resumePayment(
        mockClient,
        'ucp-session-123',
        { success: true, transaction_id: 'txn_123456' }
      );

      expect(result.success).toBe(true);
      expect(result.response.status).toBe('completed');
      expect(result.response.order?.id).toBe('order-123');
    });

    it('should throw error when session not found', async () => {
      (sessionRepository.findByUcpId as unknown as Mock).mockResolvedValue(null);

      await expect(
        paymentProcessor.resumePayment(mockClient, 'unknown-session', { success: true })
      ).rejects.toMatchObject({
        code: 'session_not_found',
      });
    });

    it('should throw error when session not awaiting action', async () => {
      const session = createMockSession({ status: 'incomplete' });
      (sessionRepository.findByUcpId as unknown as Mock).mockResolvedValue(session);

      await expect(
        paymentProcessor.resumePayment(mockClient, 'ucp-session-123', { success: true })
      ).rejects.toMatchObject({
        code: 'invalid_session_state',
      });
    });

    it('should throw error when 3DS authentication failed', async () => {
      const session = createMockSession({ status: 'requires_escalation' });
      (sessionRepository.findByUcpId as unknown as Mock).mockResolvedValue(session);
      (sessionRepository.update as unknown as Mock).mockResolvedValue(session);

      await expect(
        paymentProcessor.resumePayment(mockClient, 'ucp-session-123', {
          success: false,
          error: 'User cancelled authentication',
        })
      ).rejects.toMatchObject({
        code: 'authentication_failed',
      });
    });
  });
});

describe('PaymentError', () => {
  it('should have correct name and code', () => {
    const error = new PaymentError('TEST_CODE', 'Test message');

    expect(error.name).toBe('PaymentError');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
  });
});
