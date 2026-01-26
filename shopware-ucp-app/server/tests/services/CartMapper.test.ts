/**
 * CartMapper Unit Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CartMapper } from '../../src/services/CartMapper.js';
import type { ShopwareCart, ShopwareLineItem, ShippingMethod } from '../../src/types/shopware.js';
import type { Address } from '../../src/types/ucp.js';

describe('CartMapper', () => {
  let cartMapper: CartMapper;

  beforeEach(() => {
    cartMapper = new CartMapper('EUR');
  });

  describe('mapLineItems', () => {
    it('should map Shopware line items to UCP format', () => {
      const cart: ShopwareCart = {
        token: 'test-token',
        name: 'test-cart',
        price: {
          netPrice: 100,
          totalPrice: 119,
          calculatedTaxes: [{ tax: 19, taxRate: 19, price: 100 }],
          taxRules: [{ taxRate: 19, percentage: 100 }],
          positionPrice: 100,
          taxStatus: 'gross',
          rawTotal: 119,
        },
        lineItems: [
          {
            id: 'line-1',
            referencedId: 'product-1',
            label: 'Test Product',
            quantity: 2,
            type: 'product',
            good: true,
            stackable: true,
            removable: true,
            price: {
              unitPrice: 50,
              quantity: 2,
              totalPrice: 100,
              calculatedTaxes: [{ tax: 19, taxRate: 19, price: 100 }],
              taxRules: [{ taxRate: 19, percentage: 100 }],
            },
          },
        ],
        deliveries: [],
      };

      const result = cartMapper.mapLineItems(cart);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'line-1',
        item: {
          id: 'product-1',
          title: 'Test Product',
          unit_price: 5000, // 50 EUR in cents
          currency: 'EUR',
        },
        quantity: 2,
      });
    });

    it('should filter out promotion line items', () => {
      const cart: ShopwareCart = {
        token: 'test-token',
        name: 'test-cart',
        price: {
          netPrice: 80,
          totalPrice: 95.2,
          calculatedTaxes: [],
          taxRules: [],
          positionPrice: 80,
          taxStatus: 'gross',
          rawTotal: 95.2,
        },
        lineItems: [
          {
            id: 'line-1',
            referencedId: 'product-1',
            label: 'Test Product',
            quantity: 1,
            type: 'product',
            good: true,
            stackable: true,
            removable: true,
          },
          {
            id: 'promo-1',
            referencedId: 'DISCOUNT10',
            label: '10% Discount',
            quantity: 1,
            type: 'promotion',
            good: false,
            stackable: false,
            removable: true,
          },
        ],
        deliveries: [],
      };

      const result = cartMapper.mapLineItems(cart);

      expect(result).toHaveLength(1);
      expect(result[0]?.item.title).toBe('Test Product');
    });
  });

  describe('mapCartTotals', () => {
    it('should map cart totals correctly', () => {
      const cart: ShopwareCart = {
        token: 'test-token',
        name: 'test-cart',
        price: {
          netPrice: 100,
          totalPrice: 124.95,
          calculatedTaxes: [{ tax: 19, taxRate: 19, price: 100 }],
          taxRules: [{ taxRate: 19, percentage: 100 }],
          positionPrice: 100,
          taxStatus: 'gross',
          rawTotal: 124.95,
        },
        lineItems: [],
        deliveries: [
          {
            deliveryDate: { earliest: '', latest: '' },
            shippingMethod: {} as ShippingMethod,
            shippingCosts: {
              netPrice: 5,
              totalPrice: 5.95,
              calculatedTaxes: [],
              taxRules: [],
              positionPrice: 5,
              taxStatus: 'gross',
              rawTotal: 5.95,
            },
            positions: [],
            location: { address: {} as any },
          },
        ],
      };

      const result = cartMapper.mapCartTotals(cart);

      expect(result).toContainEqual({
        type: 'subtotal',
        label: 'Subtotal',
        amount: 10000,
        currency: 'EUR',
      });

      expect(result).toContainEqual({
        type: 'fulfillment',
        label: 'Shipping',
        amount: 595,
        currency: 'EUR',
      });

      expect(result).toContainEqual({
        type: 'tax',
        label: 'Tax',
        amount: 1900,
        currency: 'EUR',
      });

      expect(result).toContainEqual({
        type: 'total',
        label: 'Total',
        amount: 12495,
        currency: 'EUR',
      });
    });
  });

  describe('mapToShopwareAddress', () => {
    it('should map UCP address to Shopware format', () => {
      const ucpAddress: Address = {
        first_name: 'John',
        last_name: 'Doe',
        street_address: '123 Main Street',
        extended_address: 'Apt 4B',
        address_locality: 'Amsterdam',
        address_region: 'NH',
        postal_code: '1012 AB',
        address_country: 'NL',
        phone: '+31612345678',
      };

      const result = cartMapper.mapToShopwareAddress(
        ucpAddress,
        'country-id-nl',
        'salutation-id-mr',
        'state-id-nh'
      );

      expect(result).toEqual({
        countryId: 'country-id-nl',
        countryStateId: 'state-id-nh',
        salutationId: 'salutation-id-mr',
        firstName: 'John',
        lastName: 'Doe',
        street: '123 Main Street',
        additionalAddressLine1: 'Apt 4B',
        zipcode: '1012 AB',
        city: 'Amsterdam',
        phoneNumber: '+31612345678',
      });
    });
  });

  describe('mapFulfillment', () => {
    it('should map shipping methods to fulfillment options', () => {
      const shippingMethods: ShippingMethod[] = [
        {
          id: 'shipping-1',
          name: 'Standard Shipping',
          active: true,
          taxType: 'gross',
          createdAt: '',
          deliveryTime: {
            id: 'dt-1',
            name: '3-5 business days',
            min: 3,
            max: 5,
            unit: 'day',
            createdAt: '',
          },
        },
        {
          id: 'shipping-2',
          name: 'Express Shipping',
          active: true,
          taxType: 'gross',
          createdAt: '',
          deliveryTime: {
            id: 'dt-2',
            name: '1-2 business days',
            min: 1,
            max: 2,
            unit: 'day',
            createdAt: '',
          },
        },
      ];

      const deliveries = [
        {
          deliveryDate: { earliest: '', latest: '' },
          shippingMethod: shippingMethods[0]!,
          shippingCosts: {
            netPrice: 5,
            totalPrice: 5.95,
            calculatedTaxes: [],
            taxRules: [],
            positionPrice: 5,
            taxStatus: 'gross' as const,
            rawTotal: 5.95,
          },
          positions: [],
          location: { address: {} as any },
        },
      ];

      const result = cartMapper.mapFulfillment(shippingMethods, deliveries, 'shipping-1');

      expect(result.type).toBe('shipping');
      expect(result.options).toHaveLength(2);
      expect(result.selected_option_id).toBe('shipping-1');

      expect(result.options[0]).toMatchObject({
        id: 'shipping-1',
        label: 'Standard Shipping',
        delivery_estimate: { min_days: 3, max_days: 5 },
        price: 595,
        currency: 'EUR',
      });
    });
  });
});
