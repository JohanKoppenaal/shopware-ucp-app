/**
 * Mock Shopware API Client
 * Provides mock responses for development and testing
 * Uses type assertions to simplify mock data structure
 */

import type {
  ShopCredentials,
  ShopwareCart,
  ShopwareProduct,
  ShippingMethod,
  PaymentMethod,
  Country,
  CountryState,
  Salutation,
  ShopwareOrder,
  ShopwareAddress,
} from '../types/shopware.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// Mock data store
const mockCarts = new Map<string, MockCart>();
const mockOrders = new Map<string, ShopwareOrder>();

interface MockCart {
  token: string;
  lineItems: Array<{
    id: string;
    referencedId: string;
    label: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  totalPrice: number;
  shippingMethodId?: string;
}

export class MockShopwareApiClient {
  private credentials: ShopCredentials;

  constructor(credentials: ShopCredentials) {
    this.credentials = credentials;
    logger.debug({ shopId: credentials.shopId }, 'Using mock Shopware API client');
  }

  // ============================================================================
  // Cart Operations
  // ============================================================================

  async createCart(): Promise<ShopwareCart> {
    const cartToken = `mock-cart-${uuidv4()}`;
    const mockCart: MockCart = {
      token: cartToken,
      lineItems: [],
      totalPrice: 0,
    };
    mockCarts.set(cartToken, mockCart);
    return this.toShopwareCart(mockCart);
  }

  async getCart(cartToken: string): Promise<ShopwareCart> {
    const cart = mockCarts.get(cartToken);
    if (!cart) {
      throw new Error('Cart not found');
    }
    return this.toShopwareCart(cart);
  }

  async addLineItem(
    cartToken: string,
    items: Array<{
      id: string;
      referencedId: string;
      quantity: number;
      type: 'product' | 'promotion';
    }>
  ): Promise<ShopwareCart> {
    const cart = mockCarts.get(cartToken);
    if (!cart) {
      throw new Error('Cart not found');
    }

    for (const item of items) {
      if (item.type === 'product') {
        const product = this.getMockProduct(item.referencedId);
        const unitPrice = product?.price?.[0]?.gross ?? 29.99;
        const totalPrice = unitPrice * item.quantity;

        cart.lineItems.push({
          id: uuidv4(),
          referencedId: item.referencedId,
          label: product?.name ?? `Product ${item.referencedId}`,
          quantity: item.quantity,
          unitPrice,
          totalPrice,
        });

        cart.totalPrice += totalPrice;
      }
    }

    return this.toShopwareCart(cart);
  }

  async removeLineItem(cartToken: string, ids: string[]): Promise<ShopwareCart> {
    const cart = mockCarts.get(cartToken);
    if (!cart) {
      throw new Error('Cart not found');
    }
    cart.lineItems = cart.lineItems.filter((item) => !ids.includes(item.id));
    this.recalculateCart(cart);
    return this.toShopwareCart(cart);
  }

  async updateLineItem(
    cartToken: string,
    items: Array<{ id: string; quantity: number }>
  ): Promise<ShopwareCart> {
    const cart = mockCarts.get(cartToken);
    if (!cart) {
      throw new Error('Cart not found');
    }

    for (const update of items) {
      const item = cart.lineItems.find((li) => li.id === update.id);
      if (item) {
        item.quantity = update.quantity;
        item.totalPrice = item.unitPrice * update.quantity;
      }
    }

    this.recalculateCart(cart);
    return this.toShopwareCart(cart);
  }

  async setShippingMethod(cartToken: string, shippingMethodId: string): Promise<ShopwareCart> {
    const cart = mockCarts.get(cartToken);
    if (!cart) {
      throw new Error('Cart not found');
    }
    cart.shippingMethodId = shippingMethodId;
    return this.toShopwareCart(cart);
  }

  async setPaymentMethod(_cartToken: string, _paymentMethodId: string): Promise<ShopwareCart> {
    return this.getCart(_cartToken);
  }

  async setShippingAddress(_cartToken: string, _address: ShopwareAddress): Promise<void> {
    // Mock: accept it
  }

  async setBillingAddress(_cartToken: string, _address: ShopwareAddress): Promise<void> {
    // Mock: accept it
  }

  // ============================================================================
  // Checkout Operations
  // ============================================================================

  async createOrder(cartToken: string): Promise<ShopwareOrder> {
    const cart = mockCarts.get(cartToken);
    if (!cart) {
      throw new Error('Cart not found');
    }

    const orderId = uuidv4();
    const orderNumber = `ORD-${Date.now()}`;
    const now = new Date().toISOString();

    const order = {
      id: orderId,
      orderNumber,
      orderDateTime: now,
      createdAt: now,
      currencyId: 'mock-currency-id',
      currencyFactor: 1,
      languageId: 'mock-language-id',
      salesChannelId: 'mock-sales-channel',
      billingAddressId: 'mock-billing-address',
      price: {
        netPrice: cart.totalPrice / 1.21,
        totalPrice: cart.totalPrice,
        positionPrice: cart.totalPrice,
        taxStatus: 'gross' as const,
        rawTotal: cart.totalPrice,
        calculatedTaxes: [],
        taxRules: [],
      },
      amountTotal: cart.totalPrice,
      amountNet: cart.totalPrice / 1.21,
      positionPrice: cart.totalPrice,
      shippingTotal: 0,
      orderCustomer: {},
      lineItems: [],
      deliveries: [],
      transactions: [],
      customFields: {},
      stateId: 'open',
    } as unknown as ShopwareOrder;

    mockOrders.set(orderId, order);
    mockCarts.delete(cartToken);

    return order;
  }

  // ============================================================================
  // Shipping Methods
  // ============================================================================

  async getShippingMethods(): Promise<ShippingMethod[]> {
    const now = new Date().toISOString();
    return [
      {
        id: 'standard-shipping',
        name: 'Standard Shipping',
        description: 'Delivery in 3-5 business days',
        active: true,
        createdAt: now,
        deliveryTime: { id: 'dt-1', name: '3-5 days', min: 3, max: 5, unit: 'day', createdAt: now },
      },
      {
        id: 'express-shipping',
        name: 'Express Shipping',
        description: 'Next day delivery',
        active: true,
        createdAt: now,
        deliveryTime: { id: 'dt-2', name: '1 day', min: 1, max: 1, unit: 'day', createdAt: now },
      },
      {
        id: 'pickup',
        name: 'Store Pickup',
        description: 'Pick up at our store',
        active: true,
        createdAt: now,
        deliveryTime: { id: 'dt-3', name: 'Same day', min: 0, max: 0, unit: 'day', createdAt: now },
      },
    ] as ShippingMethod[];
  }

  // ============================================================================
  // Payment Methods
  // ============================================================================

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const now = new Date().toISOString();
    return [
      { id: 'invoice', name: 'Invoice', description: 'Pay by invoice', active: true, afterOrderEnabled: false, createdAt: now },
      { id: 'prepayment', name: 'Prepayment', description: 'Pay in advance', active: true, afterOrderEnabled: false, createdAt: now },
    ] as PaymentMethod[];
  }

  // ============================================================================
  // Products
  // ============================================================================

  async getProduct(productId: string): Promise<ShopwareProduct | null> {
    return this.getMockProduct(productId);
  }

  async getProductByNumber(productNumber: string): Promise<ShopwareProduct | null> {
    return this.getMockProduct(productNumber);
  }

  async searchProducts(_query: string, limit = 25): Promise<ShopwareProduct[]> {
    return [
      this.getMockProduct('product-1')!,
      this.getMockProduct('product-2')!,
    ].slice(0, limit);
  }

  private getMockProduct(id: string): ShopwareProduct | null {
    const now = new Date().toISOString();
    const products: Record<string, ShopwareProduct> = {
      'product-1': {
        id: 'product-1', productNumber: 'PROD-001', name: 'Test Product 1',
        description: 'A great test product', active: true, availableStock: 100, stock: 100,
        isCloseout: false, purchaseSteps: 1, createdAt: now,
        price: [{ gross: 29.99, net: 24.78, currencyId: 'EUR', linked: true }],
      } as ShopwareProduct,
      'product-2': {
        id: 'product-2', productNumber: 'PROD-002', name: 'Test Product 2',
        description: 'Another test product', active: true, availableStock: 50, stock: 50,
        isCloseout: false, purchaseSteps: 1, createdAt: now,
        price: [{ gross: 49.99, net: 41.31, currencyId: 'EUR', linked: true }],
      } as ShopwareProduct,
      'test-product-1': {
        id: 'test-product-1', productNumber: 'TEST-001', name: 'Test Item',
        description: 'A test item', active: true, availableStock: 999, stock: 999,
        isCloseout: false, purchaseSteps: 1, createdAt: now,
        price: [{ gross: 19.99, net: 16.52, currencyId: 'EUR', linked: true }],
      } as ShopwareProduct,
    };
    return products[id] ?? products['test-product-1'] ?? null;
  }

  // ============================================================================
  // Orders
  // ============================================================================

  async getOrder(orderId: string): Promise<ShopwareOrder | null> {
    return mockOrders.get(orderId) ?? null;
  }

  async updateOrderCustomFields(orderId: string, customFields: Record<string, unknown>): Promise<void> {
    const order = mockOrders.get(orderId);
    if (order) {
      order.customFields = { ...order.customFields, ...customFields };
    }
  }

  async transitionOrderState(_orderId: string, _transition: string): Promise<void> {
    // Mock: accept it
  }

  // ============================================================================
  // Countries & States
  // ============================================================================

  async getCountries(): Promise<Country[]> {
    const now = new Date().toISOString();
    return [
      { id: 'nl', name: 'Netherlands', iso: 'NL', iso3: 'NLD', active: true, position: 1, shippingAvailable: true, taxFree: false, createdAt: now },
      { id: 'de', name: 'Germany', iso: 'DE', iso3: 'DEU', active: true, position: 2, shippingAvailable: true, taxFree: false, createdAt: now },
      { id: 'be', name: 'Belgium', iso: 'BE', iso3: 'BEL', active: true, position: 3, shippingAvailable: true, taxFree: false, createdAt: now },
      { id: 'us', name: 'United States', iso: 'US', iso3: 'USA', active: true, position: 4, shippingAvailable: true, taxFree: false, createdAt: now },
    ] as Country[];
  }

  async getCountryByIso(iso: string): Promise<Country | null> {
    const countries = await this.getCountries();
    return countries.find((c) => c.iso.toUpperCase() === iso.toUpperCase()) ?? null;
  }

  async getCountryState(countryId: string, shortCode: string): Promise<CountryState | null> {
    return {
      id: `${countryId}-${shortCode}`,
      countryId,
      shortCode,
      name: shortCode,
      position: 1,
      active: true,
      createdAt: new Date().toISOString(),
    } as CountryState;
  }

  // ============================================================================
  // Salutations
  // ============================================================================

  async getSalutations(): Promise<Salutation[]> {
    const now = new Date().toISOString();
    return [
      { id: 'mr', salutationKey: 'mr', displayName: 'Mr.', letterName: 'Dear Mr.', createdAt: now },
      { id: 'mrs', salutationKey: 'mrs', displayName: 'Mrs.', letterName: 'Dear Mrs.', createdAt: now },
      { id: 'not_specified', salutationKey: 'not_specified', displayName: '', letterName: 'Dear', createdAt: now },
    ] as Salutation[];
  }

  async getDefaultSalutation(): Promise<Salutation | null> {
    return { id: 'not_specified', salutationKey: 'not_specified', displayName: '', letterName: 'Dear', createdAt: new Date().toISOString() } as Salutation;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private recalculateCart(cart: MockCart): void {
    cart.totalPrice = cart.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  }

  private toShopwareCart(cart: MockCart): ShopwareCart {
    const shippingMethod = cart.shippingMethodId
      ? { id: cart.shippingMethodId, name: cart.shippingMethodId, active: true, createdAt: new Date().toISOString() }
      : undefined;

    return {
      token: cart.token,
      name: 'mock-cart',
      price: {
        netPrice: cart.totalPrice / 1.21,
        totalPrice: cart.totalPrice,
        positionPrice: cart.totalPrice,
        taxStatus: 'gross',
        rawTotal: cart.totalPrice,
        calculatedTaxes: [{ tax: cart.totalPrice * 0.21 / 1.21, taxRate: 21, price: cart.totalPrice }],
        taxRules: [{ taxRate: 21, percentage: 100 }],
      },
      lineItems: cart.lineItems.map((li) => ({
        id: li.id,
        referencedId: li.referencedId,
        label: li.label,
        quantity: li.quantity,
        type: 'product' as const,
        good: true,
        removable: true,
        stackable: true,
        modified: false,
        price: {
          unitPrice: li.unitPrice,
          totalPrice: li.totalPrice,
          quantity: li.quantity,
          calculatedTaxes: [{ tax: li.totalPrice * 0.21 / 1.21, taxRate: 21, price: li.totalPrice }],
          taxRules: [{ taxRate: 21, percentage: 100 }],
          referencePrice: null,
          listPrice: null,
          regulationPrice: null,
        },
      })),
      deliveries: shippingMethod ? [{
        shippingMethod: shippingMethod as ShippingMethod,
        shippingCosts: {
          unitPrice: 0,
          totalPrice: 0,
          quantity: 1,
          calculatedTaxes: [],
          taxRules: [],
          referencePrice: null,
          listPrice: null,
          regulationPrice: null,
        },
        positions: [],
      }] : [],
      transactions: [],
      modified: false,
      errors: [],
    } as unknown as ShopwareCart;
  }
}
