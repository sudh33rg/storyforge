/**
 * MCP Server & Tool Execution Tests
 *
 * Tests JSON-RPC 2.0 protocol compliance, tool registration, and tool invocation
 * for AI agent interoperability.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IntelligenceEngine } from '../../src/intelligence/engine';
import { McpServer } from '../../src/intelligence/mcp/mcpServer';
import { STORYFORGE_MCP_TOOLS } from '../../src/intelligence/mcp/mcpTypes';

describe('MCP (Model Context Protocol) Server', () => {
  let engine: IntelligenceEngine;
  let server: McpServer;

  beforeEach(() => {
    engine = new IntelligenceEngine({
      workspaceRoot: '/test-workspace',
      workspaceName: 'test-workspace',
    });
    server = new McpServer(engine);
  });

  it('should handle initialize request adhering to MCP spec', async () => {
    const rawRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-agent', version: '1.0' },
      },
    });

    const responseStr = await server.processMessage(rawRequest);
    expect(responseStr).toBeDefined();

    const response = JSON.parse(responseStr!);
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result.protocolVersion).toBe('2024-11-05');
    expect(response.result.serverInfo.name).toBe('storyforge-intelligence-mcp');
  });

  it('should list all available tools on tools/list', async () => {
    const rawRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    const responseStr = await server.processMessage(rawRequest);
    const response = JSON.parse(responseStr!);

    expect(response.result.tools).toBeDefined();
    expect(response.result.tools.length).toBe(STORYFORGE_MCP_TOOLS.length);

    const toolNames = response.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('search_codebase');
    expect(toolNames).toContain('get_node_impact');
    expect(toolNames).toContain('get_capability_chain');
    expect(toolNames).toContain('get_code_quality');
    expect(toolNames).toContain('get_documentation_health');
    expect(toolNames).toContain('get_graph_diff');
  });

  it('should execute tools/call for search_codebase', async () => {
    const rawRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'search_codebase',
        arguments: { query: 'authentication', limit: 5 },
      },
    });

    const responseStr = await server.processMessage(rawRequest);
    const response = JSON.parse(responseStr!);

    expect(response.result).toBeDefined();
    expect(response.result.content).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
  });

  it('should return error for invalid JSON-RPC requests', async () => {
    const responseStr = await server.processMessage('not a json');
    const response = JSON.parse(responseStr!);
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32700);
  });

  it('should return error for unknown methods', async () => {
    const rawRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'unknown/method',
    });

    const responseStr = await server.processMessage(rawRequest);
    const response = JSON.parse(responseStr!);
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32601);
  });
});
