/**
 * MCP (Model Context Protocol) Transport Routes
 * JSON-RPC 2.0 endpoint for LLM tool integration
 */

import { Router, type Request, type Response } from 'express';
import { checkoutSessionService } from '../services/CheckoutSessionService.js';
import { logger } from '../utils/logger.js';
import type {
  CreateCheckoutRequest,
  UpdateCheckoutRequest,
  CompleteCheckoutRequest,
} from '../types/ucp.js';

const router = Router();

// ============================================================================
// MCP Types
// ============================================================================

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const tools: McpTool[] = [
  {
    name: 'create_checkout',
    description:
      'Create a new checkout session with line items. Call this when a user wants to purchase products.',
    inputSchema: {
      type: 'object',
      properties: {
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'string', description: 'The product ID' },
              quantity: { type: 'integer', description: 'Quantity to purchase' },
              variant_id: { type: 'string', description: 'Optional variant ID' },
            },
            required: ['product_id', 'quantity'],
          },
          description: 'Array of items to add to checkout',
        },
        buyer: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Buyer email' },
            phone: { type: 'string', description: 'Buyer phone' },
          },
        },
      },
      required: ['line_items'],
    },
  },
  {
    name: 'get_checkout',
    description: 'Get the current state of a checkout session',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The checkout session ID' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'update_checkout',
    description:
      'Update a checkout session with shipping address, billing address, or shipping method selection',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The checkout session ID' },
        shipping_address: {
          type: 'object',
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            street_address: { type: 'string' },
            address_locality: { type: 'string', description: 'City' },
            postal_code: { type: 'string' },
            address_country: { type: 'string', description: 'ISO 3166-1 alpha-2 country code' },
          },
          required: [
            'first_name',
            'last_name',
            'street_address',
            'address_locality',
            'postal_code',
            'address_country',
          ],
        },
        selected_fulfillment_option_id: {
          type: 'string',
          description: 'ID of selected shipping method',
        },
        discount_codes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Coupon codes to apply',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'complete_checkout',
    description: 'Complete the checkout with payment information',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The checkout session ID' },
        payment_data: {
          type: 'object',
          properties: {
            handler_id: { type: 'string', description: 'Payment handler ID' },
            type: { type: 'string', enum: ['card', 'wallet', 'bank_transfer'] },
            credential: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                token: { type: 'string' },
              },
              required: ['type', 'token'],
            },
          },
          required: ['handler_id', 'type', 'credential'],
        },
      },
      required: ['session_id', 'payment_data'],
    },
  },
  {
    name: 'cancel_checkout',
    description: 'Cancel an active checkout session',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The checkout session ID' },
      },
      required: ['session_id'],
    },
  },
];

// ============================================================================
// JSON-RPC Handler
// ============================================================================

/**
 * POST /mcp
 * JSON-RPC 2.0 endpoint for MCP
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const request = req.body as JsonRpcRequest;

    // Validate JSON-RPC structure
    if (request.jsonrpc !== '2.0' || !request.method) {
      res.json(createErrorResponse(request.id ?? null, -32600, 'Invalid Request'));
      return;
    }

    logger.debug({ method: request.method, id: request.id }, 'MCP request');

    // Handle methods
    let response: JsonRpcResponse;

    switch (request.method) {
      case 'tools/list':
        response = createSuccessResponse(request.id, { tools });
        break;

      case 'tools/call':
        response = await handleToolCall(request);
        break;

      case 'initialize':
        response = createSuccessResponse(request.id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'shopware-ucp-app',
            version: '1.0.0',
          },
        });
        break;

      default:
        response = createErrorResponse(request.id, -32601, `Method not found: ${request.method}`);
    }

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'MCP request failed');
    res.json(createErrorResponse(null, -32603, 'Internal error'));
  }
});

// ============================================================================
// Tool Call Handler
// ============================================================================

async function handleToolCall(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;

  if (!params?.name) {
    return createErrorResponse(request.id, -32602, 'Invalid params: tool name required');
  }

  const toolName = params.name;
  const toolArgs = params.arguments ?? {};

  // Get shop ID from MCP meta (would come from platform profile)
  const shopId = (request.params?._meta as { shopId?: string })?.shopId ?? 'default';

  try {
    switch (toolName) {
      case 'create_checkout': {
        const lineItems = toolArgs.line_items as CreateCheckoutRequest['line_items'];
        const buyer = toolArgs.buyer as CreateCheckoutRequest['buyer'];

        const session = await checkoutSessionService.create(shopId, { line_items: lineItems, buyer });

        return createSuccessResponse(request.id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify(session, null, 2),
            },
          ],
        });
      }

      case 'get_checkout': {
        const sessionId = toolArgs.session_id as string;
        const session = await checkoutSessionService.get(sessionId);

        if (!session) {
          return createSuccessResponse(request.id, {
            content: [{ type: 'text', text: 'Session not found' }],
            isError: true,
          });
        }

        return createSuccessResponse(request.id, {
          content: [{ type: 'text', text: JSON.stringify(session, null, 2) }],
        });
      }

      case 'update_checkout': {
        const sessionId = toolArgs.session_id as string;
        const updateData: UpdateCheckoutRequest = {
          shipping_address: toolArgs.shipping_address as UpdateCheckoutRequest['shipping_address'],
          billing_address: toolArgs.billing_address as UpdateCheckoutRequest['billing_address'],
          selected_fulfillment_option_id: toolArgs.selected_fulfillment_option_id as string,
          discounts: toolArgs.discount_codes
            ? { codes: toolArgs.discount_codes as string[] }
            : undefined,
        };

        const session = await checkoutSessionService.update(sessionId, updateData);

        return createSuccessResponse(request.id, {
          content: [{ type: 'text', text: JSON.stringify(session, null, 2) }],
        });
      }

      case 'complete_checkout': {
        const sessionId = toolArgs.session_id as string;
        const paymentData = toolArgs.payment_data as CompleteCheckoutRequest['payment_data'];

        const result = await checkoutSessionService.complete(sessionId, {
          payment_data: {
            id: paymentData.id ?? `pay_${Date.now()}`,
            handler_id: paymentData.handler_id,
            type: paymentData.type,
            credential: paymentData.credential,
          },
        });

        return createSuccessResponse(request.id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      }

      case 'cancel_checkout': {
        const sessionId = toolArgs.session_id as string;
        await checkoutSessionService.cancel(sessionId);

        return createSuccessResponse(request.id, {
          content: [{ type: 'text', text: 'Checkout session canceled' }],
        });
      }

      default:
        return createErrorResponse(request.id, -32601, `Unknown tool: ${toolName}`);
    }
  } catch (error) {
    logger.error({ error, toolName }, 'Tool call failed');

    return createSuccessResponse(request.id, {
      content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      isError: true,
    });
  }
}

// ============================================================================
// Response Helpers
// ============================================================================

function createSuccessResponse(id: string | number | null, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? 0,
    result,
  };
}

function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? 0,
    error: { code, message, data },
  };
}

export default router;
