/**
 * StoryForge Model Context Protocol (MCP) Server
 *
 * Implements the standard MCP JSON-RPC 2.0 Server over stdio / programmatic transport.
 * Allows AI coding assistants (Claude Code, Cursor, Windsurf, Copilot, Antigravity)
 * to directly interface with StoryForge's repository intelligence.
 */

import { createLogger } from '../../shared/logger.js';
import type { IntelligenceEngine } from '../engine.js';
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcError,
  type McpInitializeResult,
  MCP_ERROR_CODES,
  STORYFORGE_MCP_TOOLS,
} from './mcpTypes.js';
import { McpToolHandlers } from './mcpToolHandlers.js';

const log = createLogger('intelligence:mcp:server');

export class McpServer {
  private readonly toolHandlers: McpToolHandlers;
  private isInitialized = false;

  constructor(private readonly engine: IntelligenceEngine) {
    this.toolHandlers = new McpToolHandlers(engine);
  }

  /**
   * Process a raw JSON-RPC 2.0 message string and return JSON-RPC response string.
   */
  async processMessage(rawMessage: string): Promise<string | null> {
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(rawMessage) as JsonRpcRequest;
    } catch {
      return JSON.stringify(this.createErrorResponse(null, MCP_ERROR_CODES.PARSE_ERROR, 'Parse error: invalid JSON'));
    }

    if (!request || request.jsonrpc !== '2.0' || !request.method) {
      return JSON.stringify(this.createErrorResponse(request?.id ?? null, MCP_ERROR_CODES.INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request'));
    }

    const response = await this.handleRequest(request);
    return response ? JSON.stringify(response) : null;
  }

  /**
   * Handle parsed JSON-RPC request.
   */
  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const { id, method, params } = request;

    log.debug('Processing MCP method', { method, id });

    switch (method) {
      case 'initialize': {
        this.isInitialized = true;
        const result: McpInitializeResult = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: 'storyforge-intelligence-mcp',
            version: '0.1.0',
          },
        };
        return this.createSuccessResponse(id, result);
      }

      case 'notifications/initialized': {
        // Handshake notification (no response needed for notifications without ID)
        return id !== undefined ? this.createSuccessResponse(id, {}) : null;
      }

      case 'ping': {
        return this.createSuccessResponse(id, {});
      }

      case 'tools/list': {
        return this.createSuccessResponse(id, {
          tools: STORYFORGE_MCP_TOOLS,
        });
      }

      case 'tools/call': {
        const toolParams = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = toolParams?.name;
        const toolArgs = toolParams?.arguments || {};

        if (!toolName) {
          return this.createErrorResponse(id, MCP_ERROR_CODES.INVALID_PARAMS, 'Missing required param "name" for tools/call');
        }

        const callResult = await this.toolHandlers.handleToolCall(toolName, toolArgs);
        return this.createSuccessResponse(id, callResult);
      }

      default:
        return this.createErrorResponse(
          id,
          MCP_ERROR_CODES.METHOD_NOT_FOUND,
          `Method not found: ${method}`,
        );
    }
  }

  /**
   * Start listening on standard input/output for standalone CLI / agent usage.
   */
  startStdio(): void {
    let buffer = '';

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', async (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const response = await this.processMessage(trimmed);
          if (response) {
            process.stdout.write(response + '\n');
          }
        } catch (err) {
          log.error('Failed to process MCP stdio line', { error: String(err) });
        }
      }
    });

    log.info('MCP Stdio server listening for JSON-RPC 2.0 requests');
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private createSuccessResponse<T>(id: string | number | null, result: T): JsonRpcResponse<T> {
    return {
      jsonrpc: '2.0',
      id: id ?? 0,
      result,
    };
  }

  private createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown,
  ): JsonRpcResponse {
    const error: JsonRpcError = { code, message, data };
    return {
      jsonrpc: '2.0',
      id: id ?? 0,
      error,
    };
  }
}
