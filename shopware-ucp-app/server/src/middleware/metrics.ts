/**
 * Prometheus Metrics Middleware
 * Collects and exposes application metrics for monitoring
 */

import { type Request, type Response, type NextFunction } from 'express';
import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

// Create a custom registry
export const metricsRegistry = new Registry();

// Collect default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register: metricsRegistry });

// ============================================================================
// HTTP Request Metrics
// ============================================================================

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code'],
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpRequestSize = new Histogram({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP request bodies in bytes',
  labelNames: ['method', 'path'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000],
  registers: [metricsRegistry],
});

export const httpResponseSize = new Histogram({
  name: 'http_response_size_bytes',
  help: 'Size of HTTP response bodies in bytes',
  labelNames: ['method', 'path'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000],
  registers: [metricsRegistry],
});

// ============================================================================
// UCP Checkout Metrics
// ============================================================================

export const checkoutSessionsCreated = new Counter({
  name: 'ucp_checkout_sessions_created_total',
  help: 'Total number of checkout sessions created',
  labelNames: ['shop_id'],
  registers: [metricsRegistry],
});

export const checkoutSessionsCompleted = new Counter({
  name: 'ucp_checkout_sessions_completed_total',
  help: 'Total number of checkout sessions completed successfully',
  labelNames: ['shop_id'],
  registers: [metricsRegistry],
});

export const checkoutSessionsCancelled = new Counter({
  name: 'ucp_checkout_sessions_cancelled_total',
  help: 'Total number of checkout sessions cancelled',
  labelNames: ['shop_id'],
  registers: [metricsRegistry],
});

export const checkoutSessionsExpired = new Counter({
  name: 'ucp_checkout_sessions_expired_total',
  help: 'Total number of checkout sessions that expired',
  labelNames: ['shop_id'],
  registers: [metricsRegistry],
});

export const activeCheckoutSessions = new Gauge({
  name: 'ucp_checkout_sessions_active',
  help: 'Number of currently active checkout sessions',
  labelNames: ['shop_id'],
  registers: [metricsRegistry],
});

export const checkoutDuration = new Histogram({
  name: 'ucp_checkout_duration_seconds',
  help: 'Duration from session creation to completion in seconds',
  labelNames: ['shop_id'],
  buckets: [10, 30, 60, 120, 300, 600, 1800, 3600],
  registers: [metricsRegistry],
});

// ============================================================================
// Payment Metrics
// ============================================================================

export const paymentsProcessed = new Counter({
  name: 'ucp_payments_processed_total',
  help: 'Total number of payments processed',
  labelNames: ['handler_id', 'status', 'type'],
  registers: [metricsRegistry],
});

export const paymentDuration = new Histogram({
  name: 'ucp_payment_duration_seconds',
  help: 'Duration of payment processing in seconds',
  labelNames: ['handler_id'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

export const paymentAmount = new Histogram({
  name: 'ucp_payment_amount',
  help: 'Payment amounts in cents',
  labelNames: ['currency'],
  buckets: [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000],
  registers: [metricsRegistry],
});

// ============================================================================
// Webhook Metrics
// ============================================================================

export const webhooksReceived = new Counter({
  name: 'ucp_webhooks_received_total',
  help: 'Total number of webhooks received from Shopware',
  labelNames: ['event', 'shop_id'],
  registers: [metricsRegistry],
});

export const webhooksDelivered = new Counter({
  name: 'ucp_webhooks_delivered_total',
  help: 'Total number of webhooks delivered to platforms',
  labelNames: ['event', 'status'],
  registers: [metricsRegistry],
});

export const webhookDeliveryDuration = new Histogram({
  name: 'ucp_webhook_delivery_duration_seconds',
  help: 'Duration of webhook delivery attempts in seconds',
  labelNames: ['event'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

export const webhookRetryQueue = new Gauge({
  name: 'ucp_webhook_retry_queue_size',
  help: 'Number of webhooks waiting in retry queue',
  registers: [metricsRegistry],
});

// ============================================================================
// Shopware API Metrics
// ============================================================================

export const shopwareApiRequests = new Counter({
  name: 'ucp_shopware_api_requests_total',
  help: 'Total number of requests to Shopware API',
  labelNames: ['method', 'endpoint', 'status_code'],
  registers: [metricsRegistry],
});

export const shopwareApiDuration = new Histogram({
  name: 'ucp_shopware_api_duration_seconds',
  help: 'Duration of Shopware API requests in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const shopwareApiErrors = new Counter({
  name: 'ucp_shopware_api_errors_total',
  help: 'Total number of Shopware API errors',
  labelNames: ['endpoint', 'error_type'],
  registers: [metricsRegistry],
});

// ============================================================================
// Middleware
// ============================================================================

/**
 * Express middleware to collect request metrics
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip metrics endpoint itself to prevent recursion
    if (req.path === '/metrics' || req.path === '/health') {
      next();
      return;
    }

    const startTime = process.hrtime();

    // Track request size
    const requestSize = parseInt(req.headers['content-length'] ?? '0', 10);
    if (requestSize > 0) {
      httpRequestSize.labels(req.method, normalizePath(req.path)).observe(requestSize);
    }

    // Hook into response finish
    res.on('finish', () => {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const durationInSeconds = seconds + nanoseconds / 1e9;

      const path = normalizePath(req.path);
      const statusCode = res.statusCode.toString();

      // Record metrics
      httpRequestsTotal.labels(req.method, path, statusCode).inc();
      httpRequestDuration.labels(req.method, path, statusCode).observe(durationInSeconds);

      // Track response size
      const responseSize = parseInt((res.getHeader('content-length') as string) ?? '0', 10);
      if (responseSize > 0) {
        httpResponseSize.labels(req.method, path).observe(responseSize);
      }
    });

    next();
  };
}

/**
 * Normalize path to reduce cardinality
 * Replace UUIDs and numeric IDs with placeholders
 */
function normalizePath(path: string): string {
  return (
    path
      // Replace UUIDs
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      // Replace numeric IDs
      .replace(/\/\d+/g, '/:id')
      // Replace session IDs (typically ucp-xxxx format)
      .replace(/\/ucp-[a-z0-9-]+/gi, '/:session_id')
  );
}

/**
 * Express handler to expose metrics endpoint
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    const metrics = await metricsRegistry.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end('Error collecting metrics');
  }
}

// ============================================================================
// Helper Functions for Recording Metrics
// ============================================================================

/**
 * Record checkout session created
 */
export function recordCheckoutCreated(shopId: string): void {
  checkoutSessionsCreated.labels(shopId).inc();
}

/**
 * Record checkout session completed
 */
export function recordCheckoutCompleted(shopId: string, durationSeconds?: number): void {
  checkoutSessionsCompleted.labels(shopId).inc();
  if (durationSeconds !== undefined) {
    checkoutDuration.labels(shopId).observe(durationSeconds);
  }
}

/**
 * Record checkout session cancelled
 */
export function recordCheckoutCancelled(shopId: string): void {
  checkoutSessionsCancelled.labels(shopId).inc();
}

/**
 * Record payment processed
 */
export function recordPayment(
  handlerId: string,
  status: 'success' | 'failed' | 'requires_action',
  type: string,
  durationSeconds?: number,
  amountCents?: number,
  currency?: string
): void {
  paymentsProcessed.labels(handlerId, status, type).inc();

  if (durationSeconds !== undefined) {
    paymentDuration.labels(handlerId).observe(durationSeconds);
  }

  if (amountCents !== undefined && currency) {
    paymentAmount.labels(currency).observe(amountCents);
  }
}

/**
 * Record webhook received from Shopware
 */
export function recordWebhookReceived(event: string, shopId: string): void {
  webhooksReceived.labels(event, shopId).inc();
}

/**
 * Record webhook delivery attempt
 */
export function recordWebhookDelivery(
  event: string,
  success: boolean,
  durationSeconds?: number
): void {
  webhooksDelivered.labels(event, success ? 'success' : 'failed').inc();

  if (durationSeconds !== undefined) {
    webhookDeliveryDuration.labels(event).observe(durationSeconds);
  }
}

/**
 * Update webhook retry queue size
 */
export function updateWebhookQueueSize(size: number): void {
  webhookRetryQueue.set(size);
}

/**
 * Record Shopware API request
 */
export function recordShopwareApiRequest(
  method: string,
  endpoint: string,
  statusCode: number,
  durationSeconds: number
): void {
  shopwareApiRequests.labels(method, endpoint, statusCode.toString()).inc();
  shopwareApiDuration.labels(method, endpoint).observe(durationSeconds);
}

/**
 * Record Shopware API error
 */
export function recordShopwareApiError(endpoint: string, errorType: string): void {
  shopwareApiErrors.labels(endpoint, errorType).inc();
}
