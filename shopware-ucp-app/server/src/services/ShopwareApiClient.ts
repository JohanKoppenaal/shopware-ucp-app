/**
 * Shopware API Client
 * Handles communication with Shopware Store API and Admin API
 */

import type {
  ShopCredentials,
  ShopwareOAuthResponse,
  ShopwareCart,
  ShopwareProduct,
  ShippingMethod,
  PaymentMethod,
  Country,
  CountryState,
  Salutation,
  ShopwareOrder,
  ShopwareAddress,
  ShopwarePaginatedResponse,
} from '../types/shopware.js';
import { logger } from '../utils/logger.js';

interface ApiError {
  status: number;
  message: string;
  errors?: Array<{ detail: string }>;
}

export class ShopwareApiClient {
  private credentials: ShopCredentials;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private defaultTimeout: number;

  constructor(credentials: ShopCredentials, timeout = 30000) {
    this.credentials = credentials;
    this.defaultTimeout = timeout;
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }

    // Request new token
    const response = await this.makeRequest<ShopwareOAuthResponse>(
      'POST',
      '/api/oauth/token',
      {
        grant_type: 'client_credentials',
        client_id: this.credentials.apiKey,
        client_secret: this.credentials.secretKey,
      },
      false // Don't use auth for token request
    );

    this.accessToken = response.access_token;
    this.tokenExpiresAt = new Date(Date.now() + (response.expires_in - 60) * 1000); // Buffer of 60 seconds

    return this.accessToken;
  }

  // ============================================================================
  // HTTP Request Helper
  // ============================================================================

  private async makeRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    requireAuth = true,
    isStoreApi = false
  ): Promise<T> {
    const url = `${this.credentials.shopUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (requireAuth) {
      const token = await this.getAccessToken();
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (isStoreApi) {
      headers['sw-access-key'] = this.credentials.apiKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as ApiError;
        const errorMessage = errorBody.errors?.[0]?.detail ?? errorBody.message ?? 'Unknown error';
        logger.error({ status: response.status, url, error: errorMessage }, 'Shopware API error');
        throw new Error(`Shopware API error: ${response.status} - ${errorMessage}`);
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Shopware API timeout after ${this.defaultTimeout}ms`);
      }
      throw error;
    }
  }

  // ============================================================================
  // Store API - Cart Operations
  // ============================================================================

  async createCart(): Promise<ShopwareCart> {
    return this.makeRequest<ShopwareCart>('POST', '/store-api/checkout/cart', {}, true, true);
  }

  async getCart(cartToken: string): Promise<ShopwareCart> {
    return this.makeRequest<ShopwareCart>('GET', '/store-api/checkout/cart', undefined, true, true);
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
    return this.makeRequest<ShopwareCart>(
      'POST',
      '/store-api/checkout/cart/line-item',
      { items },
      true,
      true
    );
  }

  async removeLineItem(cartToken: string, ids: string[]): Promise<ShopwareCart> {
    return this.makeRequest<ShopwareCart>(
      'DELETE',
      '/store-api/checkout/cart/line-item',
      { ids },
      true,
      true
    );
  }

  async updateLineItem(
    cartToken: string,
    items: Array<{
      id: string;
      quantity: number;
    }>
  ): Promise<ShopwareCart> {
    return this.makeRequest<ShopwareCart>(
      'PATCH',
      '/store-api/checkout/cart/line-item',
      { items },
      true,
      true
    );
  }

  async setShippingMethod(cartToken: string, shippingMethodId: string): Promise<ShopwareCart> {
    return this.makeRequest<ShopwareCart>(
      'PATCH',
      '/store-api/context',
      { shippingMethodId },
      true,
      true
    );
  }

  async setPaymentMethod(cartToken: string, paymentMethodId: string): Promise<ShopwareCart> {
    return this.makeRequest<ShopwareCart>(
      'PATCH',
      '/store-api/context',
      { paymentMethodId },
      true,
      true
    );
  }

  async setShippingAddress(cartToken: string, address: ShopwareAddress): Promise<void> {
    await this.makeRequest<void>(
      'PATCH',
      '/store-api/context',
      { shippingAddress: address },
      true,
      true
    );
  }

  async setBillingAddress(cartToken: string, address: ShopwareAddress): Promise<void> {
    await this.makeRequest<void>(
      'PATCH',
      '/store-api/context',
      { billingAddress: address },
      true,
      true
    );
  }

  // ============================================================================
  // Store API - Checkout Operations
  // ============================================================================

  async createOrder(cartToken: string): Promise<ShopwareOrder> {
    return this.makeRequest<ShopwareOrder>('POST', '/store-api/checkout/order', {}, true, true);
  }

  // ============================================================================
  // Store API - Shipping Methods
  // ============================================================================

  async getShippingMethods(): Promise<ShippingMethod[]> {
    const response = await this.makeRequest<{ elements: ShippingMethod[] }>(
      'POST',
      '/store-api/shipping-method',
      { onlyAvailable: true },
      true,
      true
    );
    return response.elements;
  }

  // ============================================================================
  // Store API - Payment Methods
  // ============================================================================

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const response = await this.makeRequest<{ elements: PaymentMethod[] }>(
      'POST',
      '/store-api/payment-method',
      { onlyAvailable: true },
      true,
      true
    );
    return response.elements;
  }

  // ============================================================================
  // Admin API - Products
  // ============================================================================

  async getProduct(productId: string): Promise<ShopwareProduct | null> {
    try {
      const response = await this.makeRequest<{ data: ShopwareProduct }>(
        'GET',
        `/api/product/${productId}?associations[cover][]=media&associations[media][]=thumbnails`
      );
      return response.data;
    } catch {
      return null;
    }
  }

  async getProductByNumber(productNumber: string): Promise<ShopwareProduct | null> {
    const response = await this.makeRequest<ShopwarePaginatedResponse<ShopwareProduct>>(
      'POST',
      '/api/search/product',
      {
        filter: [
          {
            type: 'equals',
            field: 'productNumber',
            value: productNumber,
          },
        ],
        associations: {
          cover: { associations: { media: {} } },
          media: { associations: { thumbnails: {} } },
        },
        limit: 1,
      }
    );
    return response.data[0] ?? null;
  }

  async searchProducts(query: string, limit = 25): Promise<ShopwareProduct[]> {
    const response = await this.makeRequest<ShopwarePaginatedResponse<ShopwareProduct>>(
      'POST',
      '/api/search/product',
      {
        query,
        associations: {
          cover: { associations: { media: {} } },
        },
        limit,
      }
    );
    return response.data;
  }

  // ============================================================================
  // Admin API - Orders
  // ============================================================================

  async getOrder(orderId: string): Promise<ShopwareOrder | null> {
    try {
      const response = await this.makeRequest<{ data: ShopwareOrder }>(
        'GET',
        `/api/order/${orderId}?associations[deliveries][associations][shippingMethod][]=*&associations[transactions][associations][paymentMethod][]=*&associations[lineItems][]=*`
      );
      return response.data;
    } catch {
      return null;
    }
  }

  async updateOrderCustomFields(
    orderId: string,
    customFields: Record<string, unknown>
  ): Promise<void> {
    await this.makeRequest<void>('PATCH', `/api/order/${orderId}`, {
      customFields,
    });
  }

  async transitionOrderState(orderId: string, transition: string): Promise<void> {
    await this.makeRequest<void>('POST', `/api/_action/order/${orderId}/state/${transition}`, {});
  }

  // ============================================================================
  // Admin API - Countries
  // ============================================================================

  async getCountries(): Promise<Country[]> {
    const response = await this.makeRequest<ShopwarePaginatedResponse<Country>>(
      'POST',
      '/api/search/country',
      {
        filter: [{ type: 'equals', field: 'active', value: true }],
        associations: { states: {} },
        limit: 250,
      }
    );
    return response.data;
  }

  async getCountryByIso(iso: string): Promise<Country | null> {
    const response = await this.makeRequest<ShopwarePaginatedResponse<Country>>(
      'POST',
      '/api/search/country',
      {
        filter: [
          { type: 'equals', field: 'iso', value: iso.toUpperCase() },
          { type: 'equals', field: 'active', value: true },
        ],
        associations: { states: {} },
        limit: 1,
      }
    );
    return response.data[0] ?? null;
  }

  async getCountryState(countryId: string, shortCode: string): Promise<CountryState | null> {
    const response = await this.makeRequest<ShopwarePaginatedResponse<CountryState>>(
      'POST',
      '/api/search/country-state',
      {
        filter: [
          { type: 'equals', field: 'countryId', value: countryId },
          { type: 'equals', field: 'shortCode', value: shortCode },
          { type: 'equals', field: 'active', value: true },
        ],
        limit: 1,
      }
    );
    return response.data[0] ?? null;
  }

  // ============================================================================
  // Admin API - Salutations
  // ============================================================================

  async getSalutations(): Promise<Salutation[]> {
    const response = await this.makeRequest<ShopwarePaginatedResponse<Salutation>>(
      'POST',
      '/api/search/salutation',
      { limit: 50 }
    );
    return response.data;
  }

  async getDefaultSalutation(): Promise<Salutation | null> {
    const salutations = await this.getSalutations();
    // Prefer 'mr' or 'not_specified', fallback to first
    return (
      salutations.find((s) => s.salutationKey === 'not_specified') ??
      salutations.find((s) => s.salutationKey === 'mr') ??
      salutations[0] ??
      null
    );
  }
}
