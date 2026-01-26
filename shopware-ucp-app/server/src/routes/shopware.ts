/**
 * Shopware App Registration Routes
 * Handles app installation, confirmation and webhooks from Shopware
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validateAppSignature, generateProof } from '../middleware/signatureValidation.js';
import { shopRepository } from '../repositories/ShopRepository.js';
import { logger } from '../utils/logger.js';

const router = Router();

const APP_NAME = 'UcpCommerce';

// ============================================================================
// Validation Schemas
// ============================================================================

const registrationQuerySchema = z.object({
  'shop-id': z.string(),
  'shop-url': z.string().url(),
  timestamp: z.string(),
});

const confirmationBodySchema = z.object({
  shopId: z.string(),
  shopUrl: z.string().url(),
  apiKey: z.string(),
  secretKey: z.string(),
  timestamp: z.string().optional(),
});

// ============================================================================
// Registration Endpoint
// ============================================================================

/**
 * GET /shopware/registration
 * Called by Shopware during app installation
 */
router.get('/registration', validateAppSignature, async (req: Request, res: Response) => {
  try {
    const query = registrationQuerySchema.parse(req.query);

    const shopId = query['shop-id'];
    const shopUrl = query['shop-url'];

    logger.info({ shopId, shopUrl }, 'Received registration request');

    // Generate proof
    const proof = generateProof(shopId, shopUrl, APP_NAME);

    // Generate shop secret (random 64 char hex string)
    const shopSecret = [...Array(64)]
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('');

    // Store temporary secret for confirmation
    // In production, use Redis or similar for this
    (global as Record<string, unknown>)[`pending_${shopId}`] = {
      shopUrl,
      shopSecret,
      timestamp: Date.now(),
    };

    // Return registration response
    res.json({
      proof,
      secret: shopSecret,
      confirmation_url: `${process.env['UCP_SERVER_URL']}/shopware/registration/confirm`,
    });
  } catch (error) {
    logger.error({ error }, 'Registration failed');

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request parameters', details: error.errors });
      return;
    }

    res.status(500).json({ error: 'Registration failed' });
  }
});

// ============================================================================
// Confirmation Endpoint
// ============================================================================

/**
 * POST /shopware/registration/confirm
 * Called by Shopware to confirm app installation
 */
router.post('/registration/confirm', async (req: Request, res: Response) => {
  try {
    const body = confirmationBodySchema.parse(req.body);

    logger.info({ shopId: body.shopId }, 'Received registration confirmation');

    // Verify this is a pending registration
    const pending = (global as Record<string, unknown>)[`pending_${body.shopId}`] as
      | { shopUrl: string; shopSecret: string; timestamp: number }
      | undefined;

    if (!pending) {
      logger.warn({ shopId: body.shopId }, 'No pending registration found');
      res.status(400).json({ error: 'No pending registration found' });
      return;
    }

    // Verify shop URL matches
    if (pending.shopUrl !== body.shopUrl) {
      logger.warn({ shopId: body.shopId }, 'Shop URL mismatch');
      res.status(400).json({ error: 'Shop URL mismatch' });
      return;
    }

    // Store shop credentials
    await shopRepository.upsert({
      shopId: body.shopId,
      shopUrl: body.shopUrl,
      apiKey: body.apiKey,
      secretKey: body.secretKey,
      appName: APP_NAME,
    });

    // Clean up pending registration
    delete (global as Record<string, unknown>)[`pending_${body.shopId}`];

    logger.info({ shopId: body.shopId }, 'Shop registered successfully');

    res.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Registration confirmation failed');

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request body', details: error.errors });
      return;
    }

    res.status(500).json({ error: 'Confirmation failed' });
  }
});

// ============================================================================
// Deactivation Endpoint
// ============================================================================

/**
 * POST /shopware/deactivate
 * Called when app is deactivated
 */
router.post('/deactivate', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.body as { shopId?: string };

    if (!shopId) {
      res.status(400).json({ error: 'Shop ID required' });
      return;
    }

    await shopRepository.deactivate(shopId);

    logger.info({ shopId }, 'Shop deactivated');

    res.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Deactivation failed');
    res.status(500).json({ error: 'Deactivation failed' });
  }
});

// ============================================================================
// Uninstall Endpoint
// ============================================================================

/**
 * POST /shopware/uninstall
 * Called when app is uninstalled
 */
router.post('/uninstall', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.body as { shopId?: string };

    if (!shopId) {
      res.status(400).json({ error: 'Shop ID required' });
      return;
    }

    await shopRepository.delete(shopId);

    logger.info({ shopId }, 'Shop uninstalled');

    res.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Uninstall failed');
    res.status(500).json({ error: 'Uninstall failed' });
  }
});

export default router;
