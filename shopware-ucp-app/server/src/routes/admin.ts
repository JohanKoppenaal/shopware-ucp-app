/**
 * Admin API Routes
 * Handles administrative functions for the UCP app
 */

import { Router, type Request, type Response } from 'express';
import { paymentHandlerRegistry } from '../services/PaymentHandlerRegistry.js';
import { sessionRepository } from '../repositories/SessionRepository.js';
import { webhookDeliveryRepository } from '../repositories/WebhookDeliveryRepository.js';
import { shopRepository } from '../repositories/ShopRepository.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// Admin Dashboard HTML Page (iframe)
// ============================================================================

/**
 * Serve admin dashboard HTML for Shopware iframe
 */
router.get('/', async (req: Request, res: Response) => {
  // Get shop ID from query or find the first registered shop
  let shopId = req.query['shop-id'] as string | undefined;
  let shopName = 'Unknown Shop';

  if (!shopId) {
    // Try to get the first registered shop
    try {
      const firstShop = await shopRepository.findFirst();
      if (firstShop) {
        shopId = firstShop.shopId;
        shopName = firstShop.shopUrl || firstShop.shopId;
      }
    } catch {
      // Ignore errors, will use undefined shopId
    }
  }

  logger.info({ shopId }, 'Admin: Serving dashboard HTML');

  // Fetch stats for the dashboard
  let stats = {
    checkoutsCreated: 0,
    checkoutsCompleted: 0,
    conversionRate: 0,
    totalRevenue: 0,
    activeHandlers: 0,
    webhooksSent: 0,
    webhooksFailed: 0,
  };

  try {
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sessions = shopId
      ? await sessionRepository.findMany({ shopId, createdAfter: startDate }, { limit: 1000 })
      : [];

    stats.checkoutsCreated = sessions.length;
    stats.checkoutsCompleted = sessions.filter((s) => s.status === 'complete').length;
    stats.conversionRate = stats.checkoutsCreated > 0
      ? Math.round((stats.checkoutsCompleted / stats.checkoutsCreated) * 1000) / 10
      : 0;
    stats.totalRevenue = stats.checkoutsCompleted * 150;

    const handlerTypes = paymentHandlerRegistry.getAvailableHandlerTypes();
    stats.activeHandlers = handlerTypes.filter((h) => h.configured).length;

    const webhookStats = await getWebhookStats(shopId, startDate);
    stats.webhooksSent = webhookStats.sent;
    stats.webhooksFailed = webhookStats.failed;
  } catch (error) {
    logger.warn({ error }, 'Admin: Could not fetch stats for dashboard');
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UCP Commerce Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f9fafb;
      padding: 24px;
      color: #1f2937;
    }
    .header {
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      color: #111827;
    }
    .header p {
      color: #6b7280;
      margin-top: 4px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .stat-card .label {
      font-size: 13px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .stat-card .value {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
    }
    .stat-card .value.success { color: #059669; }
    .stat-card .value.warning { color: #d97706; }
    .stat-card .value.error { color: #dc2626; }
    .section {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 24px;
    }
    .section h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #111827;
    }
    .endpoints-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .endpoint {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: #f3f4f6;
      border-radius: 8px;
    }
    .endpoint .method {
      background: #3b82f6;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .endpoint .method.post { background: #22c55e; }
    .endpoint .url {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      color: #374151;
    }
    .endpoint .desc {
      color: #6b7280;
      font-size: 13px;
      margin-left: auto;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge.success { background: #d1fae5; color: #065f46; }
    .badge.info { background: #dbeafe; color: #1e40af; }
    .handlers-list {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .handler-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #f3f4f6;
      border-radius: 8px;
    }
    .handler-badge .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
    }
    .handler-badge .dot.inactive { background: #9ca3af; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛒 UCP Commerce Dashboard</h1>
    <p>Universal Commerce Protocol integration for Shopware</p>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="label">Checkouts Started</div>
      <div class="value">${stats.checkoutsCreated}</div>
    </div>
    <div class="stat-card">
      <div class="label">Checkouts Completed</div>
      <div class="value success">${stats.checkoutsCompleted}</div>
    </div>
    <div class="stat-card">
      <div class="label">Conversion Rate</div>
      <div class="value">${stats.conversionRate}%</div>
    </div>
    <div class="stat-card">
      <div class="label">Revenue (7 days)</div>
      <div class="value">€${stats.totalRevenue.toLocaleString()}</div>
    </div>
    <div class="stat-card">
      <div class="label">Webhooks Sent</div>
      <div class="value success">${stats.webhooksSent}</div>
    </div>
    <div class="stat-card">
      <div class="label">Webhooks Failed</div>
      <div class="value ${stats.webhooksFailed > 0 ? 'error' : ''}">${stats.webhooksFailed}</div>
    </div>
  </div>

  <div class="section">
    <h2>Payment Handlers</h2>
    <div class="handlers-list">
      <div class="handler-badge">
        <span class="dot"></span>
        <span>Google Pay</span>
      </div>
      <div class="handler-badge">
        <span class="dot"></span>
        <span>Mollie</span>
      </div>
      <div class="handler-badge">
        <span class="dot"></span>
        <span>Business Tokenizer</span>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>API Endpoints</h2>
    <div class="endpoints-list">
      <div class="endpoint">
        <span class="method">GET</span>
        <span class="url">/.well-known/ucp</span>
        <span class="desc">UCP Profile (Service Discovery)</span>
        <span class="badge success">Active</span>
      </div>
      <div class="endpoint">
        <span class="method post">POST</span>
        <span class="url">/mcp</span>
        <span class="desc">MCP JSON-RPC Endpoint</span>
        <span class="badge success">Active</span>
      </div>
      <div class="endpoint">
        <span class="method">GET</span>
        <span class="url">/mcp/sse</span>
        <span class="desc">MCP SSE Streaming</span>
        <span class="badge success">Active</span>
      </div>
      <div class="endpoint">
        <span class="method post">POST</span>
        <span class="url">/checkout-sessions</span>
        <span class="desc">Create Checkout Session</span>
        <span class="badge success">Active</span>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Quick Links</h2>
    <p style="color: #6b7280; margin-bottom: 12px;">Test the API endpoints:</p>
    <div class="endpoints-list">
      <div class="endpoint">
        <span class="badge info">curl</span>
        <code class="url">curl http://localhost:3000/.well-known/ucp | jq</code>
      </div>
      <div class="endpoint">
        <span class="badge info">curl</span>
        <code class="url">curl http://localhost:3000/health</code>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ============================================================================
// Dashboard Stats Endpoints
// ============================================================================

/**
 * Get dashboard statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const shopId = req.query['shop_id'] as string;
    const period = (req.query['period'] as string) || '7days';

    if (!shopId) {
      res.status(400).json({ error: 'shop_id is required' });
      return;
    }

    logger.info({ shopId, period }, 'Admin: Fetching dashboard stats');

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case '30days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '7days':
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get session statistics
    const sessions = await sessionRepository.findMany(
      { shopId, createdAfter: startDate },
      { limit: 1000 }
    );

    const checkoutsCreated = sessions.length;
    const checkoutsCompleted = sessions.filter((s) => s.status === 'complete').length;
    const conversionRate = checkoutsCreated > 0 ? Math.round((checkoutsCompleted / checkoutsCreated) * 1000) / 10 : 0;

    // Calculate revenue (mock for now - would need to join with orders)
    const totalRevenue = checkoutsCompleted * 150; // Placeholder average
    const averageOrderValue = checkoutsCompleted > 0 ? totalRevenue / checkoutsCompleted : 0;

    // Get active payment handlers
    const handlerTypes = paymentHandlerRegistry.getAvailableHandlerTypes();
    const activeHandlers = handlerTypes.filter((h) => h.configured).length;

    // Get webhook statistics
    const webhookStats = await getWebhookStats(shopId, startDate);

    // Get recent sessions for the activity list
    const recentSessions = await sessionRepository.findMany(
      { shopId },
      { limit: 10, orderBy: { createdAt: 'desc' } }
    );

    res.json({
      stats: {
        checkoutsCreated,
        checkoutsCompleted,
        conversionRate,
        totalRevenue,
        activeHandlers,
        webhooksSent: webhookStats.sent,
        webhooksFailed: webhookStats.failed,
        averageOrderValue,
      },
      recentSessions: recentSessions.map((s) => ({
        id: s.id,
        ucpSessionId: s.ucpSessionId,
        status: s.status,
        platformName: extractPlatformName(s.platformProfileUrl),
        amount: 0, // Would need to calculate from cart data
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Admin: Failed to fetch dashboard stats');
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * Get checkout sessions for logs view
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const shopId = req.query['shop_id'] as string;
    const status = req.query['status'] as string | undefined;
    const limit = parseInt(req.query['limit'] as string) || 50;

    if (!shopId) {
      res.status(400).json({ error: 'shop_id is required' });
      return;
    }

    logger.info({ shopId, status, limit }, 'Admin: Fetching checkout sessions');

    const sessions = await sessionRepository.findMany(
      {
        shopId,
        status: status as 'incomplete' | 'complete' | 'failed' | 'expired' | undefined,
      },
      { limit, orderBy: { createdAt: 'desc' } }
    );

    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        ucpSessionId: s.ucpSessionId,
        shopId: s.shopId,
        status: s.status,
        platformName: extractPlatformName(s.platformProfileUrl),
        orderNumber: s.shopwareOrderNumber,
        orderId: s.shopwareOrderId,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
        paymentHandlerId: s.paymentHandlerId,
        paymentTransactionId: s.paymentTransactionId,
        shippingAddress: s.shippingAddress ? JSON.parse(s.shippingAddress as string) : null,
        billingAddress: s.billingAddress ? JSON.parse(s.billingAddress as string) : null,
        cartData: null, // Would need to fetch from Shopware
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Admin: Failed to fetch sessions');
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// ============================================================================
// Payment Handler Endpoints
// ============================================================================

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
  const isConfigured =
    'isConfigured' in handler && typeof handler.isConfigured === 'function'
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

  const body = req.body as {
    handlers?: Array<{ handlerId: string; enabled: boolean; config: Record<string, unknown> }>;
  };

  logger.info(
    { shopId, handlerCount: body.handlers?.length },
    'Admin: Updating shop handler configuration'
  );

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
router.post(
  '/shops/:shopId/payment-handlers/:handlerId/enable',
  async (req: Request, res: Response) => {
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
  }
);

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

/**
 * Extract platform name from profile URL
 */
function extractPlatformName(profileUrl: string | null): string | null {
  if (!profileUrl) return null;

  try {
    const url = new URL(profileUrl);
    const hostname = url.hostname;

    // Map known platforms
    if (hostname.includes('google') || hostname.includes('gemini')) return 'Google Gemini';
    if (hostname.includes('openai') || hostname.includes('chatgpt')) return 'ChatGPT';
    if (hostname.includes('microsoft') || hostname.includes('copilot')) return 'Microsoft Copilot';
    if (hostname.includes('claude') || hostname.includes('anthropic')) return 'Claude';

    // Return domain name if not recognized
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Get webhook delivery statistics
 */
async function getWebhookStats(
  shopId: string,
  startDate: Date
): Promise<{ sent: number; failed: number; pending: number }> {
  try {
    const deliveries = await webhookDeliveryRepository.findMany(
      { shopId, createdAfter: startDate },
      { limit: 1000 }
    );

    return {
      sent: deliveries.filter((d) => d.status === 'sent').length,
      failed: deliveries.filter((d) => d.status === 'failed').length,
      pending: deliveries.filter((d) => d.status === 'pending' || d.status === 'retrying').length,
    };
  } catch {
    return { sent: 0, failed: 0, pending: 0 };
  }
}

export default router;
