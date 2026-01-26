/**
 * UCP Profile Route
 * Serves the /.well-known/ucp endpoint
 */

import { Router, type Request, type Response } from 'express';
import { profileBuilder } from '../services/ProfileBuilder.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /.well-known/ucp
 * Returns the UCP profile for this business
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const profile = await profileBuilder.buildProfile({
      enableMcp: process.env['ENABLE_MCP'] !== 'false',
    });

    // Set appropriate cache headers
    res.set({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300', // 5 minutes
      'X-UCP-Version': profile.ucp.version,
    });

    res.json(profile);
  } catch (error) {
    logger.error({ error }, 'Failed to build UCP profile');
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to generate UCP profile',
    });
  }
});

/**
 * GET /.well-known/ucp/health
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] ?? '1.0.0',
  });
});

export default router;
