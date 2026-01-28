/**
 * Webhooks Routes
 * Handles incoming webhooks from Shopware and outgoing webhooks to platforms
 */

import { Router, type Request, type Response } from 'express';
import { createHmac } from 'crypto';
import { shopRepository } from '../repositories/ShopRepository.js';
import { webhookDeliveryRepository } from '../repositories/WebhookDeliveryRepository.js';
import {
  orderStatusSyncService,
  type OrderStateChange,
} from '../services/OrderStatusSyncService.js';
import { webhookService } from '../services/WebhookService.js';
import { logger } from '../utils/logger.js';
import type { ShopwareWebhookPayload, ShopwareOrder } from '../types/shopware.js';

const router = Router();

// ============================================================================
// Shopware Webhook Handlers
// ============================================================================

/**
 * POST /webhooks/shopware/order-placed
 * Called when a new order is placed in Shopware
 */
router.post('/shopware/order-placed', async (req: Request, res: Response) => {
  try {
    const payload = req.body as ShopwareWebhookPayload;
    const shopId = payload.source.shopId;

    // Verify shop exists
    const shop = await shopRepository.findByShopId(shopId);
    if (!shop) {
      logger.warn({ shopId }, 'Unknown shop for webhook');
      res.status(404).json({ error: 'Shop not found' });
      return;
    }

    // Validate signature
    const isValid = validateWebhookRequest(req, shop.secretKey);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const orders = payload.data.payload as unknown as ShopwareOrder[];

    for (const order of orders) {
      // Check if this is a UCP order
      const ucpSessionId = order.customFields?.['ucp_session_id'] as string | undefined;

      if (ucpSessionId) {
        logger.info({ orderId: order.id, ucpSessionId }, 'UCP order placed');

        // Sync the order creation to platform
        await orderStatusSyncService.handleOrderStateChange(shopId, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          previousState: '',
          newState: 'open',
          stateType: 'order',
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Failed to process order placed webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /webhooks/shopware/order-state-changed
 * Called when order state changes
 */
router.post('/shopware/order-state-changed', async (req: Request, res: Response) => {
  try {
    const payload = req.body as ShopwareWebhookPayload;
    const shopId = payload.source.shopId;

    const shop = await shopRepository.findByShopId(shopId);
    if (!shop) {
      res.status(404).json({ error: 'Shop not found' });
      return;
    }

    const isValid = validateWebhookRequest(req, shop.secretKey);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const stateChanges = payload.data.payload as unknown as Array<{
      entityId: string;
      fromStateMachineState?: { technicalName: string };
      toStateMachineState: { technicalName: string };
      order?: { id: string; orderNumber: string };
    }>;

    for (const change of stateChanges) {
      const orderId = change.entityId ?? change.order?.id;
      if (!orderId) continue;

      const stateChange: OrderStateChange = {
        orderId,
        orderNumber: change.order?.orderNumber,
        previousState: change.fromStateMachineState?.technicalName ?? '',
        newState: change.toStateMachineState.technicalName,
        stateType: 'order',
      };

      await orderStatusSyncService.handleOrderStateChange(shopId, stateChange);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Failed to process state change webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /webhooks/shopware/order-delivery-state-changed
 * Called when delivery state changes (shipped, delivered, etc.)
 */
router.post('/shopware/order-delivery-state-changed', async (req: Request, res: Response) => {
  try {
    const payload = req.body as ShopwareWebhookPayload;
    const shopId = payload.source.shopId;

    const shop = await shopRepository.findByShopId(shopId);
    if (!shop) {
      res.status(404).json({ error: 'Shop not found' });
      return;
    }

    const isValid = validateWebhookRequest(req, shop.secretKey);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const deliveryChanges = payload.data.payload as unknown as Array<{
      entityId: string;
      fromStateMachineState?: { technicalName: string };
      toStateMachineState: { technicalName: string };
      order?: { id: string; orderNumber: string };
      trackingCodes?: string[];
      shippingMethod?: { name: string };
    }>;

    for (const change of deliveryChanges) {
      const orderId = change.order?.id;
      if (!orderId) continue;

      const stateChange: OrderStateChange = {
        orderId,
        orderNumber: change.order?.orderNumber,
        previousState: change.fromStateMachineState?.technicalName ?? '',
        newState: change.toStateMachineState.technicalName,
        stateType: 'delivery',
        trackingCodes: change.trackingCodes,
        carrier: change.shippingMethod?.name,
      };

      await orderStatusSyncService.handleDeliveryStateChange(shopId, stateChange);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Failed to process delivery state webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /webhooks/shopware/order-transaction-state-changed
 * Called when payment/transaction state changes
 */
router.post('/shopware/order-transaction-state-changed', async (req: Request, res: Response) => {
  try {
    const payload = req.body as ShopwareWebhookPayload;
    const shopId = payload.source.shopId;

    const shop = await shopRepository.findByShopId(shopId);
    if (!shop) {
      res.status(404).json({ error: 'Shop not found' });
      return;
    }

    const isValid = validateWebhookRequest(req, shop.secretKey);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const transactionChanges = payload.data.payload as unknown as Array<{
      entityId: string;
      fromStateMachineState?: { technicalName: string };
      toStateMachineState: { technicalName: string };
      order?: { id: string; orderNumber: string };
    }>;

    for (const change of transactionChanges) {
      const orderId = change.order?.id;
      if (!orderId) continue;

      const stateChange: OrderStateChange = {
        orderId,
        orderNumber: change.order?.orderNumber,
        previousState: change.fromStateMachineState?.technicalName ?? '',
        newState: change.toStateMachineState.technicalName,
        stateType: 'transaction',
      };

      await orderStatusSyncService.handleTransactionStateChange(shopId, stateChange);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Failed to process transaction state webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /webhooks/shopware/product-written
 * Called when products are created or updated (for catalog sync)
 */
router.post('/shopware/product-written', async (req: Request, res: Response) => {
  try {
    const payload = req.body as ShopwareWebhookPayload;
    const shopId = payload.source.shopId;

    const shop = await shopRepository.findByShopId(shopId);
    if (!shop) {
      res.status(404).json({ error: 'Shop not found' });
      return;
    }

    const isValid = validateWebhookRequest(req, shop.secretKey);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Product sync would be handled here
    // For now, just acknowledge receipt
    const products = payload.data.payload as unknown as Array<{ id: string }>;
    logger.info({ shopId, productCount: products.length }, 'Product update received');

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Failed to process product written webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================================================
// Webhook Management Endpoints
// ============================================================================

/**
 * GET /webhooks/deliveries
 * List webhook deliveries for a shop
 */
router.get('/deliveries', async (req: Request, res: Response) => {
  try {
    const shopId = req.query['shop_id'] as string;
    const status = req.query['status'] as string | undefined;
    const limit = parseInt(req.query['limit'] as string) || 50;

    if (!shopId) {
      res.status(400).json({ error: 'shop_id is required' });
      return;
    }

    const deliveries = await webhookDeliveryRepository.findMany(
      {
        shopId,
        status: status as 'pending' | 'sent' | 'failed' | 'retrying' | undefined,
      },
      { limit }
    );

    res.json({
      deliveries: deliveries.map((d) => ({
        id: d.id,
        event: d.event,
        status: d.status,
        target_url: d.targetUrl,
        attempts: d.attempts,
        last_error: d.lastError,
        created_at: d.createdAt,
        delivered_at: d.deliveredAt,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list webhook deliveries');
    res.status(500).json({ error: 'Failed to list deliveries' });
  }
});

/**
 * GET /webhooks/stats
 * Get webhook delivery statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const shopId = req.query['shop_id'] as string;

    if (!shopId) {
      res.status(400).json({ error: 'shop_id is required' });
      return;
    }

    const stats = await webhookService.getStats(shopId);

    res.json(stats);
  } catch (error) {
    logger.error({ error }, 'Failed to get webhook stats');
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * POST /webhooks/deliveries/:id/retry
 * Retry a failed webhook delivery
 */
router.post('/deliveries/:id/retry', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: 'delivery_id is required' });
      return;
    }

    const success = await webhookService.retryDelivery(id);

    res.json({
      success,
      message: success ? 'Delivery retried successfully' : 'Retry queued',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, deliveryId: req.params['id'] }, 'Failed to retry delivery');
    res.status(400).json({ error: errorMessage });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate webhook request signature
 */
function validateWebhookRequest(req: Request, shopSecret: string): boolean {
  const signature = req.headers['shopware-shop-signature'] as string | undefined;

  if (!signature) {
    return false;
  }

  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  const expectedSignature = createHmac('sha256', shopSecret).update(rawBody).digest('hex');

  return signature === expectedSignature;
}

export default router;
