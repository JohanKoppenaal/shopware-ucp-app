/**
 * MCP (Model Context Protocol) Type Definitions
 * JSON-RPC 2.0 protocol types for LLM tool integration
 */

// ============================================================================
// JSON-RPC 2.0 Types
// ============================================================================

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: JsonRpcParams;
}

export type JsonRpcParams = Record<string, unknown>;

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard JSON-RPC error codes
export const JsonRpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ============================================================================
// MCP Protocol Types
// ============================================================================

export interface McpInitializeRequest {
  protocolVersion: string;
  capabilities: McpClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface McpInitializeResponse {
  protocolVersion: string;
  capabilities: McpServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface McpClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: object;
}

export interface McpServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: object;
}

// ============================================================================
// MCP Tool Types
// ============================================================================

export interface McpTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
  additionalProperties?: boolean;
  description?: string;
}

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface McpToolsListResponse {
  tools: McpTool[];
}

export interface McpToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpToolCallResponse {
  content: McpContent[];
  isError?: boolean;
}

export interface McpContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: {
    uri: string;
    mimeType?: string;
    text?: string;
  };
}

// ============================================================================
// MCP Meta Types (UCP specific)
// ============================================================================

export interface McpMeta {
  ucp?: McpUcpMeta;
}

export interface McpUcpMeta {
  profile?: string; // URL to UCP profile
  shopId?: string; // Shop identifier
  capabilities?: string[]; // Platform capabilities
  version?: string; // UCP version
}

// ============================================================================
// MCP Resource Types
// ============================================================================

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourcesListResponse {
  resources: McpResource[];
}

export interface McpResourceReadRequest {
  uri: string;
}

export interface McpResourceReadResponse {
  contents: McpResourceContent[];
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

// ============================================================================
// MCP Notification Types
// ============================================================================

export interface McpNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface McpProgressNotification {
  progressToken: string | number;
  progress: number;
  total?: number;
}

// ============================================================================
// Streamable HTTP Types
// ============================================================================

export interface SseMessage {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

export interface McpStreamRequest extends JsonRpcRequest {
  params?: JsonRpcParams & {
    _stream?: boolean;
  };
}

// ============================================================================
// Tool Handler Types
// ============================================================================

export interface McpToolHandler {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  handler: (
    args: Record<string, unknown>,
    meta: McpMeta
  ) => Promise<McpToolCallResponse>;
}

export interface McpToolContext {
  shopId: string;
  profileUrl?: string;
  capabilities?: string[];
  requestId: string | number | null;
}
