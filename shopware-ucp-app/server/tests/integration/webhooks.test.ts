/**
 * Webhook Integration Tests
 * Tests webhook delivery and retry functionality
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import request from 'supertest';
import express, { type Express } from 'express';

// Mock dependencies
jest.mock('../../src/repositories/ShopRepository.js');
jest.mock('../../src/repositories/WebhookDeliveryRepository.js');
jest.mock('../../src/repositories/SessionRepository.js');
jest.mock('../../src/services/OrderStatusSyncService.js');
jest.mock('../../src/services/WebhookService.js');

import webhooksRoutes from '../../src/routes/webhooks.js';
import { shopRepository } from '../../src/repositories/ShopRepository.js';
import { webhookDeliveryRepository } from '../../src/repositories/WebhookDeliveryRepository.js';
import { orderStatusSyncService } from '../../src/services/OrderStatusSyncService.js';
import { webhookService } from '../../src/services/WebhookService.js';
import crypto from 'crypto';

describe('Webhook Integration', () => {
  let app: Express;

  const mockShop = {
    id: 'shop-db-id',
    shopId: 'test-shop-123',
    shopUrl: 'https://shop.example.com',
    apiKey: 'test-api-key',
    secretKey: 'test-secret-key',
    appName: 'UcpCommerce',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(() => {
    app = express();
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf.toString();
        },
      })
    );
    app.use('/webhooks', webhooksRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createSignature = (body: object, secret: string): string => {
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex');
  };

  describe('POST /webhooks/shopware/order-placed', () => {
    const orderPlacedPayload = {
      source: {
        shopId: 'test-shop-123',
        url: 'https://shop.example.com',
        appVersion: '1.0.0',
      },
      data: {
        event: 'checkout.order.placed',
        payload: [
          {
            id: 'order-123',
            orderNumber: 'ORD-10001',
            customFields: {
              ucp_session_id: 'ucp-session-456',
            },
          },
        ],
      },
    };

    it('should process order placed webhook', async () => {
      (shopRepository.findByShopId as unknown as Mock).mockResolvedValue(mockShop);
      (orderStatusSyncService.handleOrderStateChange as unknown as Mock).mockResolvedValue({
        success: true,
        event: 'order.updated',
      });

      const signature = createSignature(orderPlacedPayload, mockShop.secretKey);

      const response = await request(app)
        .post('/webhooks/shopware/order-placed')
        .set('Content-Type', 'application/json')
        .set('shopware-shop-signature', signature)
        .send(orderPlacedPayload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
      expect(orderStatusSyncService.handleOrderStateChange).toHaveBeenCalledWith(
        'test-shop-123',
        expect.objectContaining({
          orderId: 'order-123',
          orderNumber: 'ORD-10001',
          newState: 'open',
          stateType: 'order',
        })
      );
    });

    it('should skip non-UCP orders', async () => {
      const nonUcpOrder = {
        ...orderPlacedPayload,
        data: {
          ...orderPlacedPayload.data,
          payload: [
            {
              id: 'order-456',
              orderNumber: 'ORD-10002',
              customFields: {}, // No UCP session ID
            },
          ],
        },
      };

      (shopRepository.findByShopId as unknown as Mock).mockResolvedValue(mockShop);

      const signature = createSignature(nonUcpOrder, mockShop.secretKey);

      const response = await request(app)
        .post('/webhooks/shopware/order-placed')
        .set('Content-Type', 'application/json')
        .set('shopware-shop-signature', signature)
        .send(nonUcpOrder);

      expect(response.status).toBe(200);
      expect(orderStatusSyncService.handleOrderStateChange).not.toHaveBeenCalled();
    });

    it('should return 404 for unknown shop', async () => {
      (shopRepository.findByShopId as unknown as Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/webhooks/shopware/order-placed')
        .set('Content-Type', 'application/json')
        .send(orderPlacedPayload);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Shop not found');
    });

    it('should return 401 for invalid signature', async () => {
      (shopRepository.findByShopId as unknown as Mock).mockResolvedValue(mockShop);

      const response = await request(app)
        .post('/webhooks/shopware/order-placed')
        .set('Content-Type', 'application/json')
        .set('shopware-shop-signature', 'invalid-signature')
        .send(orderPlacedPayload);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid signature');
    });

    it('should return 401 for missing signature', async () => {
      (shopRepository.findByShopId as unknown as Mock).mockResolvedValue(mockShop);

      const response = await request(app)
        .post('/webhooks/shopware/order-placed')
        .set('Content-Type', 'application/json')
        .send(orderPlacedPayload);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid signature');
    });
  });

  describe('POST /webhooks/shopware/order-state-changed', () => {
    const orderStateChangedPayload = {
      source: {
        shopId: 'test-shop-123',
        url: 'https://shop.example.com',
        appVersion: '1.0.0',
      },
      data: {
        event: 'state_machine.order.state_changed',
        payload: [
          {
            entityId: 'order-123',
            fromStateMachineState: { technicalName: 'open' },
            toStateMachineState: { technicalName: 'in_progress' },
            order: { id: 'order-123', orderNumber: 'ORD-10001' },
          },
        ],
      },
    };

    it('should process order state change webhook', async () => {
      (shopRepository.findByShopId as unknown as Mock).mockResolvedValue(mockShop);
      (orderStatusSyncService.handleOrderStateChange as unknown as Mock).mockResolvedValue({
        success: true,
        event: 'order.updated',
      });

      const signature = createSignature(orderStateChangedPayload, mockShop.secretKey);

      const response = await request(app)
        .post('/webhooks/shopware/order-state-changed')
        .set('Content-Type', 'application/json')
        .set('shopware-shop-signature', signature)
        .send(orderStateChangedPayload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
      expect(orderStatusSyncService.handleOrderStateChange).toHaveBeenCalledWith(
        'test-shop-123',
        expect.objectContaining({
          orderId: 'order-123',
          previousState: 'open',
          newState: 'in_progress',
          stateType: 'order',
        })
      );
    });

    it('should handle multiple state changes in one webhook', async () => {
      const multiChangePayload = {
        ...orderStateChangedPayload,
        data: {
          ...orderStateChangedPayload.data,
          payload: [
            {
              entityId: 'order-123',
              fromStateMachineState: { technicalName: 'open' },
              toStateMachineState: { technicalName: 'in_progress' },
              order: { id: 'order-123', orderNumber: 'ORD-10001' },
            },
            {
              entityId: 'order-456',
              fromStateMachineState: { technicalName: 'in_progress' },
              toStateMachineState: { technicalName: 'completed' },
              order: { id: 'order-456', orderNumber: 'ORD-10002' },
            },
          ],
        },
      };

      (shopRepository.findByShopId as unknown as Mock).mockResolvedValue(mockShop);
      (orderStatusSyncService.handleOrderStateChange as unknown as Mock).mockResolvedValue({ success: true });

      const signature = createSignature(multiChangePayload, mockShop.secretKey);

      const response = await request(app)
        .post('/webhooks/shopware/order-state-changed')
        .set('Content-Type', 'application/json')
        .set('shopware-shop-signature', signature)
        .send(multiChangePayload);

      expect(response.status).toBe(200);
      expect(orderStatusSyncService.handleOrderStateChange).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST /webhooks/shopware/order-delivery-state-changed', () => {
    const deliveryStateChangedPayload = {
      source: {
        shopId: 'test-shop-123',
        url: 'https://shop.example.com',
        appVersion: '1.0.0',
      },
      data: {
        event: 'state_machine.order_delivery.state_changed',
        payload: [
          {
            entityId: 'delivery-123',
            fromStateMachineState: { technicalName: 'open' },
            toStateMachineState: { technicalName: 'shipped' },
            order: { id: 'order-123', orderNumber: 'ORD-10001' },
            trackingCodes: ['TRACK123456'],
            shippingMethod: { name: 'DHL Express' },
          },
        ],
      },
    };

    it('should process delivery state change webhook with tracking', async () => {
      (shopRepository.findByShopId as unknown as Mock).mockResolvedValue(mockShop);
      (orderStatusSyncService.handleDeliveryStateChange as unknown as Mock).mockResolvedValue({
        success: true,
        event: 'order.shipped',
      });

      const signature = createSignature(deliveryStateChangedPayload, mockShop.secretKey);

      const response = await request(app)
        .post('/webhooks/shopware/order-delivery-state-changed')
        .set('Content-Type', 'application/json')
        .set('shopware-shop-signature', signature)
        .send(deliveryStateChangedPayload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
      expect(orderStatusSyncService.handleDeliveryStateChange).toHaveBeenCalledWith(
        'test-shop-123',
        expect.objectContaining({
          orderId: 'order-123',
          newState: 'shipped',
          stateType: 'delivery',
          trackingCodes: ['TRACK123456'],
          carrier: 'DHL Express',
        })
      );
    });
  });

  describe('POST /webhooks/shopware/order-transaction-state-changed', () => {
    const transactionStateChangedPayload = {
      source: {
        shopId: 'test-shop-123',
        url: 'https://shop.example.com',
        appVersion: '1.0.0',
      },
      data: {
        event: 'state_machine.order_transaction.state_changed',
        payload: [
          {
            entityId: 'transaction-123',
            fromStateMachineState: { technicalName: 'open' },
            toStateMachineState: { technicalName: 'paid' },
            order: { id: 'order-123', orderNumber: 'ORD-10001' },
          },
        ],
      },
    };

    it('should process transaction state change webhook', async () => {
      (shopRepository.findByShopId as unknown as Mock).mockResolvedValue(mockShop);
      (orderStatusSyncService.handleTransactionStateChange as unknown as Mock).mockResolvedValue({
        success: true,
        event: 'order.updated',
      });

      const signature = createSignature(transactionStateChangedPayload, mockShop.secretKey);

      const response = await request(app)
        .post('/webhooks/shopware/order-transaction-state-changed')
        .set('Content-Type', 'application/json')
        .set('shopware-shop-signature', signature)
        .send(transactionStateChangedPayload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
      expect(orderStatusSyncService.handleTransactionStateChange).toHaveBeenCalledWith(
        'test-shop-123',
        expect.objectContaining({
          orderId: 'order-123',
          newState: 'paid',
          stateType: 'transaction',
        })
      );
    });
  });

  describe('GET /webhooks/deliveries', () => {
    const mockDeliveries = [
      {
        id: 'delivery-1',
        event: 'order.shipped',
        status: 'sent',
        targetUrl: 'https://platform.example.com/webhooks/order/shipped',
        attempts: 1,
        lastError: null,
        createdAt: new Date(),
        deliveredAt: new Date(),
      },
      {
        id: 'delivery-2',
        event: 'order.updated',
        status: 'failed',
        targetUrl: 'https://platform.example.com/webhooks/order/updated',
        attempts: 5,
        lastError: 'Connection timeout',
        createdAt: new Date(),
        deliveredAt: null,
      },
    ];

    it('should list webhook deliveries for a shop', async () => {
      (webhookDeliveryRepository.findMany as unknown as Mock).mockResolvedValue(mockDeliveries);

      const response = await request(app)
        .get('/webhooks/deliveries')
        .query({ shop_id: 'test-shop-123' });

      expect(response.status).toBe(200);
      expect(response.body.deliveries).toHaveLength(2);
      expect(webhookDeliveryRepository.findMany).toHaveBeenCalledWith(
        { shopId: 'test-shop-123', status: undefined },
        { limit: 50 }
      );
    });

    it('should filter deliveries by status', async () => {
      (webhookDeliveryRepository.findMany as unknown as Mock).mockResolvedValue([mockDeliveries[1]]);

      const response = await request(app)
        .get('/webhooks/deliveries')
        .query({ shop_id: 'test-shop-123', status: 'failed' });

      expect(response.status).toBe(200);
      expect(webhookDeliveryRepository.findMany).toHaveBeenCalledWith(
        { shopId: 'test-shop-123', status: 'failed' },
        { limit: 50 }
      );
    });

    it('should respect limit parameter', async () => {
      (webhookDeliveryRepository.findMany as unknown as Mock).mockResolvedValue(mockDeliveries);

      const response = await request(app)
        .get('/webhooks/deliveries')
        .query({ shop_id: 'test-shop-123', limit: '10' });

      expect(response.status).toBe(200);
      expect(webhookDeliveryRepository.findMany).toHaveBeenCalledWith(
        expect.any(Object),
        { limit: 10 }
      );
    });

    it('should return 400 when shop_id is missing', async () => {
      const response = await request(app).get('/webhooks/deliveries');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('shop_id is required');
    });
  });

  describe('GET /webhooks/stats', () => {
    const mockStats = {
      total: 100,
      sent: 85,
      failed: 10,
      pending: 5,
    };

    it('should return webhook statistics for a shop', async () => {
      (webhookService.getStats as unknown as Mock).mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/webhooks/stats')
        .query({ shop_id: 'test-shop-123' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStats);
      expect(webhookService.getStats).toHaveBeenCalledWith('test-shop-123');
    });

    it('should return 400 when shop_id is missing', async () => {
      const response = await request(app).get('/webhooks/stats');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('shop_id is required');
    });
  });

  describe('POST /webhooks/deliveries/:id/retry', () => {
    it('should retry a failed delivery', async () => {
      (webhookService.retryDelivery as unknown as Mock).mockResolvedValue(true);

      const response = await request(app).post('/webhooks/deliveries/delivery-123/retry');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Delivery retried successfully');
      expect(webhookService.retryDelivery).toHaveBeenCalledWith('delivery-123');
    });

    it('should handle retry queued for later', async () => {
      (webhookService.retryDelivery as unknown as Mock).mockResolvedValue(false);

      const response = await request(app).post('/webhooks/deliveries/delivery-123/retry');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Retry queued');
    });

    it('should handle delivery not found error', async () => {
      (webhookService.retryDelivery as unknown as Mock).mockRejectedValue(
        new Error('Delivery not found')
      );

      const response = await request(app).post('/webhooks/deliveries/non-existent/retry');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Delivery not found');
    });

    it('should handle already successful delivery error', async () => {
      (webhookService.retryDelivery as unknown as Mock).mockRejectedValue(
        new Error('Delivery already successful')
      );

      const response = await request(app).post('/webhooks/deliveries/delivery-123/retry');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Delivery already successful');
    });
  });
});
