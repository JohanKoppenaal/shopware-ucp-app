/**
 * Signature Validation Middleware
 * Validates Shopware webhook signatures and app registration requests
 */

import { createHmac } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

const APP_SECRET = process.env['APP_SECRET'] ?? '';

/**
 * Validates the shopware-app-signature header for registration requests
 */
export function validateAppSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['shopware-app-signature'] as string | undefined;

  if (!signature) {
    logger.warn('Missing shopware-app-signature header');
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  const queryString = new URL(req.url, `http://${req.headers.host}`).search.slice(1);
  const expectedSignature = createHmac('sha256', APP_SECRET).update(queryString).digest('hex');

  if (signature !== expectedSignature) {
    logger.warn({ expected: expectedSignature, received: signature }, 'Invalid app signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}

/**
 * Validates the shopware-shop-signature header for webhook requests
 */
export function validateWebhookSignature(shopSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers['shopware-shop-signature'] as string | undefined;

    if (!signature) {
      logger.warn('Missing shopware-shop-signature header');
      res.status(401).json({ error: 'Missing signature' });
      return;
    }

    // Get raw body for signature validation
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
    const expectedSignature = createHmac('sha256', shopSecret).update(rawBody).digest('hex');

    if (signature !== expectedSignature) {
      logger.warn('Invalid webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    next();
  };
}

/**
 * Generates a proof for app registration response
 */
export function generateProof(shopId: string, shopUrl: string, appName: string): string {
  const data = `${shopId}${shopUrl}${appName}`;
  return createHmac('sha256', APP_SECRET).update(data).digest('hex');
}

/**
 * Generates a signature for outgoing webhook requests
 */
export function signWebhookPayload(payload: string, signingKey: string): string {
  return createHmac('sha256', signingKey).update(payload).digest('hex');
}
