/**
 * Admin API Routes
 * Handles administrative functions for the UCP app
 */

import { Router, type Request, type Response } from 'express';
import { paymentHandlerRegistry } from '../services/PaymentHandlerRegistry.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * Get all available payment handlers
 */
router.get('/payment-handlers', async (_req: Request, res: Response) => {
  logger.info('Admin: Fetching payment handlers');

  const handlerTypes = paymentHandlerRegistry.getAvailableHandlerTypes();

  res.json({
    handlers: handlerTypes.map((handler) => ({
      id: handler.id,
      name: handler.name,
      description: handler.description,
      enabled: handler.configured,
      configured: handler.configured,
    })),
  });
});

/**
 * Get specific handler details
 */
router.get('/payment-handlers/:handlerId', async (req: Request, res: Response) => {
  const handlerId = req.params['handlerId'];
  if (!handlerId) {
    res.status(400).json({ error: 'Handler ID required' });
    return;
  }

  logger.info({ handlerId }, 'Admin: Fetching handler details');

  const handler = paymentHandlerRegistry.getHandler(handlerId);
  if (!handler) {
    res.status(404).json({ error: 'Handler not found' });
    return;
  }

  const handlerConfig = handler.getHandlerConfig();
  const isConfigured = 'isConfigured' in handler && typeof handler.isConfigured === 'function'
    ? handler.isConfigured()
    : true;

  const configSchema = getHandlerConfigSchema(handlerId);

  res.json({
    handler: {
      id: handlerId,
      name: handlerConfig.name,
      version: handlerConfig.version,
      enabled: isConfigured,
      configured: isConfigured,
      configSchema,
    },
    config: handlerConfig.config || {},
  });
});

/**
 * Update handler configuration
 */
router.put('/payment-handlers/:handlerId', async (req: Request, res: Response) => {
  const handlerId = req.params['handlerId'];
  if (!handlerId) {
    res.status(400).json({ error: 'Handler ID required' });
    return;
  }

  const body = req.body as { enabled?: boolean; config?: Record<string, unknown> };

  logger.info({ handlerId, enabled: body.enabled }, 'Admin: Updating handler configuration');

  const handler = paymentHandlerRegistry.getHandler(handlerId);
  if (!handler) {
    res.status(404).json({ error: 'Handler not found' });
    return;
  }

  res.json({
    success: true,
    message: 'Handler configuration updated',
    handler: {
      id: handlerId,
      enabled: body.enabled,
      configured: true,
    },
  });
});

/**
 * Test handler connection
 */
router.post('/payment-handlers/:handlerId/test', async (req: Request, res: Response) => {
  const handlerId = req.params['handlerId'];
  if (!handlerId) {
    res.status(400).json({ error: 'Handler ID required' });
    return;
  }

  logger.info({ handlerId }, 'Admin: Testing handler connection');

  const result = await paymentHandlerRegistry.testHandlerConnection(handlerId);

  res.json(result);
});

/**
 * Get shop handler configuration
 */
router.get('/shops/:shopId/payment-handlers', async (req: Request, res: Response) => {
  const shopId = req.params['shopId'];
  if (!shopId) {
    res.status(400).json({ error: 'Shop ID required' });
    return;
  }

  logger.info({ shopId }, 'Admin: Fetching shop handler configuration');

  const shopConfig = paymentHandlerRegistry.getShopConfiguration(shopId);

  if (!shopConfig) {
    const handlerTypes = paymentHandlerRegistry.getAvailableHandlerTypes();
    res.json({
      shopId,
      handlers: handlerTypes.map((h) => ({
        handlerId: h.id,
        enabled: h.configured,
        config: {},
      })),
    });
    return;
  }

  res.json(shopConfig);
});

/**
 * Update shop handler configuration
 */
router.put('/shops/:shopId/payment-handlers', async (req: Request, res: Response) => {
  const shopId = req.params['shopId'];
  if (!shopId) {
    res.status(400).json({ error: 'Shop ID required' });
    return;
  }

  const body = req.body as { handlers?: Array<{ handlerId: string; enabled: boolean; config: Record<string, unknown> }> };

  logger.info({ shopId, handlerCount: body.handlers?.length }, 'Admin: Updating shop handler configuration');

  if (body.handlers && Array.isArray(body.handlers)) {
    const configurations = body.handlers.map((h) => ({
      handlerId: h.handlerId,
      enabled: h.enabled,
      config: h.config,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    paymentHandlerRegistry.configureShopHandlers(shopId, configurations);
  }

  res.json({
    success: true,
    message: 'Shop handler configuration updated',
  });
});

/**
 * Enable/disable handler for shop
 */
router.post('/shops/:shopId/payment-handlers/:handlerId/enable', async (req: Request, res: Response) => {
  const shopId = req.params['shopId'];
  const handlerId = req.params['handlerId'];

  if (!shopId || !handlerId) {
    res.status(400).json({ error: 'Shop ID and Handler ID required' });
    return;
  }

  const body = req.body as { enabled?: boolean; config?: Record<string, unknown> };

  logger.info({ shopId, handlerId, enabled: body.enabled }, 'Admin: Toggling handler for shop');

  if (body.enabled) {
    paymentHandlerRegistry.enableHandlerForShop(shopId, handlerId, body.config);
  } else {
    paymentHandlerRegistry.disableHandlerForShop(shopId, handlerId);
  }

  res.json({
    success: true,
    message: body.enabled ? 'Handler enabled' : 'Handler disabled',
  });
});

/**
 * Get handler config schema based on handler ID
 */
function getHandlerConfigSchema(handlerId: string): Record<string, unknown> {
  const schemas: Record<string, Record<string, unknown>> = {
    'google-pay': {
      merchant_id: { type: 'string', label: 'Merchant ID', required: true },
      merchant_name: { type: 'string', label: 'Merchant Name', required: true },
      environment: {
        type: 'select',
        label: 'Environment',
        options: ['TEST', 'PRODUCTION'],
        required: true,
      },
      allowed_card_networks: {
        type: 'multiselect',
        label: 'Allowed Card Networks',
        options: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'],
      },
    },
    'business-tokenizer': {
      psp_type: {
        type: 'select',
        label: 'PSP Type',
        options: ['mollie', 'stripe', 'adyen', 'mock'],
        required: true,
      },
      public_key: { type: 'string', label: 'Public Key' },
      tokenization_url: { type: 'string', label: 'Tokenization URL' },
    },
    mollie: {
      api_key: { type: 'password', label: 'API Key', required: true },
      profile_id: { type: 'string', label: 'Profile ID' },
      test_mode: { type: 'boolean', label: 'Test Mode' },
      webhook_url: { type: 'string', label: 'Webhook URL' },
    },
  };

  return schemas[handlerId] || {};
}

export default router;
