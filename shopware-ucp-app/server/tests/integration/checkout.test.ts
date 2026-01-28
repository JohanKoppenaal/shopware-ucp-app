/**
 * Checkout Flow Integration Tests
 * Tests the complete checkout flow through the API endpoints
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import request from 'supertest';
import express, { type Express } from 'express';

// Mock the services before importing routes
jest.mock('../../src/services/CheckoutSessionService.js');
jest.mock('../../src/repositories/SessionRepository.js');
jest.mock('../../src/services/KeyManager.js', () => ({
  keyManager: {
    initialize: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getPublicKey: jest.fn<() => Record<string, unknown>>().mockReturnValue({ kid: 'test-key', kty: 'EC' }),
    signPayload: jest.fn<() => Promise<string>>().mockResolvedValue('test-signature'),
  },
}));

import checkoutSessionsRoutes from '../../src/routes/checkout-sessions.js';
import { checkoutSessionService } from '../../src/services/CheckoutSessionService.js';

describe('Checkout Flow Integration', () => {
  let app: Express;

  const mockCheckoutResponse = {
    id: 'ucp-session-123',
    status: 'incomplete',
    line_items: [
      {
        id: 'line-1',
        item: {
          id: 'product-1',
          title: 'Test Product',
          unit_price: 5000,
          currency: 'EUR',
        },
        quantity: 2,
      },
    ],
    totals: [
      { type: 'subtotal', label: 'Subtotal', amount: 10000, currency: 'EUR' },
      { type: 'total', label: 'Total', amount: 10000, currency: 'EUR' },
    ],
    fulfillment: {
      type: 'shipping',
      options: [
        {
          id: 'shipping-1',
          label: 'Standard Shipping',
          price: 595,
          currency: 'EUR',
          delivery_estimate: { min_days: 3, max_days: 5 },
        },
      ],
    },
    payment_handlers: [
      { id: 'tokenizer', name: 'Card Payment', type: 'card', brands: ['visa', 'mastercard'] },
    ],
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/checkout-sessions', checkoutSessionsRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/checkout-sessions', () => {
    it('should create a new checkout session', async () => {
      (checkoutSessionService.create as unknown as Mock).mockResolvedValue(mockCheckoutResponse);

      const response = await request(app)
        .post('/api/v1/checkout-sessions')
        .set('Content-Type', 'application/json')
        .set('X-Shop-ID', 'test-shop')
        .send({
          line_items: [
            { product_id: 'product-1', quantity: 2 },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('incomplete');
      expect(response.body.line_items).toHaveLength(1);
      expect(checkoutSessionService.create).toHaveBeenCalled();
    });

    it('should create session with UCP-Agent header', async () => {
      (checkoutSessionService.create as unknown as Mock).mockResolvedValue(mockCheckoutResponse);

      const response = await request(app)
        .post('/api/v1/checkout-sessions')
        .set('Content-Type', 'application/json')
        .set('X-Shop-ID', 'test-shop')
        .set('UCP-Agent', 'profile_url="https://platform.example.com/.well-known/ucp" capabilities="checkout,payments"')
        .send({
          line_items: [
            { product_id: 'product-1', quantity: 1 },
          ],
        });

      expect(response.status).toBe(201);
      expect(checkoutSessionService.create).toHaveBeenCalledWith(
        'test-shop',
        expect.any(Object),
        'https://platform.example.com/.well-known/ucp',
        ['checkout', 'payments']
      );
    });

    it('should return 400 for invalid request body', async () => {
      const response = await request(app)
        .post('/api/v1/checkout-sessions')
        .set('Content-Type', 'application/json')
        .set('X-Shop-ID', 'test-shop')
        .send({
          line_items: [], // Empty array is invalid
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('validation_error');
    });

    it('should return 400 for missing line_items', async () => {
      const response = await request(app)
        .post('/api/v1/checkout-sessions')
        .set('Content-Type', 'application/json')
        .set('X-Shop-ID', 'test-shop')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('validation_error');
    });

    it('should include buyer information when provided', async () => {
      (checkoutSessionService.create as unknown as Mock).mockResolvedValue(mockCheckoutResponse);

      const response = await request(app)
        .post('/api/v1/checkout-sessions')
        .set('Content-Type', 'application/json')
        .set('X-Shop-ID', 'test-shop')
        .send({
          line_items: [
            { product_id: 'product-1', quantity: 1 },
          ],
          buyer: {
            email: 'test@example.com',
            phone: '+31612345678',
          },
        });

      expect(response.status).toBe(201);
      expect(checkoutSessionService.create).toHaveBeenCalledWith(
        'test-shop',
        expect.objectContaining({
          buyer: { email: 'test@example.com', phone: '+31612345678' },
        }),
        undefined,
        undefined
      );
    });
  });

  describe('GET /api/v1/checkout-sessions/:id', () => {
    it('should return checkout session by ID', async () => {
      (checkoutSessionService.get as unknown as Mock).mockResolvedValue(mockCheckoutResponse);

      const response = await request(app)
        .get('/api/v1/checkout-sessions/ucp-session-123')
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('ucp-session-123');
      expect(checkoutSessionService.get).toHaveBeenCalledWith('ucp-session-123');
    });

    it('should return 404 for non-existent session', async () => {
      (checkoutSessionService.get as unknown as Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/checkout-sessions/non-existent')
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('session_not_found');
    });
  });

  describe('PATCH /api/v1/checkout-sessions/:id', () => {
    it('should update shipping address', async () => {
      const updatedSession = {
        ...mockCheckoutResponse,
        shipping_address: {
          first_name: 'John',
          last_name: 'Doe',
          street_address: '123 Main St',
          address_locality: 'Amsterdam',
          postal_code: '1012 AB',
          address_country: 'NL',
        },
      };

      (checkoutSessionService.update as unknown as Mock).mockResolvedValue(updatedSession);

      const response = await request(app)
        .patch('/api/v1/checkout-sessions/ucp-session-123')
        .set('Content-Type', 'application/json')
        .send({
          shipping_address: {
            first_name: 'John',
            last_name: 'Doe',
            street_address: '123 Main St',
            address_locality: 'Amsterdam',
            postal_code: '1012 AB',
            address_country: 'NL',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.shipping_address).toBeDefined();
      expect(checkoutSessionService.update).toHaveBeenCalledWith(
        'ucp-session-123',
        expect.objectContaining({ shipping_address: expect.any(Object) })
      );
    });

    it('should update fulfillment option', async () => {
      const updatedSession = {
        ...mockCheckoutResponse,
        fulfillment: {
          ...mockCheckoutResponse.fulfillment,
          selected_option_id: 'shipping-2',
        },
      };

      (checkoutSessionService.update as unknown as Mock).mockResolvedValue(updatedSession);

      const response = await request(app)
        .patch('/api/v1/checkout-sessions/ucp-session-123')
        .set('Content-Type', 'application/json')
        .send({
          selected_fulfillment_option_id: 'shipping-2',
        });

      expect(response.status).toBe(200);
      expect(checkoutSessionService.update).toHaveBeenCalledWith(
        'ucp-session-123',
        expect.objectContaining({ selected_fulfillment_option_id: 'shipping-2' })
      );
    });

    it('should apply discount codes', async () => {
      const updatedSession = {
        ...mockCheckoutResponse,
        totals: [
          { type: 'subtotal', label: 'Subtotal', amount: 10000, currency: 'EUR' },
          { type: 'discount', label: 'SAVE10', amount: -1000, currency: 'EUR' },
          { type: 'total', label: 'Total', amount: 9000, currency: 'EUR' },
        ],
      };

      (checkoutSessionService.update as unknown as Mock).mockResolvedValue(updatedSession);

      const response = await request(app)
        .patch('/api/v1/checkout-sessions/ucp-session-123')
        .set('Content-Type', 'application/json')
        .send({
          discounts: {
            codes: ['SAVE10'],
          },
        });

      expect(response.status).toBe(200);
      expect(checkoutSessionService.update).toHaveBeenCalledWith(
        'ucp-session-123',
        expect.objectContaining({ discounts: { codes: ['SAVE10'] } })
      );
    });

    it('should return 400 for invalid address country code', async () => {
      const response = await request(app)
        .patch('/api/v1/checkout-sessions/ucp-session-123')
        .set('Content-Type', 'application/json')
        .send({
          shipping_address: {
            first_name: 'John',
            last_name: 'Doe',
            street_address: '123 Main St',
            address_locality: 'Amsterdam',
            postal_code: '1012 AB',
            address_country: 'Netherlands', // Should be 2-letter code
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('validation_error');
    });
  });

  describe('POST /api/v1/checkout-sessions/:id/complete', () => {
    it('should complete checkout with payment', async () => {
      const completedResponse = {
        status: 'completed',
        order: {
          id: 'order-123',
          order_number: 'ORD-10001',
          created_at: '2024-01-15T10:00:00Z',
        },
      };

      (checkoutSessionService.complete as unknown as Mock).mockResolvedValue(completedResponse);

      const response = await request(app)
        .post('/api/v1/checkout-sessions/ucp-session-123/complete')
        .set('Content-Type', 'application/json')
        .send({
          payment_data: {
            id: 'payment-123',
            handler_id: 'tokenizer',
            type: 'card',
            brand: 'visa',
            last_digits: '4242',
            credential: {
              type: 'token',
              token: 'tok_test_123456',
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');
      expect(response.body.order).toBeDefined();
      expect(response.body.order.order_number).toBe('ORD-10001');
    });

    it('should handle 3DS authentication required', async () => {
      const escalationResponse = {
        status: 'requires_escalation',
        messages: [
          {
            type: 'error',
            code: 'requires_3ds',
            message: 'Bank requires verification',
            severity: 'requires_buyer_input',
          },
        ],
        continue_url: 'https://bank.example.com/3ds',
      };

      (checkoutSessionService.complete as unknown as Mock).mockResolvedValue(escalationResponse);

      const response = await request(app)
        .post('/api/v1/checkout-sessions/ucp-session-123/complete')
        .set('Content-Type', 'application/json')
        .send({
          payment_data: {
            id: 'payment-123',
            handler_id: 'tokenizer',
            type: 'card',
            credential: {
              type: 'token',
              token: 'tok_test_3ds_required',
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('requires_escalation');
      expect(response.body.continue_url).toBe('https://bank.example.com/3ds');
    });

    it('should include risk signals when provided', async () => {
      const completedResponse = {
        status: 'completed',
        order: { id: 'order-123', order_number: 'ORD-10001', created_at: '2024-01-15T10:00:00Z' },
      };

      (checkoutSessionService.complete as unknown as Mock).mockResolvedValue(completedResponse);

      const response = await request(app)
        .post('/api/v1/checkout-sessions/ucp-session-123/complete')
        .set('Content-Type', 'application/json')
        .send({
          payment_data: {
            id: 'payment-123',
            handler_id: 'tokenizer',
            type: 'card',
            credential: { type: 'token', token: 'tok_test_123' },
          },
          risk_signals: {
            session_id: 'risk-session-123',
            score: 85,
          },
        });

      expect(response.status).toBe(200);
      expect(checkoutSessionService.complete).toHaveBeenCalledWith(
        'ucp-session-123',
        expect.objectContaining({
          risk_signals: { session_id: 'risk-session-123', score: 85 },
        })
      );
    });

    it('should return 400 for missing payment data', async () => {
      const response = await request(app)
        .post('/api/v1/checkout-sessions/ucp-session-123/complete')
        .set('Content-Type', 'application/json')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('validation_error');
    });

    it('should return 400 for invalid payment type', async () => {
      const response = await request(app)
        .post('/api/v1/checkout-sessions/ucp-session-123/complete')
        .set('Content-Type', 'application/json')
        .send({
          payment_data: {
            id: 'payment-123',
            handler_id: 'tokenizer',
            type: 'invalid_type',
            credential: { type: 'token', token: 'tok_test_123' },
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('validation_error');
    });
  });

  describe('DELETE /api/v1/checkout-sessions/:id', () => {
    it('should cancel checkout session', async () => {
      (checkoutSessionService.cancel as unknown as Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/v1/checkout-sessions/ucp-session-123');

      expect(response.status).toBe(204);
      expect(checkoutSessionService.cancel).toHaveBeenCalledWith('ucp-session-123');
    });

    it('should handle session not found error', async () => {
      (checkoutSessionService.cancel as unknown as Mock).mockRejectedValue({
        code: 'session_not_found',
        message: 'Session not found',
      });

      const response = await request(app)
        .delete('/api/v1/checkout-sessions/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('session_not_found');
    });
  });

  describe('Complete Checkout Flow', () => {
    it('should handle full checkout flow from creation to completion', async () => {
      // Step 1: Create session
      (checkoutSessionService.create as unknown as Mock).mockResolvedValue(mockCheckoutResponse);

      let response = await request(app)
        .post('/api/v1/checkout-sessions')
        .set('X-Shop-ID', 'test-shop')
        .send({ line_items: [{ product_id: 'product-1', quantity: 2 }] });

      expect(response.status).toBe(201);
      const sessionId = response.body.id;

      // Step 2: Update with shipping address
      const withAddress = {
        ...mockCheckoutResponse,
        shipping_address: {
          first_name: 'John',
          last_name: 'Doe',
          street_address: '123 Main St',
          address_locality: 'Amsterdam',
          postal_code: '1012 AB',
          address_country: 'NL',
        },
      };
      (checkoutSessionService.update as unknown as Mock).mockResolvedValue(withAddress);

      response = await request(app)
        .patch(`/api/v1/checkout-sessions/${sessionId}`)
        .send({
          shipping_address: withAddress.shipping_address,
        });

      expect(response.status).toBe(200);

      // Step 3: Select fulfillment option
      const withFulfillment = {
        ...withAddress,
        fulfillment: {
          ...withAddress.fulfillment,
          selected_option_id: 'shipping-1',
        },
      };
      (checkoutSessionService.update as unknown as Mock).mockResolvedValue(withFulfillment);

      response = await request(app)
        .patch(`/api/v1/checkout-sessions/${sessionId}`)
        .send({
          selected_fulfillment_option_id: 'shipping-1',
        });

      expect(response.status).toBe(200);

      // Step 4: Complete checkout
      const completedResponse = {
        status: 'completed',
        order: {
          id: 'order-123',
          order_number: 'ORD-10001',
          created_at: new Date().toISOString(),
        },
      };
      (checkoutSessionService.complete as unknown as Mock).mockResolvedValue(completedResponse);

      response = await request(app)
        .post(`/api/v1/checkout-sessions/${sessionId}/complete`)
        .send({
          payment_data: {
            id: 'payment-123',
            handler_id: 'tokenizer',
            type: 'card',
            credential: { type: 'token', token: 'tok_test_success' },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');
      expect(response.body.order.order_number).toBe('ORD-10001');
    });
  });
});
