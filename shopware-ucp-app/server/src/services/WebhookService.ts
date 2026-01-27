/**
 * Webhook Service
 * Manages webhook delivery with retry queue and delivery tracking
 */

import { webhookDeliveryRepository } from '../repositories/WebhookDeliveryRepository.js';
import { sessionRepository } from '../repositories/SessionRepository.js';
import { keyManager } from './KeyManager.js';
import { logger } from '../utils/logger.js';
import type { OrderWebhookPayload } from '../types/ucp.js';
import type { WebhookDelivery } from '@prisma/client';

// Retry configuration
const MAX_RETRY_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 3600000; // 1 hour
const RETRY_BACKOFF_MULTIPLIER = 2;

export interface WebhookDeliveryResult {
  success: boolean;
  deliveryId: string;
  error?: string;
}

export interface OrderWebhookData {
  orderId: string;
  ucpSessionId: string;
  orderNumber: string;
  status: string;
  tracking?: {
    carrier: string;
    tracking_number: string;
    tracking_url?: string;
  }[];
}

class WebhookService {
  private retryInterval: NodeJS.Timeout | null = null;

  /**
   * Start the webhook retry processor
   */
  startRetryProcessor(intervalMs = 30000): void {
    if (this.retryInterval) {
      return;
    }

    logger.info('Starting webhook retry processor');

    this.retryInterval = setInterval(() => {
      this.processRetryQueue().catch((error) => {
        logger.error({ error }, 'Webhook retry processor error');
      });
    }, intervalMs);
  }

  /**
   * Stop the webhook retry processor
   */
  stopRetryProcessor(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
      logger.info('Stopped webhook retry processor');
    }
  }

  /**
   * Queue an order webhook for delivery
   */
  async queueOrderWebhook(
    shopId: string,
    event: OrderWebhookPayload['event'],
    data: OrderWebhookData
  ): Promise<WebhookDeliveryResult> {
    // Get session to find platform webhook URL
    const session = await sessionRepository.findByUcpId(data.ucpSessionId);

    if (!session?.platformProfileUrl) {
      logger.debug({ ucpSessionId: data.ucpSessionId }, 'No platform URL for webhook');
      return {
        success: false,
        deliveryId: '',
        error: 'No platform URL configured',
      };
    }

    const payload: OrderWebhookPayload = {
      event,
      order: {
        id: data.orderId,
        ucp_session_id: data.ucpSessionId,
        order_number: data.orderNumber,
        status: data.status,
        tracking: data.tracking,
      },
      timestamp: new Date().toISOString(),
    };

    // Determine webhook URL from platform profile
    const targetUrl = this.buildWebhookUrl(session.platformProfileUrl, event);

    // Create delivery record
    const delivery = await webhookDeliveryRepository.create({
      shopId,
      sessionId: data.ucpSessionId,
      orderId: data.orderId,
      event,
      targetUrl,
      payload: payload as unknown as Record<string, unknown>,
    });

    logger.info(
      { deliveryId: delivery.id, event, orderId: data.orderId },
      'Webhook queued for delivery'
    );

    // Attempt immediate delivery
    const result = await this.attemptDelivery(delivery);

    return {
      success: result,
      deliveryId: delivery.id,
      error: result ? undefined : 'Initial delivery failed, queued for retry',
    };
  }

  /**
   * Process the retry queue
   */
  async processRetryQueue(): Promise<number> {
    const pendingDeliveries = await webhookDeliveryRepository.findPendingRetries(50);

    if (pendingDeliveries.length === 0) {
      return 0;
    }

    logger.debug({ count: pendingDeliveries.length }, 'Processing webhook retry queue');

    let processed = 0;
    for (const delivery of pendingDeliveries) {
      await this.attemptDelivery(delivery);
      processed++;
    }

    return processed;
  }

  /**
   * Attempt to deliver a webhook
   */
  private async attemptDelivery(delivery: WebhookDelivery): Promise<boolean> {
    const payload = delivery.payload as unknown as OrderWebhookPayload;

    try {
      // Sign the payload
      const signature = await keyManager.signPayload(
        payload as unknown as Record<string, unknown>
      );

      // Send the webhook
      const response = await fetch(delivery.targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-UCP-Signature': signature,
          'X-UCP-Event': delivery.event,
          'X-UCP-Delivery-ID': delivery.id,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (response.ok) {
        await webhookDeliveryRepository.markSent(delivery.id);
        logger.info(
          { deliveryId: delivery.id, event: delivery.event, status: response.status },
          'Webhook delivered successfully'
        );
        return true;
      }

      // Non-2xx response
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const attempts = delivery.attempts + 1;

      if (attempts >= MAX_RETRY_ATTEMPTS) {
        await webhookDeliveryRepository.markFailed(delivery.id, errorMessage);
        logger.error(
          { deliveryId: delivery.id, attempts, error: errorMessage },
          'Webhook delivery failed permanently'
        );
      } else {
        const nextRetryAt = this.calculateNextRetry(attempts);
        await webhookDeliveryRepository.markFailedWithRetry(
          delivery.id,
          errorMessage,
          nextRetryAt
        );
        logger.warn(
          { deliveryId: delivery.id, attempts, nextRetryAt, error: errorMessage },
          'Webhook delivery failed, scheduled for retry'
        );
      }

      return false;
    }
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetry(attempt: number): Date {
    const delay = Math.min(
      INITIAL_RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1),
      MAX_RETRY_DELAY_MS
    );

    // Add some jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);

    return new Date(Date.now() + delay + jitter);
  }

  /**
   * Build webhook URL from platform profile URL
   */
  private buildWebhookUrl(
    profileUrl: string,
    event: OrderWebhookPayload['event']
  ): string {
    // Remove trailing slash and .well-known/ucp if present
    let baseUrl = profileUrl.replace(/\/?\.well-known\/ucp\/?$/, '').replace(/\/$/, '');

    // Default webhook path pattern
    // In production, this would be discovered from the platform profile
    const eventPath = event.replace(/\./g, '/');

    return `${baseUrl}/webhooks/${eventPath}`;
  }

  /**
   * Get delivery statistics
   */
  async getStats(shopId: string): Promise<{
    total: number;
    sent: number;
    failed: number;
    pending: number;
  }> {
    return webhookDeliveryRepository.getStats(shopId);
  }

  /**
   * Get recent deliveries
   */
  async getRecentDeliveries(
    shopId: string,
    limit = 50
  ): Promise<WebhookDelivery[]> {
    return webhookDeliveryRepository.findMany({ shopId }, { limit });
  }

  /**
   * Retry a specific failed delivery
   */
  async retryDelivery(deliveryId: string): Promise<boolean> {
    const delivery = await webhookDeliveryRepository.findById(deliveryId);

    if (!delivery) {
      throw new Error('Delivery not found');
    }

    if (delivery.status === 'sent') {
      throw new Error('Delivery already successful');
    }

    return this.attemptDelivery(delivery);
  }

  /**
   * Clean up old delivered webhooks
   */
  async cleanup(retentionDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deletedCount = await webhookDeliveryRepository.deleteOldDelivered(cutoffDate);

    if (deletedCount > 0) {
      logger.info({ deletedCount, retentionDays }, 'Cleaned up old webhook deliveries');
    }

    return deletedCount;
  }
}

export const webhookService = new WebhookService();
