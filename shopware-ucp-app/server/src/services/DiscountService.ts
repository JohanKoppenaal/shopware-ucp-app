/**
 * Discount Service
 * Handles coupon code validation, application, and discount calculations
 */

import type { Discounts, AppliedDiscount, Message } from '../types/ucp.js';
import type { ShopwareCart, ShopwareLineItem } from '../types/shopware.js';
import type { ShopwareApiClient } from './ShopwareApiClient.js';
import type { MockShopwareApiClient } from './MockShopwareApiClient.js';
import { logger } from '../utils/logger.js';

type ApiClient = ShopwareApiClient | MockShopwareApiClient;

export interface DiscountValidationResult {
  valid: boolean;
  code: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface ApplyDiscountResult {
  success: boolean;
  applied: AppliedDiscount[];
  messages: Message[];
}

export class DiscountService {
  private defaultCurrency: string;

  constructor(defaultCurrency = 'EUR') {
    this.defaultCurrency = defaultCurrency;
  }

  /**
   * Apply discount codes to a cart
   */
  async applyDiscountCodes(
    client: ApiClient,
    cartToken: string,
    codes: string[]
  ): Promise<ApplyDiscountResult> {
    const applied: AppliedDiscount[] = [];
    const messages: Message[] = [];

    for (const code of codes) {
      try {
        // Add promotion line item to cart
        await client.addLineItem(cartToken, [
          {
            id: `promotion-${code}`,
            referencedId: code,
            quantity: 1,
            type: 'promotion',
          },
        ]);

        logger.info({ cartToken, code }, 'Discount code applied');

        // We'll get the actual discount details from the cart after applying
        applied.push({
          code,
          type: 'coupon',
          label: `Coupon: ${code}`,
          amount: 0, // Will be updated from cart
          currency: this.defaultCurrency,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn({ cartToken, code, error: errorMessage }, 'Failed to apply discount code');

        messages.push({
          type: 'error',
          code: 'invalid_discount_code',
          message: `Discount code "${code}" is not valid or has expired`,
          severity: 'recoverable',
        });
      }
    }

    return { success: messages.length === 0, applied, messages };
  }

  /**
   * Remove a discount code from cart
   */
  async removeDiscountCode(client: ApiClient, cartToken: string, code: string): Promise<boolean> {
    try {
      const cart = await client.getCart(cartToken);
      const promotionItem = cart.lineItems.find(
        (item) => item.type === 'promotion' && this.getPromotionCode(item) === code
      );

      if (promotionItem) {
        await client.removeLineItem(cartToken, [promotionItem.id]);
        logger.info({ cartToken, code }, 'Discount code removed');
        return true;
      }

      return false;
    } catch (error) {
      logger.error({ cartToken, code, error }, 'Failed to remove discount code');
      return false;
    }
  }

  /**
   * Map cart promotions to UCP discounts format
   */
  mapDiscountsFromCart(cart: ShopwareCart, appliedCodes?: string[]): Discounts {
    const applied = this.extractAppliedDiscounts(cart);

    return {
      codes: appliedCodes,
      applied,
    };
  }

  /**
   * Extract applied discounts from cart line items
   */
  extractAppliedDiscounts(cart: ShopwareCart): AppliedDiscount[] {
    return cart.lineItems
      .filter((item) => item.type === 'promotion')
      .map((item) => this.mapPromotionToDiscount(item));
  }

  /**
   * Map a promotion line item to UCP discount
   */
  private mapPromotionToDiscount(item: ShopwareLineItem): AppliedDiscount {
    const code = this.getPromotionCode(item);
    const discountType = this.getDiscountType(item);

    return {
      code,
      type: discountType,
      label: item.label,
      amount: Math.round(Math.abs(item.price?.totalPrice ?? 0) * 100),
      currency: this.defaultCurrency,
    };
  }

  /**
   * Get promotion code from line item payload
   */
  private getPromotionCode(item: ShopwareLineItem): string | undefined {
    const payload = item.payload as { code?: string } | undefined;
    return payload?.code;
  }

  /**
   * Determine discount type from promotion
   */
  private getDiscountType(item: ShopwareLineItem): 'coupon' | 'promotion' | 'loyalty' {
    const payload = item.payload as
      | {
          discountType?: string;
          promotionId?: string;
          code?: string;
        }
      | undefined;

    // If it has a code, it's a coupon
    if (payload?.code) {
      return 'coupon';
    }

    // Otherwise it's an automatic promotion
    return 'promotion';
  }

  /**
   * Calculate total discount amount
   */
  calculateTotalDiscount(cart: ShopwareCart): number {
    return cart.lineItems
      .filter((item) => item.type === 'promotion')
      .reduce((total, item) => total + Math.abs(item.price?.totalPrice ?? 0), 0);
  }

  /**
   * Check if a specific code is already applied
   */
  isCodeApplied(cart: ShopwareCart, code: string): boolean {
    return cart.lineItems.some(
      (item) => item.type === 'promotion' && this.getPromotionCode(item) === code
    );
  }

  /**
   * Get all currently applied codes
   */
  getAppliedCodes(cart: ShopwareCart): string[] {
    return cart.lineItems
      .filter((item) => item.type === 'promotion')
      .map((item) => this.getPromotionCode(item))
      .filter((code): code is string => code !== undefined);
  }

  /**
   * Validate discount code format (client-side validation)
   */
  validateCodeFormat(code: string): DiscountValidationResult {
    // Basic format validation
    if (!code || code.trim().length === 0) {
      return {
        valid: false,
        code,
        error: {
          code: 'empty_code',
          message: 'Discount code cannot be empty',
        },
      };
    }

    // Check for reasonable length
    if (code.length > 50) {
      return {
        valid: false,
        code,
        error: {
          code: 'code_too_long',
          message: 'Discount code is too long',
        },
      };
    }

    // Check for invalid characters (allow alphanumeric, dashes, underscores)
    if (!/^[a-zA-Z0-9\-_]+$/.test(code)) {
      return {
        valid: false,
        code,
        error: {
          code: 'invalid_characters',
          message: 'Discount code contains invalid characters',
        },
      };
    }

    return { valid: true, code };
  }

  /**
   * Create discount summary for display
   */
  createDiscountSummary(discounts: Discounts): string {
    if (!discounts.applied || discounts.applied.length === 0) {
      return 'No discounts applied';
    }

    const totalAmount = discounts.applied.reduce((sum, d) => sum + d.amount, 0);
    const formattedTotal = (totalAmount / 100).toFixed(2);
    const currency = discounts.applied[0]?.currency ?? 'EUR';

    if (discounts.applied.length === 1 && discounts.applied[0]) {
      return `${discounts.applied[0].label}: -${currency} ${formattedTotal}`;
    }

    return `${discounts.applied.length} discounts: -${currency} ${formattedTotal}`;
  }
}

export const discountService = new DiscountService();
