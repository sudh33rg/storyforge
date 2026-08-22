/**
 * Model Context Protocol (MCP) Types & Tool Schemas
 *
 * Implements the MCP (Model Context Protocol) specification (JSON-RPC 2.0)
 * to allow external AI coding agents (Claude Code, Cursor, Windsurf, Copilot,
 * Antigravity, Cline) to query StoryForge's 5-Tier Knowledge Graph.
 */

// ─── JSON-RPC 2.0 Core Types ─────────────────────────────────────────────────

export interface JsonRpcRequest<TParams = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly method: string;
  readonly params?: TParams;
}

export interface JsonRpcNotification<TParams = unknown> {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: TParams;
}

export interface JsonRpcResponse<TResult = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly result?: TResult;
  readonly error?: JsonRpcError;
}

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ─── MCP Protocol Handshake ──────────────────────────────────────────────────

export interface McpInitializeParams {
  readonly protocolVersion: string;
  readonly capabilities: {
    readonly roots?: { listChanged?: boolean };
    readonly sampling?: Record<string, unknown>;
  };
  readonly clientInfo: {
    readonly name: string;
    readonly version: string;
  };
}

export interface McpInitializeResult {
  readonly protocolVersion: string;
  readonly capabilities: {
    readonly tools?: { listChanged?: boolean };
    readonly resources?: { subscribe?: boolean; listChanged?: boolean };
    readonly prompts?: { listChanged?: boolean };
  };
  readonly serverInfo: {
    readonly name: string;
    readonly version: string;
  };
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: 'object';
    readonly properties: Record<string, {
      readonly type: string;
      readonly description: string;
      readonly enum?: readonly string[];
      readonly items?: { readonly type: string };
    }>;
    readonly required?: readonly string[];
  };
}

export interface McpToolCallParams {
  readonly name: string;
  readonly arguments?: Record<string, unknown>;
}

export interface McpToolContentItem {
  readonly type: 'text';
  readonly text: string;
}

export interface McpToolCallResult {
  readonly content: McpToolContentItem[];
  readonly isError?: boolean;
}

// ─── Available StoryForge MCP Tools ──────────────────────────────────────────

export const STORYFORGE_MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'search_codebase',
    description: 'Semantic hybrid (BM25 + Dense vector + RRF) search across all symbols, components, services, and files in the repository knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query or intent (e.g. "authentication token validation", "SQL user repository")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_node_impact',
    description: 'Calculate the blast radius and multi-ring change impact of modifying a specific symbol, file, or component.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIdOrName: {
          type: 'string',
          description: 'The entity ID, symbol name, or file path to analyze impact for',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum traversal depth for transitive impact (default: 4)',
        },
      },
      required: ['nodeIdOrName'],
    },
  },
  {
    name: 'get_capability_chain',
    description: 'Generates the 11-stage grounded capability reasoning flow (Entrypoint -> UI -> State -> API -> Controller -> Service -> Model -> DB -> Tests -> Infra) for a feature intent.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'Feature intent or description (e.g. "User login and session management")',
        },
        keywords: {
          type: 'array',
          description: 'Optional array of domain keywords to anchor the capability reasoning',
          items: { type: 'string' },
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'list_api_endpoints',
    description: 'List all detected API routes, methods, paths, and their corresponding handler components across all languages in the repository.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_architecture_overview',
    description: 'Get high-level repository architectural summary: detected patterns (MVC, layered, microservices), frameworks, language breakdown, and layer distributions.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_code_quality',
    description: 'Get repository code quality metrics: cyclomatic complexity per function, fan-in/fan-out coupling, circular dependency detection, hot spots, and maintainability index.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_documentation_health',
    description: 'Audit repository documentation health: public functions missing docstrings, API routes missing OpenAPI/JSDoc descriptions, modules missing READMEs, and remediation hints.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_graph_diff',
    description: 'Compare the current knowledge graph generation against the previous generation snapshot: added, removed, and modified nodes/edges with churn rate.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'execute_graph_query',
    description: 'Query the knowledge graph for specific structural relationships: callers, callees, usages, implementations, tests, or end-to-end execution flows.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: 'Query mode to execute',
          enum: ['definition', 'callers', 'callees', 'implementations', 'usages', 'tests', 'flow', 'structural'],
        },
        text: {
          type: 'string',
          description: 'Target symbol, entity name, or qualified name to query',
        },
      },
      required: ['mode', 'text'],
    },
  },
];
