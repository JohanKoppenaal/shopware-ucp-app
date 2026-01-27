/**
 * Fulfillment Service
 * Handles shipping methods, delivery estimates, and fulfillment options
 */

import type {
  Fulfillment,
  FulfillmentOption,
  Address,
} from '../types/ucp.js';
import type {
  ShippingMethod,
  CartDelivery,
  Country,
} from '../types/shopware.js';
import type { ShopwareApiClient } from './ShopwareApiClient.js';
import type { MockShopwareApiClient } from './MockShopwareApiClient.js';
import { logger } from '../utils/logger.js';

type ApiClient = ShopwareApiClient | MockShopwareApiClient;

export interface FulfillmentContext {
  shippingAddress?: Address;
  country?: Country;
  cartTotal: number;
}

export interface DeliveryEstimate {
  min_days: number;
  max_days: number;
  estimated_date_min?: string;
  estimated_date_max?: string;
}

export class FulfillmentService {
  private defaultCurrency: string;

  constructor(defaultCurrency = 'EUR') {
    this.defaultCurrency = defaultCurrency;
  }

  /**
   * Get available fulfillment options for a cart
   */
  async getAvailableOptions(
    client: ApiClient,
    context: FulfillmentContext
  ): Promise<Fulfillment> {
    const shippingMethods = await client.getShippingMethods();

    // Filter methods based on context (country, cart value, etc.)
    const availableMethods = this.filterAvailableMethods(shippingMethods, context);

    const options = availableMethods.map((method) =>
      this.mapToFulfillmentOption(method, context)
    );

    logger.debug(
      { availableCount: options.length, totalMethods: shippingMethods.length },
      'Filtered fulfillment options'
    );

    return {
      type: 'shipping',
      options,
    };
  }

  /**
   * Map shipping methods from cart deliveries with actual prices
   */
  mapFromCartDeliveries(
    shippingMethods: ShippingMethod[],
    deliveries: CartDelivery[],
    selectedMethodId?: string
  ): Fulfillment {
    const options: FulfillmentOption[] = shippingMethods.map((method) => {
      // Find matching delivery to get calculated price
      const delivery = deliveries.find((d) => d.shippingMethod?.id === method.id);
      const price = delivery?.shippingCosts?.totalPrice ?? 0;

      return {
        id: method.id,
        label: method.translated?.name ?? method.name,
        description: method.translated?.description ?? method.description,
        carrier: method.name,
        delivery_estimate: this.getDeliveryEstimate(method),
        price: Math.round(price * 100),
        currency: this.defaultCurrency,
      };
    });

    return {
      type: 'shipping',
      options,
      selected_option_id: selectedMethodId,
    };
  }

  /**
   * Validate selected fulfillment option
   */
  async validateSelection(
    client: ApiClient,
    methodId: string,
    context: FulfillmentContext
  ): Promise<{ valid: boolean; error?: string }> {
    const shippingMethods = await client.getShippingMethods();
    const method = shippingMethods.find((m) => m.id === methodId);

    if (!method) {
      return { valid: false, error: 'Shipping method not found' };
    }

    if (!method.active) {
      return { valid: false, error: 'Shipping method is not available' };
    }

    // Check if method is available for the shipping country
    if (context.country && !this.isMethodAvailableForCountry(method, context.country)) {
      return { valid: false, error: 'Shipping method not available for this country' };
    }

    return { valid: true };
  }

  /**
   * Set shipping method on cart
   */
  async setShippingMethod(
    client: ApiClient,
    cartToken: string,
    methodId: string
  ): Promise<void> {
    await client.setShippingMethod(cartToken, methodId);
    logger.info({ cartToken, methodId }, 'Shipping method set on cart');
  }

  /**
   * Get delivery estimate for a shipping method
   */
  getDeliveryEstimate(method: ShippingMethod): DeliveryEstimate | undefined {
    if (!method.deliveryTime) {
      return undefined;
    }

    const estimate: DeliveryEstimate = {
      min_days: method.deliveryTime.min,
      max_days: method.deliveryTime.max,
    };

    // Calculate estimated dates
    const now = new Date();
    const minDate = new Date(now);
    const maxDate = new Date(now);

    minDate.setDate(minDate.getDate() + method.deliveryTime.min);
    maxDate.setDate(maxDate.getDate() + method.deliveryTime.max);

    estimate.estimated_date_min = minDate.toISOString().split('T')[0];
    estimate.estimated_date_max = maxDate.toISOString().split('T')[0];

    return estimate;
  }

  /**
   * Filter shipping methods based on context
   */
  private filterAvailableMethods(
    methods: ShippingMethod[],
    context: FulfillmentContext
  ): ShippingMethod[] {
    return methods.filter((method) => {
      // Only active methods
      if (!method.active) {
        return false;
      }

      // Check country availability
      if (context.country && !this.isMethodAvailableForCountry(method, context.country)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Check if shipping method is available for a country
   */
  private isMethodAvailableForCountry(method: ShippingMethod, country: Country): boolean {
    // If method has availability rules, check them
    // For now, assume all active methods are available for shipping-enabled countries
    return country.shippingAvailable;
  }

  /**
   * Map a single shipping method to fulfillment option
   */
  private mapToFulfillmentOption(
    method: ShippingMethod,
    context: FulfillmentContext
  ): FulfillmentOption {
    // Base price (may be updated based on context in future)
    const basePrice = 0; // Actual price comes from cart calculation

    return {
      id: method.id,
      label: method.translated?.name ?? method.name,
      description: method.translated?.description ?? method.description,
      carrier: method.name,
      delivery_estimate: this.getDeliveryEstimate(method),
      price: Math.round(basePrice * 100),
      currency: this.defaultCurrency,
    };
  }

  /**
   * Check if store pickup is available
   */
  hasPickupOption(options: FulfillmentOption[]): boolean {
    return options.some(
      (opt) =>
        opt.label.toLowerCase().includes('pickup') ||
        opt.label.toLowerCase().includes('afhalen')
    );
  }

  /**
   * Get the cheapest shipping option
   */
  getCheapestOption(options: FulfillmentOption[]): FulfillmentOption | undefined {
    if (options.length === 0) return undefined;
    return options.reduce((cheapest, current) =>
      current.price < cheapest.price ? current : cheapest
    );
  }

  /**
   * Get the fastest shipping option
   */
  getFastestOption(options: FulfillmentOption[]): FulfillmentOption | undefined {
    const optionsWithEstimate = options.filter((opt) => opt.delivery_estimate);
    if (optionsWithEstimate.length === 0) return undefined;

    return optionsWithEstimate.reduce((fastest, current) => {
      const fastestDays = fastest.delivery_estimate?.min_days ?? Infinity;
      const currentDays = current.delivery_estimate?.min_days ?? Infinity;
      return currentDays < fastestDays ? current : fastest;
    });
  }
}

export const fulfillmentService = new FulfillmentService();
