/**
 * Checkout Sessions Routes
 * UCP Checkout capability REST endpoints
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { checkoutSessionService } from '../services/CheckoutSessionService.js';
import { logger } from '../utils/logger.js';
import type { UcpAgentHeader, UcpError } from '../types/ucp.js';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createCheckoutSchema = z.object({
  line_items: z.array(
    z.object({
      product_id: z.string(),
      quantity: z.number().int().positive(),
      variant_id: z.string().optional(),
    })
  ).min(1),
  buyer: z
    .object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  currency: z.string().length(3).optional(),
});

const updateCheckoutSchema = z.object({
  shipping_address: z
    .object({
      first_name: z.string(),
      last_name: z.string(),
      street_address: z.string(),
      extended_address: z.string().optional(),
      address_locality: z.string(),
      address_region: z.string().optional(),
      postal_code: z.string(),
      address_country: z.string().length(2),
      phone: z.string().optional(),
    })
    .optional(),
  billing_address: z
    .object({
      first_name: z.string(),
      last_name: z.string(),
      street_address: z.string(),
      extended_address: z.string().optional(),
      address_locality: z.string(),
      address_region: z.string().optional(),
      postal_code: z.string(),
      address_country: z.string().length(2),
      phone: z.string().optional(),
    })
    .optional(),
  selected_fulfillment_option_id: z.string().optional(),
  discounts: z
    .object({
      codes: z.array(z.string()).optional(),
    })
    .optional(),
});

const completeCheckoutSchema = z.object({
  payment_data: z.object({
    id: z.string(),
    handler_id: z.string(),
    type: z.enum(['card', 'wallet', 'bank_transfer']),
    brand: z.string().optional(),
    last_digits: z.string().optional(),
    billing_address: z
      .object({
        first_name: z.string(),
        last_name: z.string(),
        street_address: z.string(),
        extended_address: z.string().optional(),
        address_locality: z.string(),
        address_region: z.string().optional(),
        postal_code: z.string(),
        address_country: z.string().length(2),
        phone: z.string().optional(),
      })
      .optional(),
    credential: z.object({
      type: z.string(),
      token: z.string(),
    }),
  }),
  risk_signals: z
    .object({
      session_id: z.string().optional(),
      score: z.number().optional(),
    })
    .optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse UCP-Agent header
 */
function parseUcpAgentHeader(header: string | undefined): UcpAgentHeader | undefined {
  if (!header) {
    return undefined;
  }

  // Format: profile_url="https://..." capabilities="cap1,cap2"
  const profileMatch = /profile_url="([^"]+)"/.exec(header);
  const capMatch = /capabilities="([^"]+)"/.exec(header);

  if (!profileMatch) {
    return undefined;
  }

  return {
    profile_url: profileMatch[1] ?? '',
    capabilities: capMatch?.[1]?.split(','),
  };
}

/**
 * Get shop ID from request
 * In production, this would come from authentication
 */
function getShopId(req: Request): string {
  // Check X-Shop-ID header (for testing/development)
  const shopIdHeader = req.headers['x-shop-id'] as string | undefined;
  if (shopIdHeader) {
    return shopIdHeader;
  }

  // Default to first registered shop (for development)
  return process.env['DEFAULT_SHOP_ID'] ?? 'default';
}

/**
 * Send error response
 */
function sendError(res: Response, status: number, error: UcpError): void {
  res.status(status).json({
    error: error.code,
    message: error.message,
    details: error.details,
  });
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/v1/checkout-sessions
 * Create a new checkout session
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = createCheckoutSchema.parse(req.body);
    const shopId = getShopId(req);
    const ucpAgent = parseUcpAgentHeader(req.headers['ucp-agent'] as string | undefined);

    logger.info(
      {
        shopId,
        lineItemCount: body.line_items.length,
        platformUrl: ucpAgent?.profile_url,
      },
      'Creating checkout session'
    );

    const session = await checkoutSessionService.create(
      shopId,
      body,
      ucpAgent?.profile_url,
      ucpAgent?.capabilities
    );

    res.status(201).json(session);
  } catch (error) {
    logger.error({ error }, 'Failed to create checkout session');

    if (error instanceof z.ZodError) {
      sendError(res, 400, {
        code: 'validation_error',
        message: 'Invalid request body',
        details: error.errors as unknown as Record<string, unknown>,
      });
      return;
    }

    const ucpError = error as UcpError;
    if (ucpError.code) {
      const status = getStatusForError(ucpError.code);
      sendError(res, status, ucpError);
      return;
    }

    sendError(res, 500, {
      code: 'internal_error',
      message: 'Failed to create checkout session',
    });
  }
});

/**
 * GET /api/v1/checkout-sessions/:id
 * Get checkout session by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await checkoutSessionService.get(id ?? '');

    if (!session) {
      sendError(res, 404, {
        code: 'session_not_found',
        message: 'Checkout session not found',
      });
      return;
    }

    res.json(session);
  } catch (error) {
    logger.error({ error, sessionId: req.params['id'] }, 'Failed to get checkout session');
    sendError(res, 500, {
      code: 'internal_error',
      message: 'Failed to get checkout session',
    });
  }
});

/**
 * PATCH /api/v1/checkout-sessions/:id
 * Update checkout session
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = updateCheckoutSchema.parse(req.body);

    logger.info({ sessionId: id }, 'Updating checkout session');

    const session = await checkoutSessionService.update(id ?? '', body);

    res.json(session);
  } catch (error) {
    const errorDetails = error instanceof Error ? { message: error.message, stack: error.stack } : error;
    logger.error({ error: errorDetails, sessionId: req.params['id'] }, 'Failed to update checkout session');

    if (error instanceof z.ZodError) {
      sendError(res, 400, {
        code: 'validation_error',
        message: 'Invalid request body',
        details: error.errors as unknown as Record<string, unknown>,
      });
      return;
    }

    const ucpError = error as UcpError;
    if (ucpError.code) {
      const status = getStatusForError(ucpError.code);
      sendError(res, status, ucpError);
      return;
    }

    sendError(res, 500, {
      code: 'internal_error',
      message: 'Failed to update checkout session',
    });
  }
});

/**
 * POST /api/v1/checkout-sessions/:id/complete
 * Complete checkout session
 */
router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = completeCheckoutSchema.parse(req.body);

    logger.info({ sessionId: id, handlerId: body.payment_data.handler_id }, 'Completing checkout');

    const result = await checkoutSessionService.complete(id ?? '', body);

    res.json(result);
  } catch (error) {
    logger.error({ error, sessionId: req.params['id'] }, 'Failed to complete checkout session');

    if (error instanceof z.ZodError) {
      sendError(res, 400, {
        code: 'validation_error',
        message: 'Invalid request body',
        details: error.errors as unknown as Record<string, unknown>,
      });
      return;
    }

    const ucpError = error as UcpError;
    if (ucpError.code) {
      const status = getStatusForError(ucpError.code);
      sendError(res, status, ucpError);
      return;
    }

    sendError(res, 500, {
      code: 'internal_error',
      message: 'Failed to complete checkout',
    });
  }
});

/**
 * DELETE /api/v1/checkout-sessions/:id
 * Cancel checkout session
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await checkoutSessionService.cancel(id ?? '');

    res.status(204).send();
  } catch (error) {
    logger.error({ error, sessionId: req.params['id'] }, 'Failed to cancel checkout session');

    const ucpError = error as UcpError;
    if (ucpError.code) {
      const status = getStatusForError(ucpError.code);
      sendError(res, status, ucpError);
      return;
    }

    sendError(res, 500, {
      code: 'internal_error',
      message: 'Failed to cancel checkout session',
    });
  }
});

// ============================================================================
// Error Status Mapping
// ============================================================================

function getStatusForError(code: string): number {
  switch (code) {
    case 'session_not_found':
    case 'product_unavailable':
    case 'variant_unavailable':
    case 'handler_not_found':
      return 404;
    case 'session_expired':
    case 'insufficient_inventory':
    case 'invalid_quantity':
    case 'invalid_address':
    case 'shipping_unavailable':
    case 'invalid_coupon':
      return 400;
    case 'payment_failed':
    case 'requires_3ds':
      return 402;
    default:
      return 500;
  }
}

export default router;
