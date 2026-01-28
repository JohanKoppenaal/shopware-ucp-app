/**
 * MCP (Model Context Protocol) Transport Routes
 * JSON-RPC 2.0 endpoint for LLM tool integration
 * Supports both standard HTTP and Streamable HTTP (SSE) transports
 */

import { Router, type Request, type Response } from 'express';
import { mcpToolRegistry } from '../services/McpToolRegistry.js';
import { logger } from '../utils/logger.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpInitializeResponse,
  McpToolsListResponse,
  McpToolCallResponse,
  McpMeta,
  McpToolContext,
  JsonRpcErrorCodes,
} from '../types/mcp.js';

const router = Router();

const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'shopware-ucp-app';
const SERVER_VERSION = '1.0.0';

// ============================================================================
// JSON-RPC Standard HTTP Endpoint
// ============================================================================

/**
 * POST /mcp
 * Standard JSON-RPC 2.0 endpoint
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

    // Extract MCP meta from request
    const meta = extractMcpMeta(request, req);

    // Handle the request
    const response = await handleJsonRpcRequest(request, meta);
    res.json(response);
  } catch (error) {
    logger.error({ error }, 'MCP request failed');
    res.json(createErrorResponse(null, -32603, 'Internal error'));
  }
});

// ============================================================================
// SSE Streaming Endpoint
// ============================================================================

/**
 * GET /mcp/sse
 * Server-Sent Events endpoint for streaming responses
 */
router.get('/sse', (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection event
  sendSseEvent(res, 'connected', { status: 'connected', server: SERVER_NAME });

  // Handle client disconnect
  req.on('close', () => {
    logger.debug('SSE client disconnected');
  });

  // Keep connection alive with heartbeat
  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      sendSseEvent(res, 'heartbeat', { timestamp: Date.now() });
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30000);

  // Store connection for message broadcasting
  const connectionId = `conn_${Date.now()}`;
  logger.info({ connectionId }, 'SSE client connected');
});

/**
 * POST /mcp/sse
 * Accept JSON-RPC requests and stream responses via SSE
 */
router.post('/sse', async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const request = req.body as JsonRpcRequest;

    if (request.jsonrpc !== '2.0' || !request.method) {
      sendSseEvent(
        res,
        'error',
        createErrorResponse(request.id ?? null, -32600, 'Invalid Request')
      );
      res.end();
      return;
    }

    const meta = extractMcpMeta(request, req);

    // Send progress event
    sendSseEvent(res, 'progress', { id: request.id, status: 'processing' });

    // Handle the request
    const response = await handleJsonRpcRequest(request, meta);

    // Send result
    sendSseEvent(res, 'result', response);
    res.end();
  } catch (error) {
    logger.error({ error }, 'MCP SSE request failed');
    sendSseEvent(res, 'error', createErrorResponse(null, -32603, 'Internal error'));
    res.end();
  }
});

// ============================================================================
// OpenRPC Discovery Endpoint
// ============================================================================

/**
 * GET /mcp/openrpc
 * Returns OpenRPC schema for API discovery
 */
router.get('/openrpc', (_req: Request, res: Response) => {
  const tools = mcpToolRegistry.getTools();

  const openRpcSchema = {
    openrpc: '1.3.2',
    info: {
      title: 'Shopware UCP MCP API',
      description: 'MCP (Model Context Protocol) API for UCP checkout operations',
      version: SERVER_VERSION,
      contact: {
        name: 'UCP Support',
        url: 'https://ucp.dev',
      },
    },
    servers: [
      {
        name: 'MCP Server',
        url: `${process.env['UCP_SERVER_URL'] ?? 'http://localhost:3000'}/mcp`,
      },
    ],
    methods: [
      {
        name: 'initialize',
        summary: 'Initialize MCP connection',
        params: [
          { name: 'protocolVersion', schema: { type: 'string' } },
          { name: 'capabilities', schema: { type: 'object' } },
          { name: 'clientInfo', schema: { type: 'object' } },
        ],
        result: {
          name: 'InitializeResult',
          schema: {
            type: 'object',
            properties: {
              protocolVersion: { type: 'string' },
              capabilities: { type: 'object' },
              serverInfo: { type: 'object' },
            },
          },
        },
      },
      {
        name: 'tools/list',
        summary: 'List available tools',
        params: [],
        result: {
          name: 'ToolsListResult',
          schema: {
            type: 'object',
            properties: {
              tools: {
                type: 'array',
                items: { $ref: '#/components/schemas/Tool' },
              },
            },
          },
        },
      },
      {
        name: 'tools/call',
        summary: 'Call a tool',
        params: [
          { name: 'name', schema: { type: 'string' } },
          { name: 'arguments', schema: { type: 'object' } },
        ],
        result: {
          name: 'ToolCallResult',
          schema: {
            type: 'object',
            properties: {
              content: { type: 'array' },
              isError: { type: 'boolean' },
            },
          },
        },
      },
    ],
    components: {
      schemas: {
        Tool: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            inputSchema: { type: 'object' },
          },
          required: ['name', 'description', 'inputSchema'],
        },
      },
    },
  };

  res.json(openRpcSchema);
});

// ============================================================================
// JSON-RPC Request Handler
// ============================================================================

async function handleJsonRpcRequest(
  request: JsonRpcRequest,
  meta: McpMeta
): Promise<JsonRpcResponse> {
  switch (request.method) {
    case 'initialize':
      return handleInitialize(request);

    case 'tools/list':
      return handleToolsList(request);

    case 'tools/call':
      return handleToolCall(request, meta);

    case 'notifications/initialized':
      // Client notification that initialization is complete
      return createSuccessResponse(request.id, {});

    case 'ping':
      return createSuccessResponse(request.id, { pong: true });

    default:
      return createErrorResponse(request.id, -32601, `Method not found: ${request.method}`);
  }
}

function handleInitialize(request: JsonRpcRequest): JsonRpcResponse {
  const response: McpInitializeResponse = {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: {
        listChanged: true,
      },
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
  };

  return createSuccessResponse(request.id, response);
}

function handleToolsList(request: JsonRpcRequest): JsonRpcResponse {
  const tools = mcpToolRegistry.getTools();
  const response: McpToolsListResponse = { tools };
  return createSuccessResponse(request.id, response);
}

async function handleToolCall(request: JsonRpcRequest, meta: McpMeta): Promise<JsonRpcResponse> {
  const params = request.params as
    | { name?: string; arguments?: Record<string, unknown> }
    | undefined;

  if (!params?.name) {
    return createErrorResponse(request.id, -32602, 'Invalid params: tool name required');
  }

  const toolName = params.name;
  const toolArgs = params.arguments ?? {};

  const context: McpToolContext = {
    shopId: meta.ucp?.shopId ?? 'default',
    profileUrl: meta.ucp?.profile,
    capabilities: meta.ucp?.capabilities,
    requestId: request.id,
  };

  const result = await mcpToolRegistry.executeTool(toolName, toolArgs, context);

  return createSuccessResponse(request.id, result);
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractMcpMeta(request: JsonRpcRequest, httpReq: Request): McpMeta {
  // Extract from _meta in params
  const paramsMeta = request.params?._meta as McpMeta['ucp'] | undefined;

  // Extract from headers
  const headerShopId = httpReq.headers['x-shop-id'] as string | undefined;
  const headerProfile = httpReq.headers['x-ucp-profile'] as string | undefined;

  return {
    ucp: {
      shopId: paramsMeta?.shopId ?? headerShopId ?? 'default',
      profile: paramsMeta?.profile ?? headerProfile,
      capabilities: paramsMeta?.capabilities,
      version: paramsMeta?.version,
    },
  };
}

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

function sendSseEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default router;
