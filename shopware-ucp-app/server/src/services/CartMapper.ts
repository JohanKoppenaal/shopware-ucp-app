/**
 * Cart Mapper
 * Maps between UCP checkout session formats and Shopware cart formats
 */

import type {
  LineItem,
  TotalItem,
  Address,
  Fulfillment,
  FulfillmentOption,
  Discounts,
  AppliedDiscount,
} from '../types/ucp.js';
import type {
  ShopwareCart,
  ShopwareLineItem,
  ShippingMethod,
  ShopwareAddress,
  CartDelivery,
} from '../types/shopware.js';

export class CartMapper {
  private defaultCurrency: string;

  constructor(defaultCurrency = 'EUR') {
    this.defaultCurrency = defaultCurrency;
  }

  /**
   * Map Shopware cart to UCP line items
   */
  mapLineItems(cart: ShopwareCart): LineItem[] {
    return cart.lineItems
      .filter((item) => item.type === 'product' && item.good)
      .map((item) => this.mapLineItem(item));
  }

  /**
   * Map single Shopware line item to UCP line item
   */
  mapLineItem(item: ShopwareLineItem): LineItem {
    const unitPrice = item.price?.unitPrice ?? 0;
    const totalPrice = item.price?.totalPrice ?? 0;

    return {
      id: item.id,
      item: {
        id: item.referencedId ?? item.id,
        title: item.label,
        description: item.description,
        unit_price: Math.round(unitPrice * 100), // Convert to cents
        currency: this.defaultCurrency,
        image_url: item.cover?.url,
        variant_id: this.extractVariantId(item),
        variant_title: this.extractVariantTitle(item),
      },
      quantity: item.quantity,
      totals: this.mapLineItemTotals(item),
    };
  }

  /**
   * Map line item totals
   */
  private mapLineItemTotals(item: ShopwareLineItem): TotalItem[] {
    const totals: TotalItem[] = [];
    const currency = this.defaultCurrency;

    if (item.price) {
      totals.push({
        type: 'subtotal',
        label: 'Subtotal',
        amount: Math.round(item.price.totalPrice * 100),
        currency,
      });

      // Add tax breakdown
      for (const tax of item.price.calculatedTaxes) {
        totals.push({
          type: 'tax',
          label: `Tax (${tax.taxRate}%)`,
          amount: Math.round(tax.tax * 100),
          currency,
        });
      }
    }

    return totals;
  }

  /**
   * Map Shopware cart to UCP totals
   */
  mapCartTotals(cart: ShopwareCart): TotalItem[] {
    const totals: TotalItem[] = [];
    const currency = this.defaultCurrency;

    // Subtotal (position price before discounts)
    totals.push({
      type: 'subtotal',
      label: 'Subtotal',
      amount: Math.round(cart.price.positionPrice * 100),
      currency,
    });

    // Discounts from promotion line items
    const discountItems = cart.lineItems.filter((item) => item.type === 'promotion');
    for (const discount of discountItems) {
      if (discount.price) {
        totals.push({
          type: 'discount',
          label: discount.label,
          amount: Math.round(Math.abs(discount.price.totalPrice) * 100),
          currency,
        });
      }
    }

    // Shipping costs
    const shippingTotal = cart.deliveries.reduce(
      (sum, delivery) => sum + (delivery.shippingCosts?.totalPrice ?? 0),
      0
    );
    if (shippingTotal > 0) {
      totals.push({
        type: 'fulfillment',
        label: 'Shipping',
        amount: Math.round(shippingTotal * 100),
        currency,
      });
    }

    // Tax
    const taxTotal = cart.price.calculatedTaxes.reduce((sum, tax) => sum + tax.tax, 0);
    if (taxTotal > 0) {
      totals.push({
        type: 'tax',
        label: 'Tax',
        amount: Math.round(taxTotal * 100),
        currency,
      });
    }

    // Total
    totals.push({
      type: 'total',
      label: 'Total',
      amount: Math.round(cart.price.totalPrice * 100),
      currency,
    });

    return totals;
  }

  /**
   * Map Shopware shipping methods to UCP fulfillment options
   */
  mapFulfillment(
    shippingMethods: ShippingMethod[],
    deliveries: CartDelivery[],
    selectedMethodId?: string
  ): Fulfillment {
    const options: FulfillmentOption[] = shippingMethods.map((method) => {
      // Find matching delivery to get price
      const delivery = deliveries.find((d) => d.shippingMethod?.id === method.id);
      const price = delivery?.shippingCosts?.totalPrice ?? 0;

      return {
        id: method.id,
        label: method.translated?.name ?? method.name,
        description: method.translated?.description ?? method.description,
        carrier: method.name,
        delivery_estimate: method.deliveryTime
          ? {
              min_days: method.deliveryTime.min,
              max_days: method.deliveryTime.max,
            }
          : undefined,
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
   * Map Shopware promotions to UCP discounts
   */
  mapDiscounts(cart: ShopwareCart, appliedCodes?: string[]): Discounts {
    const applied: AppliedDiscount[] = cart.lineItems
      .filter((item) => item.type === 'promotion')
      .map((item) => ({
        code: (item.payload as { code?: string })?.code,
        type: 'coupon' as const,
        label: item.label,
        amount: Math.round(Math.abs(item.price?.totalPrice ?? 0) * 100),
        currency: this.defaultCurrency,
      }));

    return {
      codes: appliedCodes,
      applied,
    };
  }

  /**
   * Map UCP address to Shopware address format
   */
  mapToShopwareAddress(
    address: Address,
    countryId: string,
    salutationId: string,
    countryStateId?: string
  ): ShopwareAddress {
    return {
      countryId,
      countryStateId,
      salutationId,
      firstName: address.first_name,
      lastName: address.last_name,
      street: address.street_address,
      additionalAddressLine1: address.extended_address,
      zipcode: address.postal_code,
      city: address.address_locality,
      phoneNumber: address.phone,
    };
  }

  /**
   * Map Shopware address to UCP address format
   */
  mapFromShopwareAddress(address: ShopwareAddress, countryIso: string): Address {
    return {
      first_name: address.firstName,
      last_name: address.lastName,
      street_address: address.street,
      extended_address: address.additionalAddressLine1,
      address_locality: address.city,
      address_region: address.countryStateId, // Would need to look up state name
      postal_code: address.zipcode,
      address_country: countryIso,
      phone: address.phoneNumber,
    };
  }

  /**
   * Extract variant ID from Shopware line item
   */
  private extractVariantId(item: ShopwareLineItem): string | undefined {
    // If the product has a parent, this is a variant
    const payload = item.payload as { parentId?: string; optionIds?: string[] } | undefined;
    if (payload?.parentId) {
      return item.referencedId;
    }
    return undefined;
  }

  /**
   * Extract variant title from Shopware line item
   */
  private extractVariantTitle(item: ShopwareLineItem): string | undefined {
    const payload = item.payload as { options?: Array<{ name: string }> } | undefined;
    if (payload?.options && payload.options.length > 0) {
      return payload.options.map((opt) => opt.name).join(' / ');
    }
    return undefined;
  }
}

export const cartMapper = new CartMapper();
