/**
 * Webhooks Routes
 * Handles incoming webhooks from Shopware and outgoing webhooks to platforms
 */

import { Router, type Request, type Response } from 'express';
import { shopRepository } from '../repositories/ShopRepository.js';
import { sessionRepository } from '../repositories/SessionRepository.js';
import { validateWebhookSignature } from '../middleware/signatureValidation.js';
import { logger } from '../utils/logger.js';
import type { ShopwareWebhookPayload, ShopwareOrder } from '../types/shopware.js';
import type { OrderWebhookPayload } from '../types/ucp.js';
import { keyManager } from '../services/KeyManager.js';

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
    const isValid = await validateWebhookRequest(req, shop.secretKey);
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

        // Dispatch webhook to platform
        await dispatchOrderWebhook(shopId, ucpSessionId, {
          event: 'order.updated',
          order: {
            id: order.id,
            ucp_session_id: ucpSessionId,
            order_number: order.orderNumber,
            status: 'confirmed',
          },
          timestamp: new Date().toISOString(),
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

    const stateChanges = payload.data.payload as unknown as Array<{
      entityId: string;
      toStateMachineState: { technicalName: string };
    }>;

    for (const change of stateChanges) {
      const orderId = change.entityId;
      const newState = change.toStateMachineState.technicalName;

      // Find UCP session for this order
      const sessions = await sessionRepository.findByShop(shopId, { limit: 1000 });
      const session = sessions.find((s) => s.shopwareOrderId === orderId);

      if (session) {
        const ucpStatus = mapShopwareStateToUcp(newState);

        logger.info(
          { orderId, ucpSessionId: session.ucpSessionId, newState, ucpStatus },
          'Order state changed'
        );

        await dispatchOrderWebhook(shopId, session.ucpSessionId, {
          event: getEventForState(ucpStatus),
          order: {
            id: orderId,
            ucp_session_id: session.ucpSessionId,
            order_number: session.shopwareOrderNumber ?? '',
            status: ucpStatus,
          },
          timestamp: new Date().toISOString(),
        });
      }
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

    const deliveryChanges = payload.data.payload as unknown as Array<{
      entityId: string;
      toStateMachineState: { technicalName: string };
      order?: { id: string; orderNumber: string };
      trackingCodes?: string[];
    }>;

    for (const change of deliveryChanges) {
      const newState = change.toStateMachineState.technicalName;
      const orderId = change.order?.id;

      if (!orderId) continue;

      const sessions = await sessionRepository.findByShop(shopId, { limit: 1000 });
      const session = sessions.find((s) => s.shopwareOrderId === orderId);

      if (session) {
        let event: OrderWebhookPayload['event'] = 'order.updated';

        if (newState === 'shipped') {
          event = 'order.shipped';
        } else if (newState === 'delivered') {
          event = 'order.delivered';
        }

        const tracking =
          change.trackingCodes?.map((code) => ({
            carrier: 'Unknown', // Would need to look up shipping method
            tracking_number: code,
            tracking_url: undefined,
          })) ?? undefined;

        await dispatchOrderWebhook(shopId, session.ucpSessionId, {
          event,
          order: {
            id: orderId,
            ucp_session_id: session.ucpSessionId,
            order_number: session.shopwareOrderNumber ?? '',
            status: newState === 'delivered' ? 'delivered' : 'shipped',
            tracking,
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Failed to process delivery state webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate webhook request signature
 */
async function validateWebhookRequest(req: Request, shopSecret: string): Promise<boolean> {
  const signature = req.headers['shopware-shop-signature'] as string | undefined;

  if (!signature) {
    return false;
  }

  const { createHmac } = await import('crypto');
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  const expectedSignature = createHmac('sha256', shopSecret).update(rawBody).digest('hex');

  return signature === expectedSignature;
}

/**
 * Map Shopware order state to UCP status
 */
function mapShopwareStateToUcp(shopwareState: string): string {
  const stateMap: Record<string, string> = {
    open: 'confirmed',
    in_progress: 'processing',
    completed: 'delivered',
    cancelled: 'canceled',
  };

  return stateMap[shopwareState] ?? shopwareState;
}

/**
 * Get webhook event type for status
 */
function getEventForState(status: string): OrderWebhookPayload['event'] {
  switch (status) {
    case 'shipped':
      return 'order.shipped';
    case 'delivered':
      return 'order.delivered';
    case 'canceled':
      return 'order.canceled';
    default:
      return 'order.updated';
  }
}

/**
 * Dispatch webhook to platform
 */
async function dispatchOrderWebhook(
  _shopId: string,
  ucpSessionId: string,
  payload: OrderWebhookPayload
): Promise<void> {
  // Get session to find platform webhook URL
  const session = await sessionRepository.findByUcpId(ucpSessionId);

  if (!session?.platformProfileUrl) {
    logger.debug({ ucpSessionId }, 'No platform URL for webhook');
    return;
  }

  try {
    // Sign the payload
    const signedPayload = await keyManager.signPayload(payload as unknown as Record<string, unknown>);

    // Fetch platform profile to get webhook URL
    // In production, this would be cached
    const platformWebhookUrl = `${session.platformProfileUrl}/webhooks/orders`;

    // Send webhook
    const response = await fetch(platformWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-UCP-Signature': signedPayload,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.warn(
        { ucpSessionId, status: response.status, url: platformWebhookUrl },
        'Webhook delivery failed'
      );
      // In production, queue for retry
    } else {
      logger.info({ ucpSessionId, event: payload.event }, 'Webhook delivered');
    }
  } catch (error) {
    logger.error({ error, ucpSessionId }, 'Failed to dispatch webhook');
    // In production, queue for retry
  }
}

export default router;
