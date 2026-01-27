/**
 * Checkout Session Service
 * Main service for managing UCP checkout sessions
 */

import type { CheckoutSession as DbCheckoutSession } from '@prisma/client';
import type {
  CheckoutSession,
  CheckoutStatus,
  CreateCheckoutRequest,
  UpdateCheckoutRequest,
  CompleteCheckoutRequest,
  CompleteCheckoutResponse,
  PaymentHandler,
  Message,
  UcpError,
  UcpErrorCodes,
  Address,
} from '../types/ucp.js';
import type { ShopCredentials, ShopwareCart } from '../types/shopware.js';
import { ShopwareApiClient } from './ShopwareApiClient.js';
import { MockShopwareApiClient } from './MockShopwareApiClient.js';
import { CartMapper } from './CartMapper.js';

const USE_MOCK_API = process.env['USE_MOCK_SHOPWARE'] === 'true' || process.env['NODE_ENV'] === 'development';

type ApiClient = ShopwareApiClient | MockShopwareApiClient;

function createApiClient(credentials: ShopCredentials): ApiClient {
  if (USE_MOCK_API) {
    return new MockShopwareApiClient(credentials);
  }
  return new ShopwareApiClient(credentials);
}
import { sessionRepository } from '../repositories/SessionRepository.js';
import { shopRepository } from '../repositories/ShopRepository.js';
import { paymentHandlerRegistry } from './PaymentHandlerRegistry.js';
import { logger } from '../utils/logger.js';

const UCP_VERSION = process.env['UCP_VERSION'] ?? '2026-01-11';
const DEFAULT_EXPIRY_HOURS = parseInt(process.env['SESSION_EXPIRY_HOURS'] ?? '6', 10);

export class CheckoutSessionService {
  private cartMapper: CartMapper;

  constructor() {
    this.cartMapper = new CartMapper();
  }

  /**
   * Create a new checkout session
   */
  async create(
    shopId: string,
    request: CreateCheckoutRequest,
    platformProfileUrl?: string,
    platformCapabilities?: string[]
  ): Promise<CheckoutSession> {
    // Get shop credentials
    const shop = await shopRepository.findByShopId(shopId);
    if (!shop) {
      throw this.createError('INTERNAL_ERROR', 'Shop not found');
    }

    const credentials: ShopCredentials = {
      shopId: shop.shopId,
      shopUrl: shop.shopUrl,
      apiKey: shop.apiKey,
      secretKey: shop.secretKey,
    };

    const client = createApiClient(credentials);

    // Create Shopware cart
    const cart = await client.createCart();

    // Add line items to cart
    const items = await Promise.all(
      request.line_items.map(async (item) => {
        // Look up product to validate it exists
        const product = await client.getProduct(item.product_id);
        if (!product) {
          throw this.createError('PRODUCT_UNAVAILABLE', `Product ${item.product_id} not found`);
        }

        // Check stock
        if (product.availableStock < item.quantity) {
          throw this.createError(
            'INSUFFICIENT_INVENTORY',
            `Insufficient stock for ${product.name}`
          );
        }

        return {
          id: item.product_id,
          referencedId: item.variant_id ?? item.product_id,
          quantity: item.quantity,
          type: 'product' as const,
        };
      })
    );

    const updatedCart = await client.addLineItem(cart.token, items);

    // Calculate active capabilities
    const activeCapabilities = this.negotiateCapabilities(platformCapabilities);

    // Create session in database
    const dbSession = await sessionRepository.create({
      shopId,
      shopwareCartToken: cart.token,
      platformProfileUrl,
      platformCapabilities,
      activeCapabilities,
      activeExtensions: ['fulfillment', 'discounts'],
      buyerEmail: request.buyer?.email,
      buyerPhone: request.buyer?.phone,
      expiresInHours: DEFAULT_EXPIRY_HOURS,
    });

    // Get shipping methods for fulfillment options
    const shippingMethods = await client.getShippingMethods();

    // Get available payment handlers
    const paymentHandlers = await paymentHandlerRegistry.getHandlersForShop(shopId);

    return this.mapToCheckoutSession(
      dbSession,
      updatedCart,
      shippingMethods,
      paymentHandlers,
      activeCapabilities
    );
  }

  /**
   * Get checkout session by ID
   */
  async get(sessionId: string): Promise<CheckoutSession | null> {
    const dbSession = await sessionRepository.findByUcpId(sessionId);
    if (!dbSession) {
      return null;
    }

    // Check if expired
    if (dbSession.expiresAt < new Date()) {
      await sessionRepository.cancel(sessionId);
      return null;
    }

    // Get shop and cart
    const shop = await shopRepository.findByShopId(dbSession.shopId);
    if (!shop) {
      return null;
    }

    const client = createApiClient({
      shopId: shop.shopId,
      shopUrl: shop.shopUrl,
      apiKey: shop.apiKey,
      secretKey: shop.secretKey,
    });

    const cart = await client.getCart(dbSession.shopwareCartToken);
    const shippingMethods = await client.getShippingMethods();
    const paymentHandlers = await paymentHandlerRegistry.getHandlersForShop(dbSession.shopId);

    return this.mapToCheckoutSession(
      dbSession,
      cart,
      shippingMethods,
      paymentHandlers,
      (dbSession.activeCapabilities as string[]) ?? []
    );
  }

  /**
   * Update checkout session
   */
  async update(sessionId: string, request: UpdateCheckoutRequest): Promise<CheckoutSession> {
    const dbSession = await sessionRepository.findByUcpId(sessionId);
    if (!dbSession) {
      throw this.createError('SESSION_NOT_FOUND', 'Session not found');
    }

    if (dbSession.expiresAt < new Date()) {
      throw this.createError('SESSION_EXPIRED', 'Session has expired');
    }

    const shop = await shopRepository.findByShopId(dbSession.shopId);
    if (!shop) {
      throw this.createError('INTERNAL_ERROR', 'Shop not found');
    }

    const client = createApiClient({
      shopId: shop.shopId,
      shopUrl: shop.shopUrl,
      apiKey: shop.apiKey,
      secretKey: shop.secretKey,
    });

    // Update shipping address
    if (request.shipping_address) {
      const country = await client.getCountryByIso(request.shipping_address.address_country);
      if (!country) {
        throw this.createError('INVALID_ADDRESS', 'Country not found');
      }

      const salutation = await client.getDefaultSalutation();
      if (!salutation) {
        throw this.createError('INTERNAL_ERROR', 'Default salutation not found');
      }

      let countryStateId: string | undefined;
      if (request.shipping_address.address_region) {
        const state = await client.getCountryState(
          country.id,
          request.shipping_address.address_region
        );
        countryStateId = state?.id;
      }

      const shopwareAddress = this.cartMapper.mapToShopwareAddress(
        request.shipping_address,
        country.id,
        salutation.id,
        countryStateId
      );

      await client.setShippingAddress(dbSession.shopwareCartToken, shopwareAddress);
    }

    // Update billing address
    if (request.billing_address) {
      const country = await client.getCountryByIso(request.billing_address.address_country);
      if (!country) {
        throw this.createError('INVALID_ADDRESS', 'Billing country not found');
      }

      const salutation = await client.getDefaultSalutation();
      if (!salutation) {
        throw this.createError('INTERNAL_ERROR', 'Default salutation not found');
      }

      const shopwareAddress = this.cartMapper.mapToShopwareAddress(
        request.billing_address,
        country.id,
        salutation.id
      );

      await client.setBillingAddress(dbSession.shopwareCartToken, shopwareAddress);
    }

    // Update shipping method
    if (request.selected_fulfillment_option_id) {
      await client.setShippingMethod(
        dbSession.shopwareCartToken,
        request.selected_fulfillment_option_id
      );
    }

    // Apply discount codes
    if (request.discounts?.codes) {
      for (const code of request.discounts.codes) {
        await client.addLineItem(dbSession.shopwareCartToken, [
          {
            id: `promotion-${code}`,
            referencedId: code,
            quantity: 1,
            type: 'promotion',
          },
        ]);
      }
    }

    // Update session in database
    await sessionRepository.update(sessionId, {
      shippingAddress: request.shipping_address,
      billingAddress: request.billing_address,
      selectedFulfillmentId: request.selected_fulfillment_option_id,
      appliedDiscountCodes: request.discounts?.codes,
      status: this.determineStatus(dbSession, request),
    });

    // Return updated session
    return (await this.get(sessionId))!;
  }

  /**
   * Complete checkout session
   */
  async complete(
    sessionId: string,
    request: CompleteCheckoutRequest
  ): Promise<CompleteCheckoutResponse> {
    const dbSession = await sessionRepository.findByUcpId(sessionId);
    if (!dbSession) {
      throw this.createError('SESSION_NOT_FOUND', 'Session not found');
    }

    if (dbSession.status === 'completed') {
      throw this.createError('INTERNAL_ERROR', 'Session already completed');
    }

    if (dbSession.expiresAt < new Date()) {
      throw this.createError('SESSION_EXPIRED', 'Session has expired');
    }

    const shop = await shopRepository.findByShopId(dbSession.shopId);
    if (!shop) {
      throw this.createError('INTERNAL_ERROR', 'Shop not found');
    }

    // Update status to in progress
    await sessionRepository.update(sessionId, { status: 'complete_in_progress' });

    // Process payment
    const handler = paymentHandlerRegistry.getHandler(request.payment_data.handler_id);
    if (!handler) {
      throw this.createError('HANDLER_NOT_FOUND', 'Payment handler not found');
    }

    try {
      const paymentResult = await handler.processPayment(dbSession, request.payment_data);

      if (!paymentResult.success) {
        // Check if it's a 3DS challenge
        if (paymentResult.status === 'requires_action' && paymentResult.action_url) {
          await sessionRepository.update(sessionId, { status: 'requires_escalation' });

          return {
            status: 'requires_escalation',
            messages: [
              {
                type: 'error',
                code: 'requires_3ds',
                message: 'Bank requires verification',
                severity: 'requires_buyer_input',
              },
            ],
            continue_url: paymentResult.action_url,
          };
        }

        throw this.createError('PAYMENT_FAILED', paymentResult.error?.message ?? 'Payment failed');
      }

      // Create order in Shopware
      const client = createApiClient({
        shopId: shop.shopId,
        shopUrl: shop.shopUrl,
        apiKey: shop.apiKey,
        secretKey: shop.secretKey,
      });

      const order = await client.createOrder(dbSession.shopwareCartToken);

      // Update order with UCP custom fields
      await client.updateOrderCustomFields(order.id, {
        ucp_session_id: sessionId,
        ucp_platform: dbSession.platformId,
        ucp_payment_handler: request.payment_data.handler_id,
      });

      // Complete session
      await sessionRepository.complete(
        sessionId,
        order.id,
        order.orderNumber,
        paymentResult.transaction_id
      );

      logger.info(
        {
          sessionId,
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
        'Checkout completed'
      );

      return {
        status: 'completed',
        order: {
          id: order.id,
          order_number: order.orderNumber,
          created_at: order.createdAt,
        },
      };
    } catch (error) {
      // Revert status on error
      await sessionRepository.update(sessionId, { status: 'incomplete' });
      throw error;
    }
  }

  /**
   * Cancel checkout session
   */
  async cancel(sessionId: string): Promise<void> {
    const dbSession = await sessionRepository.findByUcpId(sessionId);
    if (!dbSession) {
      throw this.createError('SESSION_NOT_FOUND', 'Session not found');
    }

    await sessionRepository.cancel(sessionId);
    logger.info({ sessionId }, 'Checkout session canceled');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private negotiateCapabilities(platformCapabilities?: string[]): string[] {
    const serverCapabilities = [
      'dev.ucp.shopping.checkout',
      'dev.ucp.shopping.order',
      'dev.ucp.shopping.checkout.fulfillment',
      'dev.ucp.shopping.checkout.discounts',
    ];

    if (!platformCapabilities) {
      return serverCapabilities;
    }

    // Return intersection
    return serverCapabilities.filter((cap) =>
      platformCapabilities.some(
        (pc) => pc === cap || cap.startsWith(pc + '.') || pc.startsWith(cap + '.')
      )
    );
  }

  private determineStatus(
    session: DbCheckoutSession,
    update: UpdateCheckoutRequest
  ): CheckoutStatus {
    // Check if we have minimum required data for completion
    const hasShippingAddress = session.shippingAddress || update.shipping_address;
    const hasShippingMethod = session.selectedFulfillmentId || update.selected_fulfillment_option_id;

    if (hasShippingAddress && hasShippingMethod) {
      return 'ready_for_complete';
    }

    return 'incomplete';
  }

  private mapToCheckoutSession(
    dbSession: DbCheckoutSession,
    cart: ShopwareCart,
    shippingMethods: import('../types/shopware.js').ShippingMethod[],
    paymentHandlers: PaymentHandler[],
    activeCapabilities: string[]
  ): CheckoutSession {
    const lineItems = this.cartMapper.mapLineItems(cart);
    const totals = this.cartMapper.mapCartTotals(cart);
    const fulfillment = this.cartMapper.mapFulfillment(
      shippingMethods,
      cart.deliveries,
      dbSession.selectedFulfillmentId ?? undefined
    );
    const discounts = this.cartMapper.mapDiscounts(
      cart,
      (dbSession.appliedDiscountCodes as string[]) ?? undefined
    );

    const messages: Message[] = [];

    // Add cart errors as messages
    if (cart.errors) {
      for (const error of cart.errors) {
        messages.push({
          type: 'error',
          code: error.messageKey,
          message: error.message,
          severity: 'recoverable',
        });
      }
    }

    return {
      ucp: {
        version: UCP_VERSION,
        capabilities: activeCapabilities.map((name) => ({
          name,
          version: UCP_VERSION,
        })),
      },
      id: dbSession.ucpSessionId,
      status: dbSession.status as CheckoutStatus,
      line_items: lineItems,
      totals,
      buyer: dbSession.buyerEmail
        ? {
            email: dbSession.buyerEmail,
            phone: dbSession.buyerPhone ?? undefined,
          }
        : undefined,
      shipping_address: dbSession.shippingAddress as unknown as Address | undefined,
      billing_address: dbSession.billingAddress as unknown as Address | undefined,
      fulfillment,
      discounts,
      payment: {
        handlers: paymentHandlers,
      },
      messages: messages.length > 0 ? messages : undefined,
      legal: {
        terms_of_service: `${process.env['UCP_SERVER_URL']}/legal/terms`,
        privacy_policy: `${process.env['UCP_SERVER_URL']}/legal/privacy`,
        return_policy: `${process.env['UCP_SERVER_URL']}/legal/returns`,
      },
      expires_at: dbSession.expiresAt.toISOString(),
      created_at: dbSession.createdAt.toISOString(),
      updated_at: dbSession.updatedAt.toISOString(),
    };
  }

  private createError(code: keyof typeof UcpErrorCodes, message: string): UcpError {
    return {
      code,
      message,
    };
  }
}

export const checkoutSessionService = new CheckoutSessionService();
