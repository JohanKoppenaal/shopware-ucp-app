/**
 * UCP (Universal Commerce Protocol) Type Definitions
 * Based on UCP Specification version 2026-01-11
 */

// ============================================================================
// Profile Types
// ============================================================================

export interface UcpProfile {
  ucp: {
    version: string;
    services: Record<string, UcpService>;
    capabilities: UcpCapability[];
  };
  payment: {
    handlers: PaymentHandler[];
  };
  signing_keys?: JsonWebKey[];
}

export interface UcpService {
  version: string;
  spec: string;
  rest?: {
    schema: string;
    endpoint: string;
  };
  mcp?: {
    schema: string;
    endpoint: string;
  };
}

export interface UcpCapability {
  name: string;
  version: string;
  spec: string;
  schema: string;
  extends?: string;
}

// ============================================================================
// Payment Handler Types
// ============================================================================

export interface PaymentHandler {
  id: string;
  name: string;
  version: string;
  spec: string;
  config_schema: string;
  instrument_schemas: string[];
  config: Record<string, unknown>;
}

export interface PaymentCredential {
  type: string;
  token: string;
}

export interface PaymentData {
  id: string;
  handler_id: string;
  type: 'card' | 'wallet' | 'bank_transfer';
  brand?: string;
  last_digits?: string;
  billing_address?: Address;
  credential: PaymentCredential;
}

export interface PaymentResult {
  success: boolean;
  transaction_id?: string;
  status: 'authorized' | 'captured' | 'failed' | 'pending' | 'requires_action';
  error?: {
    code: string;
    message: string;
  };
  action_url?: string;
}

// ============================================================================
// Checkout Session Types
// ============================================================================

export type CheckoutStatus =
  | 'incomplete'
  | 'requires_escalation'
  | 'ready_for_complete'
  | 'complete_in_progress'
  | 'completed'
  | 'canceled';

export interface CheckoutSession {
  ucp: {
    version: string;
    capabilities: Array<{ name: string; version: string }>;
  };
  id: string;
  status: CheckoutStatus;
  line_items: LineItem[];
  totals: TotalItem[];
  buyer?: Buyer;
  shipping_address?: Address;
  billing_address?: Address;
  fulfillment?: Fulfillment;
  discounts?: Discounts;
  payment: {
    handlers: PaymentHandler[];
  };
  messages?: Message[];
  legal?: LegalLinks;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCheckoutRequest {
  line_items: Array<{
    product_id: string;
    quantity: number;
    variant_id?: string;
  }>;
  buyer?: {
    email?: string;
    phone?: string;
  };
  currency?: string;
}

export interface UpdateCheckoutRequest {
  shipping_address?: Address;
  billing_address?: Address;
  selected_fulfillment_option_id?: string;
  discounts?: {
    codes?: string[];
  };
}

export interface CompleteCheckoutRequest {
  payment_data: PaymentData;
  risk_signals?: {
    session_id?: string;
    score?: number;
  };
}

export interface CompleteCheckoutResponse {
  status: 'completed' | 'requires_escalation';
  order?: {
    id: string;
    order_number: string;
    created_at: string;
  };
  messages?: Message[];
  continue_url?: string;
}

// ============================================================================
// Line Item Types
// ============================================================================

export interface LineItem {
  id: string;
  item: {
    id: string;
    title: string;
    description?: string;
    unit_price: number;
    currency: string;
    image_url?: string;
    product_url?: string;
    variant_id?: string;
    variant_title?: string;
  };
  quantity: number;
  totals: TotalItem[];
}

export interface TotalItem {
  type: TotalType;
  label: string;
  amount: number;
  currency: string;
}

export type TotalType =
  | 'subtotal'
  | 'discount'
  | 'fulfillment'
  | 'tax'
  | 'fee'
  | 'items_discount'
  | 'total';

// ============================================================================
// Address Types
// ============================================================================

export interface Address {
  first_name: string;
  last_name: string;
  street_address: string;
  extended_address?: string;
  address_locality: string;
  address_region?: string;
  postal_code: string;
  address_country: string;
  phone?: string;
}

// ============================================================================
// Buyer Types
// ============================================================================

export interface Buyer {
  id?: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
}

// ============================================================================
// Fulfillment Types
// ============================================================================

export interface Fulfillment {
  type: 'shipping' | 'pickup' | 'digital';
  options: FulfillmentOption[];
  selected_option_id?: string;
}

export interface FulfillmentOption {
  id: string;
  label: string;
  description?: string;
  carrier?: string;
  delivery_estimate?: {
    min_days: number;
    max_days: number;
  };
  price: number;
  currency: string;
}

// ============================================================================
// Discount Types
// ============================================================================

export interface Discounts {
  codes?: string[];
  applied: AppliedDiscount[];
}

export interface AppliedDiscount {
  code?: string;
  type: 'coupon' | 'promotion' | 'loyalty';
  label: string;
  amount: number;
  currency: string;
}

// ============================================================================
// Message Types
// ============================================================================

export interface Message {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  severity: 'recoverable' | 'requires_buyer_input' | 'requires_buyer_review';
  field?: string;
}

// ============================================================================
// Legal Types
// ============================================================================

export interface LegalLinks {
  terms_of_service?: string;
  privacy_policy?: string;
  return_policy?: string;
  shipping_policy?: string;
}

// ============================================================================
// Order Types (for webhooks)
// ============================================================================

export interface OrderWebhookPayload {
  event: 'order.updated' | 'order.shipped' | 'order.delivered' | 'order.canceled';
  order: {
    id: string;
    ucp_session_id: string;
    order_number: string;
    status: string;
    tracking?: {
      carrier: string;
      tracking_number: string;
      tracking_url?: string;
    }[];
  };
  timestamp: string;
}

// ============================================================================
// UCP Agent Header Types
// ============================================================================

export interface UcpAgentHeader {
  profile_url: string;
  platform_id?: string;
  capabilities?: string[];
}

// ============================================================================
// Error Types
// ============================================================================

export interface UcpError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const UcpErrorCodes = {
  PRODUCT_UNAVAILABLE: 'product_unavailable',
  VARIANT_UNAVAILABLE: 'variant_unavailable',
  INSUFFICIENT_INVENTORY: 'insufficient_inventory',
  INVALID_QUANTITY: 'invalid_quantity',
  SESSION_NOT_FOUND: 'session_not_found',
  SESSION_EXPIRED: 'session_expired',
  INVALID_ADDRESS: 'invalid_address',
  SHIPPING_UNAVAILABLE: 'shipping_unavailable',
  INVALID_COUPON: 'invalid_coupon',
  PAYMENT_FAILED: 'payment_failed',
  REQUIRES_3DS: 'requires_3ds',
  HANDLER_NOT_FOUND: 'handler_not_found',
  INTERNAL_ERROR: 'internal_error',
} as const;
