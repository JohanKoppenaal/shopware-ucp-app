/**
 * Order Status Sync Service
 * Handles bidirectional order status synchronization between Shopware and AI platforms
 */

import { webhookService, type OrderWebhookData } from './WebhookService.js';
import { sessionRepository } from '../repositories/SessionRepository.js';
import { shopRepository } from '../repositories/ShopRepository.js';
import { ShopwareApiClient } from './ShopwareApiClient.js';
import { logger } from '../utils/logger.js';
import type { OrderWebhookPayload } from '../types/ucp.js';

// Shopware order states
export type ShopwareOrderState = 'open' | 'in_progress' | 'completed' | 'cancelled';

// Shopware delivery states
export type ShopwareDeliveryState =
  | 'open'
  | 'shipped'
  | 'shipped_partially'
  | 'delivered'
  | 'returned'
  | 'returned_partially'
  | 'cancelled';

// Shopware transaction states
export type ShopwareTransactionState =
  | 'open'
  | 'authorized'
  | 'paid'
  | 'paid_partially'
  | 'refunded'
  | 'refunded_partially'
  | 'reminded'
  | 'cancelled'
  | 'failed';

// UCP order statuses
export type UcpOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'canceled'
  | 'refunded';

export interface OrderStateChange {
  orderId: string;
  orderNumber?: string;
  previousState: string;
  newState: string;
  stateType: 'order' | 'delivery' | 'transaction';
  trackingCodes?: string[];
  carrier?: string;
}

export interface OrderSyncResult {
  success: boolean;
  event?: OrderWebhookPayload['event'];
  error?: string;
}

class OrderStatusSyncService {
  /**
   * Handle order state change from Shopware
   */
  async handleOrderStateChange(shopId: string, change: OrderStateChange): Promise<OrderSyncResult> {
    // Find the UCP session for this order
    const sessions = await sessionRepository.findByShop(shopId, { limit: 1000 });
    const session = sessions.find((s) => s.shopwareOrderId === change.orderId);

    if (!session) {
      logger.debug({ orderId: change.orderId, shopId }, 'No UCP session found for order');
      return { success: false, error: 'No UCP session for this order' };
    }

    // Determine the UCP event and status
    const { event, status } = this.mapStateToUcpEvent(change);

    if (!event) {
      logger.debug(
        { orderId: change.orderId, newState: change.newState },
        'No UCP event for this state change'
      );
      return { success: true }; // Not an error, just no event needed
    }

    // Build webhook data
    const webhookData: OrderWebhookData = {
      orderId: change.orderId,
      ucpSessionId: session.ucpSessionId,
      orderNumber: change.orderNumber ?? session.shopwareOrderNumber ?? '',
      status,
    };

    // Add tracking info if available
    if (change.trackingCodes && change.trackingCodes.length > 0) {
      webhookData.tracking = change.trackingCodes.map((code) => ({
        carrier: change.carrier ?? 'Unknown',
        tracking_number: code,
        tracking_url: this.buildTrackingUrl(change.carrier, code),
      }));
    }

    // Queue webhook
    const result = await webhookService.queueOrderWebhook(shopId, event, webhookData);

    logger.info(
      {
        orderId: change.orderId,
        ucpSessionId: session.ucpSessionId,
        event,
        status,
        deliveryId: result.deliveryId,
      },
      'Order status synced to platform'
    );

    return {
      success: result.success,
      event,
      error: result.error,
    };
  }

  /**
   * Handle delivery state change
   */
  async handleDeliveryStateChange(
    shopId: string,
    change: OrderStateChange
  ): Promise<OrderSyncResult> {
    return this.handleOrderStateChange(shopId, {
      ...change,
      stateType: 'delivery',
    });
  }

  /**
   * Handle transaction state change
   */
  async handleTransactionStateChange(
    shopId: string,
    change: OrderStateChange
  ): Promise<OrderSyncResult> {
    return this.handleOrderStateChange(shopId, {
      ...change,
      stateType: 'transaction',
    });
  }

  /**
   * Sync order from platform to Shopware (platform-initiated status update)
   */
  async syncFromPlatform(
    shopId: string,
    orderId: string,
    newStatus: UcpOrderStatus
  ): Promise<OrderSyncResult> {
    const shop = await shopRepository.findByShopId(shopId);
    if (!shop) {
      return { success: false, error: 'Shop not found' };
    }

    const client = new ShopwareApiClient({
      shopId: shop.shopId,
      shopUrl: shop.shopUrl,
      apiKey: shop.apiKey,
      secretKey: shop.secretKey,
    });

    try {
      const shopwareState = this.mapUcpStatusToShopware(newStatus);

      if (!shopwareState) {
        return { success: false, error: `Cannot map status ${newStatus} to Shopware` };
      }

      // Transition order in Shopware
      await client.transitionOrderState(orderId, shopwareState.action);

      logger.info(
        { orderId, shopId, newStatus, shopwareAction: shopwareState.action },
        'Order status synced from platform to Shopware'
      );

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { orderId, shopId, newStatus, error: errorMessage },
        'Failed to sync order status to Shopware'
      );
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get current order status in UCP format
   */
  async getOrderStatus(
    shopId: string,
    orderId: string
  ): Promise<{ status: UcpOrderStatus; tracking?: OrderWebhookData['tracking'] } | null> {
    const shop = await shopRepository.findByShopId(shopId);
    if (!shop) {
      return null;
    }

    const client = new ShopwareApiClient({
      shopId: shop.shopId,
      shopUrl: shop.shopUrl,
      apiKey: shop.apiKey,
      secretKey: shop.secretKey,
    });

    try {
      const order = await client.getOrder(orderId);

      if (!order) {
        return null;
      }

      const status = this.mapShopwareStateToUcp(order.stateMachineState?.technicalName ?? 'open');

      // Get tracking from deliveries
      const tracking = order.deliveries?.flatMap(
        (d) =>
          d.trackingCodes?.map((code) => ({
            carrier: d.shippingMethod?.name ?? 'Unknown',
            tracking_number: code,
            tracking_url: this.buildTrackingUrl(d.shippingMethod?.name, code),
          })) ?? []
      );

      return {
        status,
        tracking: tracking?.length ? tracking : undefined,
      };
    } catch (error) {
      logger.error({ orderId, shopId, error }, 'Failed to get order status');
      return null;
    }
  }

  /**
   * Map Shopware state change to UCP event
   */
  private mapStateToUcpEvent(change: OrderStateChange): {
    event: OrderWebhookPayload['event'] | null;
    status: string;
  } {
    const { stateType, newState } = change;

    // Handle delivery state changes
    if (stateType === 'delivery') {
      switch (newState as ShopwareDeliveryState) {
        case 'shipped':
        case 'shipped_partially':
          return { event: 'order.shipped', status: 'shipped' };
        case 'delivered':
          return { event: 'order.delivered', status: 'delivered' };
        case 'returned':
        case 'returned_partially':
          return { event: 'order.updated', status: 'returned' };
        case 'cancelled':
          return { event: 'order.canceled', status: 'canceled' };
        default:
          return { event: null, status: newState };
      }
    }

    // Handle transaction state changes
    if (stateType === 'transaction') {
      switch (newState as ShopwareTransactionState) {
        case 'paid':
          return { event: 'order.updated', status: 'confirmed' };
        case 'refunded':
        case 'refunded_partially':
          return { event: 'order.updated', status: 'refunded' };
        case 'cancelled':
        case 'failed':
          return { event: 'order.canceled', status: 'canceled' };
        default:
          return { event: null, status: newState };
      }
    }

    // Handle order state changes
    switch (newState as ShopwareOrderState) {
      case 'open':
        return { event: 'order.updated', status: 'confirmed' };
      case 'in_progress':
        return { event: 'order.updated', status: 'processing' };
      case 'completed':
        return { event: 'order.delivered', status: 'delivered' };
      case 'cancelled':
        return { event: 'order.canceled', status: 'canceled' };
      default:
        return { event: 'order.updated', status: this.mapShopwareStateToUcp(newState) };
    }
  }

  /**
   * Map Shopware state to UCP status
   */
  private mapShopwareStateToUcp(shopwareState: string): UcpOrderStatus {
    const stateMap: Record<string, UcpOrderStatus> = {
      open: 'confirmed',
      in_progress: 'processing',
      completed: 'delivered',
      cancelled: 'canceled',
      shipped: 'shipped',
      delivered: 'delivered',
      paid: 'confirmed',
      refunded: 'refunded',
    };

    return stateMap[shopwareState] ?? 'pending';
  }

  /**
   * Map UCP status to Shopware state action
   */
  private mapUcpStatusToShopware(ucpStatus: UcpOrderStatus): { action: string } | null {
    const actionMap: Record<UcpOrderStatus, string | null> = {
      pending: null,
      confirmed: 'process', // open -> in_progress
      processing: 'process',
      shipped: null, // Handled via delivery state
      delivered: 'complete',
      canceled: 'cancel',
      refunded: null, // Handled via transaction state
    };

    const action = actionMap[ucpStatus];
    return action ? { action } : null;
  }

  /**
   * Build tracking URL for carrier
   */
  private buildTrackingUrl(
    carrier: string | undefined,
    trackingNumber: string
  ): string | undefined {
    if (!carrier) return undefined;

    const carrierLower = carrier.toLowerCase();

    // Common carrier tracking URLs
    const trackingUrls: Record<string, string> = {
      dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
      ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
      fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
      postnl: `https://postnl.nl/tracktrace/?B=${trackingNumber}`,
      dpd: `https://tracking.dpd.de/status/en_US/parcel/${trackingNumber}`,
      gls: `https://gls-group.eu/track/${trackingNumber}`,
    };

    for (const [key, url] of Object.entries(trackingUrls)) {
      if (carrierLower.includes(key)) {
        return url;
      }
    }

    return undefined;
  }
}

export const orderStatusSyncService = new OrderStatusSyncService();
