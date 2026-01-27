/**
 * Order Service
 * Handles Shopware order creation and management
 */

import type { CheckoutSession as DbCheckoutSession } from '@prisma/client';
import type { ShopwareOrder } from '../types/shopware.js';
import type { ShopwareApiClient } from './ShopwareApiClient.js';
import type { MockShopwareApiClient } from './MockShopwareApiClient.js';
import { logger } from '../utils/logger.js';

type ApiClient = ShopwareApiClient | MockShopwareApiClient;

export interface OrderCreationResult {
  success: boolean;
  order?: ShopwareOrder;
  error?: {
    code: string;
    message: string;
  };
}

export interface UcpOrderCustomFields {
  ucp_session_id: string;
  ucp_platform?: string | null;
  ucp_payment_handler: string;
  ucp_transaction_id?: string;
  ucp_completed_at: string;
}

export interface OrderConfirmation {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  total: number;
  currency: string;
}

export class OrderService {
  /**
   * Create an order from a checkout session
   */
  async createOrder(
    client: ApiClient,
    session: DbCheckoutSession,
    paymentHandlerId: string,
    transactionId?: string
  ): Promise<OrderCreationResult> {
    logger.info({ sessionId: session.ucpSessionId }, 'Creating Shopware order');

    try {
      // Create the order from the cart
      const order = await client.createOrder(session.shopwareCartToken);

      // Add UCP custom fields to the order
      const customFields: UcpOrderCustomFields = {
        ucp_session_id: session.ucpSessionId,
        ucp_platform: session.platformId,
        ucp_payment_handler: paymentHandlerId,
        ucp_transaction_id: transactionId,
        ucp_completed_at: new Date().toISOString(),
      };

      await client.updateOrderCustomFields(order.id, customFields as unknown as Record<string, unknown>);

      logger.info(
        {
          sessionId: session.ucpSessionId,
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
        'Shopware order created successfully'
      );

      return {
        success: true,
        order,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { sessionId: session.ucpSessionId, error: errorMessage },
        'Failed to create Shopware order'
      );

      return {
        success: false,
        error: {
          code: 'order_creation_failed',
          message: errorMessage,
        },
      };
    }
  }

  /**
   * Get order by ID
   */
  async getOrder(client: ApiClient, orderId: string): Promise<ShopwareOrder | null> {
    try {
      return await client.getOrder(orderId);
    } catch (error) {
      logger.error({ orderId, error }, 'Failed to get order');
      return null;
    }
  }

  /**
   * Transition order state
   */
  async transitionOrderState(
    client: ApiClient,
    orderId: string,
    transition: string
  ): Promise<boolean> {
    try {
      await client.transitionOrderState(orderId, transition);
      logger.info({ orderId, transition }, 'Order state transitioned');
      return true;
    } catch (error) {
      logger.error({ orderId, transition, error }, 'Failed to transition order state');
      return false;
    }
  }

  /**
   * Map Shopware order to UCP order confirmation
   */
  mapToOrderConfirmation(order: ShopwareOrder): OrderConfirmation {
    return {
      id: order.id,
      order_number: order.orderNumber,
      created_at: order.createdAt,
      status: this.mapOrderStatus(order.stateMachineState?.technicalName ?? 'open'),
      total: Math.round(order.amountTotal * 100),
      currency: 'EUR', // Could be extracted from order.currency if available
    };
  }

  /**
   * Map Shopware order state to UCP order status
   */
  private mapOrderStatus(stateId: string): string {
    // Shopware state IDs map to UCP statuses
    const stateMap: Record<string, string> = {
      open: 'confirmed',
      in_progress: 'processing',
      completed: 'delivered',
      cancelled: 'cancelled',
    };

    return stateMap[stateId] ?? 'pending';
  }

  /**
   * Validate that an order can be created from the session
   */
  validateForOrderCreation(session: DbCheckoutSession): { valid: boolean; error?: string } {
    // Check if session has required data
    if (!session.shippingAddress) {
      return { valid: false, error: 'Shipping address is required' };
    }

    if (!session.selectedFulfillmentId) {
      return { valid: false, error: 'Shipping method must be selected' };
    }

    // Check session status
    if (session.status === 'completed') {
      return { valid: false, error: 'Order already created for this session' };
    }

    if (session.status === 'cancelled') {
      return { valid: false, error: 'Session has been cancelled' };
    }

    return { valid: true };
  }
}

export const orderService = new OrderService();
