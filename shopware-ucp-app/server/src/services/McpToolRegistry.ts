/**
 * MCP Tool Registry
 * Manages MCP tools and their handlers for UCP checkout operations
 */

import type {
  McpTool,
  McpToolHandler,
  McpToolCallResponse,
  McpToolContext,
  McpMeta,
  JsonSchema,
} from '../types/mcp.js';
import type {
  CreateCheckoutRequest,
  UpdateCheckoutRequest,
  CompleteCheckoutRequest,
} from '../types/ucp.js';
import { checkoutSessionService } from './CheckoutSessionService.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Tool Definitions
// ============================================================================

const createCheckoutSchema: JsonSchema = {
  type: 'object',
  properties: {
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'The product ID' },
          quantity: { type: 'integer', description: 'Quantity to purchase', minimum: 1 },
          variant_id: { type: 'string', description: 'Optional variant ID' },
        },
        required: ['product_id', 'quantity'],
      },
      description: 'Array of items to add to checkout',
    },
    buyer: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email', description: 'Buyer email address' },
        phone: { type: 'string', description: 'Buyer phone number' },
      },
      description: 'Optional buyer information',
    },
  },
  required: ['line_items'],
};

const getCheckoutSchema: JsonSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', description: 'The checkout session ID' },
  },
  required: ['session_id'],
};

const updateCheckoutSchema: JsonSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', description: 'The checkout session ID' },
    shipping_address: {
      type: 'object',
      properties: {
        first_name: { type: 'string', description: 'First name' },
        last_name: { type: 'string', description: 'Last name' },
        street_address: { type: 'string', description: 'Street address' },
        extended_address: { type: 'string', description: 'Apartment, suite, etc.' },
        address_locality: { type: 'string', description: 'City' },
        address_region: { type: 'string', description: 'State or province' },
        postal_code: { type: 'string', description: 'Postal/ZIP code' },
        address_country: { type: 'string', description: 'ISO 3166-1 alpha-2 country code', minLength: 2, maxLength: 2 },
        phone: { type: 'string', description: 'Phone number' },
      },
      required: ['first_name', 'last_name', 'street_address', 'address_locality', 'postal_code', 'address_country'],
    },
    billing_address: {
      type: 'object',
      properties: {
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        street_address: { type: 'string' },
        extended_address: { type: 'string' },
        address_locality: { type: 'string' },
        address_region: { type: 'string' },
        postal_code: { type: 'string' },
        address_country: { type: 'string', minLength: 2, maxLength: 2 },
        phone: { type: 'string' },
      },
      required: ['first_name', 'last_name', 'street_address', 'address_locality', 'postal_code', 'address_country'],
    },
    selected_fulfillment_option_id: { type: 'string', description: 'ID of selected shipping method' },
    discount_codes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Coupon codes to apply',
    },
  },
  required: ['session_id'],
};

const completeCheckoutSchema: JsonSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', description: 'The checkout session ID' },
    payment_data: {
      type: 'object',
      properties: {
        handler_id: { type: 'string', description: 'Payment handler ID (e.g., "google-pay", "mollie")' },
        type: { type: 'string', enum: ['card', 'wallet', 'bank_transfer'], description: 'Payment type' },
        brand: { type: 'string', description: 'Card brand (visa, mastercard, etc.)' },
        last_digits: { type: 'string', description: 'Last 4 digits of card' },
        credential: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Credential type' },
            token: { type: 'string', description: 'Payment token' },
            issuer: { type: 'string', description: 'Bank issuer for iDEAL' },
          },
          required: ['type', 'token'],
        },
      },
      required: ['handler_id', 'type', 'credential'],
    },
  },
  required: ['session_id', 'payment_data'],
};

const cancelCheckoutSchema: JsonSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', description: 'The checkout session ID' },
  },
  required: ['session_id'],
};

const listShippingOptionsSchema: JsonSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', description: 'The checkout session ID' },
  },
  required: ['session_id'],
};

const listPaymentMethodsSchema: JsonSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', description: 'The checkout session ID' },
  },
  required: ['session_id'],
};

// ============================================================================
// Tool Registry Class
// ============================================================================

export class McpToolRegistry {
  private tools: Map<string, McpToolHandler> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * Register default UCP checkout tools
   */
  private registerDefaultTools(): void {
    // Create checkout session
    this.register({
      name: 'create_checkout',
      description: 'Create a new checkout session with line items. Call this when a user wants to purchase products.',
      inputSchema: createCheckoutSchema,
      handler: async (args, meta) => this.handleCreateCheckout(args, meta),
    });

    // Get checkout session
    this.register({
      name: 'get_checkout',
      description: 'Get the current state of a checkout session including items, totals, shipping options, and status.',
      inputSchema: getCheckoutSchema,
      handler: async (args, _meta) => this.handleGetCheckout(args),
    });

    // Update checkout session
    this.register({
      name: 'update_checkout',
      description: 'Update a checkout session with shipping address, billing address, shipping method, or discount codes.',
      inputSchema: updateCheckoutSchema,
      handler: async (args, _meta) => this.handleUpdateCheckout(args),
    });

    // Complete checkout
    this.register({
      name: 'complete_checkout',
      description: 'Complete the checkout with payment information. Returns order confirmation or redirect URL for 3DS.',
      inputSchema: completeCheckoutSchema,
      handler: async (args, _meta) => this.handleCompleteCheckout(args),
    });

    // Cancel checkout
    this.register({
      name: 'cancel_checkout',
      description: 'Cancel an active checkout session.',
      inputSchema: cancelCheckoutSchema,
      handler: async (args, _meta) => this.handleCancelCheckout(args),
    });

    // List shipping options
    this.register({
      name: 'list_shipping_options',
      description: 'Get available shipping options for a checkout session. Requires shipping address to be set.',
      inputSchema: listShippingOptionsSchema,
      handler: async (args, _meta) => this.handleListShippingOptions(args),
    });

    // List payment methods
    this.register({
      name: 'list_payment_methods',
      description: 'Get available payment methods for a checkout session.',
      inputSchema: listPaymentMethodsSchema,
      handler: async (args, _meta) => this.handleListPaymentMethods(args),
    });

    logger.info({ toolCount: this.tools.size }, 'MCP tools registered');
  }

  /**
   * Register a new tool
   */
  register(handler: McpToolHandler): void {
    this.tools.set(handler.name, handler);
    logger.debug({ toolName: handler.name }, 'MCP tool registered');
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get all registered tools
   */
  getTools(): McpTool[] {
    return Array.from(this.tools.values()).map((handler) => ({
      name: handler.name,
      description: handler.description,
      inputSchema: handler.inputSchema,
    }));
  }

  /**
   * Get a specific tool handler
   */
  getHandler(name: string): McpToolHandler | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool
   */
  async executeTool(
    name: string,
    args: Record<string, unknown>,
    context: McpToolContext
  ): Promise<McpToolCallResponse> {
    const handler = this.tools.get(name);

    if (!handler) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const meta: McpMeta = {
      ucp: {
        shopId: context.shopId,
        profile: context.profileUrl,
        capabilities: context.capabilities,
      },
    };

    try {
      logger.debug({ toolName: name, shopId: context.shopId }, 'Executing MCP tool');
      return await handler.handler(args, meta);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ toolName: name, error: errorMessage }, 'MCP tool execution failed');

      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  // ============================================================================
  // Tool Handlers
  // ============================================================================

  private async handleCreateCheckout(
    args: Record<string, unknown>,
    meta: McpMeta
  ): Promise<McpToolCallResponse> {
    const shopId = meta.ucp?.shopId ?? 'default';
    const lineItems = args['line_items'] as CreateCheckoutRequest['line_items'];
    const buyer = args['buyer'] as CreateCheckoutRequest['buyer'];

    const session = await checkoutSessionService.create(
      shopId,
      { line_items: lineItems, buyer },
      meta.ucp?.profile,
      meta.ucp?.capabilities
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          session_id: session.id,
          status: session.status,
          totals: session.totals,
          fulfillment_options: session.fulfillment?.options?.length ?? 0,
          payment_handlers: session.payment?.handlers?.length ?? 0,
          expires_at: session.expires_at,
        }, null, 2),
      }],
    };
  }

  private async handleGetCheckout(args: Record<string, unknown>): Promise<McpToolCallResponse> {
    const sessionId = args['session_id'] as string;
    const session = await checkoutSessionService.get(sessionId);

    if (!session) {
      return {
        content: [{ type: 'text', text: 'Checkout session not found or expired' }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(session, null, 2) }],
    };
  }

  private async handleUpdateCheckout(args: Record<string, unknown>): Promise<McpToolCallResponse> {
    const sessionId = args['session_id'] as string;
    const updateData: UpdateCheckoutRequest = {
      shipping_address: args['shipping_address'] as UpdateCheckoutRequest['shipping_address'],
      billing_address: args['billing_address'] as UpdateCheckoutRequest['billing_address'],
      selected_fulfillment_option_id: args['selected_fulfillment_option_id'] as string,
      discounts: args['discount_codes']
        ? { codes: args['discount_codes'] as string[] }
        : undefined,
    };

    const session = await checkoutSessionService.update(sessionId, updateData);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          session_id: session.id,
          status: session.status,
          totals: session.totals,
          shipping_address: session.shipping_address ? 'Set' : 'Not set',
          selected_shipping: session.fulfillment?.selected_option_id ?? 'Not selected',
          messages: session.messages,
        }, null, 2),
      }],
    };
  }

  private async handleCompleteCheckout(args: Record<string, unknown>): Promise<McpToolCallResponse> {
    const sessionId = args['session_id'] as string;
    const paymentData = args['payment_data'] as CompleteCheckoutRequest['payment_data'];

    const result = await checkoutSessionService.complete(sessionId, {
      payment_data: {
        id: `pay_${Date.now()}`,
        handler_id: paymentData.handler_id,
        type: paymentData.type,
        brand: paymentData.brand,
        last_digits: paymentData.last_digits,
        credential: paymentData.credential,
      },
    });

    if (result.status === 'requires_escalation') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'requires_action',
            message: 'Payment requires additional verification',
            continue_url: result.continue_url,
          }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: result.status,
          order_id: result.order?.id,
          order_number: result.order?.order_number,
          created_at: result.order?.created_at,
        }, null, 2),
      }],
    };
  }

  private async handleCancelCheckout(args: Record<string, unknown>): Promise<McpToolCallResponse> {
    const sessionId = args['session_id'] as string;
    await checkoutSessionService.cancel(sessionId);

    return {
      content: [{ type: 'text', text: 'Checkout session canceled successfully' }],
    };
  }

  private async handleListShippingOptions(args: Record<string, unknown>): Promise<McpToolCallResponse> {
    const sessionId = args['session_id'] as string;
    const session = await checkoutSessionService.get(sessionId);

    if (!session) {
      return {
        content: [{ type: 'text', text: 'Checkout session not found' }],
        isError: true,
      };
    }

    const options = session.fulfillment?.options ?? [];

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          shipping_options: options.map((opt) => ({
            id: opt.id,
            label: opt.label,
            description: opt.description,
            carrier: opt.carrier,
            price: `${(opt.price / 100).toFixed(2)} ${opt.currency}`,
            delivery_estimate: opt.delivery_estimate
              ? `${opt.delivery_estimate.min_days}-${opt.delivery_estimate.max_days} days`
              : 'Unknown',
          })),
          selected: session.fulfillment?.selected_option_id,
        }, null, 2),
      }],
    };
  }

  private async handleListPaymentMethods(args: Record<string, unknown>): Promise<McpToolCallResponse> {
    const sessionId = args['session_id'] as string;
    const session = await checkoutSessionService.get(sessionId);

    if (!session) {
      return {
        content: [{ type: 'text', text: 'Checkout session not found' }],
        isError: true,
      };
    }

    const handlers = session.payment?.handlers ?? [];

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          payment_methods: handlers.map((h) => ({
            id: h.id,
            name: h.name,
            version: h.version,
            supported_types: h.config?.['supported_brands'] ?? h.config?.['supported_methods'] ?? [],
          })),
        }, null, 2),
      }],
    };
  }
}

export const mcpToolRegistry = new McpToolRegistry();
