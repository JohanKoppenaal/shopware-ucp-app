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
import { addressMapper, AddressMappingError } from './AddressMapper.js';
import { fulfillmentService } from './FulfillmentService.js';
import { discountService } from './DiscountService.js';
import { paymentProcessor, PaymentError } from './PaymentProcessor.js';
import { sessionRepository } from '../repositories/SessionRepository.js';
import { shopRepository } from '../repositories/ShopRepository.js';
import { paymentHandlerRegistry } from './PaymentHandlerRegistry.js';
import { logger } from '../utils/logger.js';

const USE_MOCK_API =
  process.env['USE_MOCK_SHOPWARE'] === 'true' || process.env['NODE_ENV'] === 'development';

type ApiClient = ShopwareApiClient | MockShopwareApiClient;

function createApiClient(credentials: ShopCredentials): ApiClient {
  if (USE_MOCK_API) {
    return new MockShopwareApiClient(credentials);
  }
  return new ShopwareApiClient(credentials);
}

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

    // Update shipping address using AddressMapper
    if (request.shipping_address) {
      // Validate address fields
      const validationErrors = addressMapper.validateAddress(request.shipping_address);
      if (validationErrors.length > 0 && validationErrors[0]) {
        throw this.createError('INVALID_ADDRESS', validationErrors[0].message);
      }

      try {
        const mappingResult = await addressMapper.mapToShopware(client, request.shipping_address);
        await client.setShippingAddress(dbSession.shopwareCartToken, mappingResult.shopwareAddress);
        logger.debug({ sessionId, country: mappingResult.country.iso }, 'Shipping address set');
      } catch (error) {
        if (error instanceof AddressMappingError) {
          throw this.createError('INVALID_ADDRESS', error.message);
        }
        throw error;
      }
    }

    // Update billing address using AddressMapper
    if (request.billing_address) {
      const validationErrors = addressMapper.validateAddress(request.billing_address);
      if (validationErrors.length > 0 && validationErrors[0]) {
        throw this.createError('INVALID_ADDRESS', validationErrors[0].message);
      }

      try {
        const mappingResult = await addressMapper.mapToShopware(client, request.billing_address);
        await client.setBillingAddress(dbSession.shopwareCartToken, mappingResult.shopwareAddress);
        logger.debug({ sessionId }, 'Billing address set');
      } catch (error) {
        if (error instanceof AddressMappingError) {
          throw this.createError('INVALID_ADDRESS', error.message);
        }
        throw error;
      }
    }

    // Update shipping method using FulfillmentService
    if (request.selected_fulfillment_option_id) {
      const validation = await fulfillmentService.validateSelection(
        client,
        request.selected_fulfillment_option_id,
        { cartTotal: 0 } // Context can be expanded as needed
      );

      if (!validation.valid) {
        throw this.createError('INTERNAL_ERROR', validation.error ?? 'Invalid shipping method');
      }

      await fulfillmentService.setShippingMethod(
        client,
        dbSession.shopwareCartToken,
        request.selected_fulfillment_option_id
      );
    }

    // Apply discount codes using DiscountService
    if (request.discounts?.codes) {
      const result = await discountService.applyDiscountCodes(
        client,
        dbSession.shopwareCartToken,
        request.discounts.codes
      );

      // Log any discount application errors (but don't fail the whole update)
      for (const message of result.messages) {
        logger.warn({ sessionId, message }, 'Discount code warning');
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

    const shop = await shopRepository.findByShopId(dbSession.shopId);
    if (!shop) {
      throw this.createError('INTERNAL_ERROR', 'Shop not found');
    }

    // Create API client for order creation
    const client = createApiClient({
      shopId: shop.shopId,
      shopUrl: shop.shopUrl,
      apiKey: shop.apiKey,
      secretKey: shop.secretKey,
    });

    // Use PaymentProcessor to handle the complete flow
    const result = await paymentProcessor.processCheckout(
      client,
      dbSession,
      request.payment_data,
      request.risk_signals
    );

    return result.response;
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
    const hasShippingMethod =
      session.selectedFulfillmentId || update.selected_fulfillment_option_id;

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

    // Use FulfillmentService for shipping options
    const fulfillment = fulfillmentService.mapFromCartDeliveries(
      shippingMethods,
      cart.deliveries,
      dbSession.selectedFulfillmentId ?? undefined
    );

    // Use DiscountService for discount mapping
    const discounts = discountService.mapDiscountsFromCart(
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
