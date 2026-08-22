/**
 * Model Context Protocol (MCP) Tool Handlers
 *
 * Implements execution handlers for each tool in STORYFORGE_MCP_TOOLS.
 * Direct bridge between MCP client requests and IntelligenceEngine / KnowledgeGraph.
 */

import type { IntelligenceEngine } from '../engine.js';
import type { McpToolCallResult } from './mcpTypes.js';
import { analyzeImpact } from '../graph/graphQuery.js';
import { executeGraphQuery } from '../graph/graphExplorer.js';
import type { QueryMode } from '../../shared/protocol.js';

export class McpToolHandlers {
  constructor(private readonly engine: IntelligenceEngine) {}

  /**
   * Execute an MCP tool call by name with arguments.
   */
  async handleToolCall(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<McpToolCallResult> {
    try {
      switch (name) {
        case 'search_codebase':
          return this.handleSearchCodebase(args);
        case 'get_node_impact':
          return this.handleGetNodeImpact(args);
        case 'get_capability_chain':
          return this.handleGetCapabilityChain(args);
        case 'list_api_endpoints':
          return this.handleListApiEndpoints();
        case 'get_architecture_overview':
          return this.handleGetArchitectureOverview();
        case 'get_code_quality':
          return this.handleGetCodeQuality();
        case 'get_documentation_health':
          return this.handleGetDocumentationHealth();
        case 'get_graph_diff':
          return this.handleGetGraphDiff();
        case 'execute_graph_query':
          return this.handleExecuteGraphQuery(args);
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      return {
        content: [{
          type: 'text',
          text: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }

  // ─── Individual Tool Handlers ────────────────────────────────────────────────

  private handleSearchCodebase(args: Record<string, unknown>): McpToolCallResult {
    const query = String(args.query || '');
    const limit = typeof args.limit === 'number' ? args.limit : 10;

    if (!query) {
      return { content: [{ type: 'text', text: 'Missing required argument: query' }], isError: true };
    }

    const matches = this.engine.searchSemantic(query, limit);
    const formatted = matches.map((m, idx) => {
      const data = m.node.data as unknown as Record<string, unknown>;
      return `${idx + 1}. [${m.node.type}] ${m.node.name} (${m.node.qualifiedName})\n` +
        `   Path: ${data?.filePath || 'N/A'}\n` +
        `   Relevance Score: ${Math.round(m.score * 10) / 10} (BM25: ${Math.round(m.bm25Score * 10) / 10}, Dense: ${Math.round(m.denseScore * 100) / 100})\n` +
        (m.matchedTerms.length > 0 ? `   Matched terms: ${m.matchedTerms.join(', ')}\n` : '');
    }).join('\n');

    return {
      content: [{
        type: 'text',
        text: matches.length > 0
          ? `Found ${matches.length} semantic matches for "${query}":\n\n${formatted}`
          : `No semantic matches found for "${query}".`,
      }],
    };
  }

  private handleGetNodeImpact(args: Record<string, unknown>): McpToolCallResult {
    const targetQuery = String(args.nodeIdOrName || '');
    const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : 4;

    if (!targetQuery) {
      return { content: [{ type: 'text', text: 'Missing required argument: nodeIdOrName' }], isError: true };
    }

    const graph = this.engine.getGraph();
    let target = graph.getNode(targetQuery);
    if (!target) {
      const allNodes = graph.getAllNodes();
      target = allNodes.find(n => n.name === targetQuery || n.qualifiedName === targetQuery);
    }

    if (!target) {
      return {
        content: [{ type: 'text', text: `Node not found in knowledge graph: "${targetQuery}"` }],
        isError: true,
      };
    }

    const impact = analyzeImpact(graph, target.id, maxDepth);
    const totalImpacted = impact.directImpact.length + impact.transitiveImpact.length +
      impact.affectedTests.length + impact.affectedApis.length;

    const risk = totalImpacted >= 20 ? 'CRITICAL' : totalImpacted >= 10 ? 'HIGH' : totalImpacted >= 4 ? 'MEDIUM' : 'LOW';

    const getNodePath = (n: { data: unknown }) => (n.data as Record<string, unknown>)?.filePath || '';

    const text = [
      `# Impact Analysis for: ${target.name} [${target.type}]`,
      `Target Node ID: ${target.id}`,
      `File: ${(target.data as unknown as Record<string, unknown>)?.filePath || 'N/A'}`,
      `Overall Risk Level: ${risk} (${totalImpacted} total entities impacted)`,
      '',
      `## 1. Direct Impact (${impact.directImpact.length} entities):`,
      ...impact.directImpact.map(n => `- [${n.type}] ${n.name} (${getNodePath(n)})`),
      '',
      `## 2. Transitive Impact (${impact.transitiveImpact.length} entities):`,
      ...impact.transitiveImpact.map(n => `- [${n.type}] ${n.name} (${getNodePath(n)})`),
      '',
      `## 3. Affected Tests (${impact.affectedTests.length} test suites):`,
      ...impact.affectedTests.map(n => `- [test] ${n.name} (${getNodePath(n)})`),
      '',
      `## 4. Affected API Endpoints (${impact.affectedApis.length} endpoints):`,
      ...impact.affectedApis.map(n => `- [api] ${n.name} (${getNodePath(n)})`),
    ].join('\n');

    return { content: [{ type: 'text', text }] };
  }

  private handleGetCapabilityChain(args: Record<string, unknown>): McpToolCallResult {
    const intent = String(args.intent || '');
    const keywords = Array.isArray(args.keywords) ? args.keywords.map(String) : [];

    if (!intent) {
      return { content: [{ type: 'text', text: 'Missing required argument: intent' }], isError: true };
    }

    const chain = this.engine.buildCapabilityChain(intent, keywords);

    const stagesText = chain.stages.map(s => {
      return `### Stage ${s.stageNumber}: ${s.label} (${s.stage})\n` +
        `  Entity: ${s.entityName || 'Unresolved Gap'}\n` +
        `  Location: ${s.filePath || 'N/A'}\n` +
        `  Description: ${s.description}\n` +
        `  Confidence: ${Math.round(s.confidence * 100)}%\n` +
        (s.evidence.length > 0 ? `  Evidence: ${s.evidence.map(e => e.description).join(', ')}\n` : '');
    }).join('\n');

    const output = [
      `# 11-Stage Capability Reasoning Flow for: "${intent}"`,
      `Overall Confidence: ${Math.round(chain.overallConfidence * 100)}%`,
      `Gaps Detected: ${chain.gaps.length} (${chain.gaps.map(g => g.description).join(', ') || 'None'})`,
      '',
      stagesText,
    ].join('\n');

    return { content: [{ type: 'text', text: output }] };
  }

  private handleListApiEndpoints(): McpToolCallResult {
    const graph = this.engine.getGraph();
    const endpoints = graph.getNodesByType('api-endpoint');

    if (endpoints.length === 0) {
      return { content: [{ type: 'text', text: 'No API endpoints detected in the workspace.' }] };
    }

    const rows = endpoints.map((ep, idx) => {
      const data = ep.data as unknown as Record<string, unknown>;
      const method = String(data?.method || 'GET');
      const path = String(data?.path || ep.name);
      const filePath = String(data?.filePath || 'N/A');
      return `${idx + 1}. [${method}] ${path}  -->  ${filePath}`;
    }).join('\n');

    return {
      content: [{
        type: 'text',
        text: `Discovered ${endpoints.length} API Endpoints:\n\n${rows}`,
      }],
    };
  }

  private handleGetArchitectureOverview(): McpToolCallResult {
    const report = this.engine.getArchitectureReport();
    if (!report) {
      return { content: [{ type: 'text', text: 'Architecture analysis not available yet. Refresh intelligence first.' }] };
    }

    const output = [
      `# Repository Architecture Overview`,
      `Summary: ${report.summary}`,
      `Detected Patterns: ${report.patterns.join(', ') || 'Unknown'}`,
      '',
      `## Frameworks (${report.frameworks.length}):`,
      ...report.frameworks.map((f: { name: string; version?: string; category: string }) => `- ${f.name}${f.version ? ` (${f.version})` : ''} [${f.category}]`),
      '',
      `## Language Distribution:`,
      ...report.languages.map((l: { language: string; fileCount: number; symbolCount: number; percentage: number }) => `- ${l.language}: ${l.fileCount} files, ${l.symbolCount} symbols (${l.percentage}%)`),
      '',
      `## Test Coverage:`,
      `- Test files: ${report.testCoverage.testFileCount} / ${report.testCoverage.totalFileCount} (${report.testCoverage.testPercentage}%)`,
      `- Frameworks: ${report.testCoverage.testFrameworks.join(', ') || 'None detected'}`,
    ].join('\n');

    return { content: [{ type: 'text', text: output }] };
  }

  private handleGetCodeQuality(): McpToolCallResult {
    const quality = this.engine.getQualityMetrics();
    if (!quality) {
      return { content: [{ type: 'text', text: 'Code quality metrics not available. Refresh intelligence first.' }] };
    }

    const output = [
      `# Code Quality & Maintainability Report`,
      `Maintainability Index: ${quality.maintainabilityGrade} (${quality.maintainabilityScore}/100)`,
      `Average Cyclomatic Complexity: ${quality.avgCyclomaticComplexity}`,
      `P90 Cyclomatic Complexity: ${quality.p90CyclomaticComplexity}`,
      `Circular Dependencies: ${quality.circularDependencyCount}`,
      `Hot Spots: ${quality.hotSpots.length}`,
      '',
      `## Top Issues:`,
      ...(quality.topIssues.length > 0 ? quality.topIssues.map(i => `- ${i}`) : ['- No critical quality issues identified']),
      '',
      `## Top 5 Most Complex Functions:`,
      ...quality.symbolComplexity.slice(0, 5).map(s => `- ${s.name} (CC: ${s.cyclomaticComplexity}, ${s.complexityRating}) in ${s.filePath}`),
      '',
      `## Circular Dependency Chains:`,
      ...(quality.circularDependencies.length > 0
        ? quality.circularDependencies.slice(0, 5).map(c => `- [${c.severity}] ${c.cycleNames.join(' -> ')} -> ${c.cycleNames[0]}`)
        : ['- None. Clean module dependency graph.']),
    ].join('\n');

    return { content: [{ type: 'text', text: output }] };
  }

  private handleGetDocumentationHealth(): McpToolCallResult {
    const docHealth = this.engine.getDocumentationHealth();
    if (!docHealth) {
      return { content: [{ type: 'text', text: 'Documentation health not available.' }] };
    }

    const output = [
      `# Documentation Health Report`,
      `Grade: ${docHealth.grade} (${docHealth.coveragePercent}% coverage)`,
      `Audited Entities: ${docHealth.totalEntitiesAudited} (${docHealth.documentedCount} documented, ${docHealth.undocumentedCount} undocumented)`,
      `Critical Gaps (Public API): ${docHealth.criticalGaps.length}`,
      `Warnings: ${docHealth.warningGaps.length}`,
      '',
      `## Critical Remediation Actions:`,
      ...docHealth.criticalGaps.slice(0, 8).map(g => `- [${g.entityType}] ${g.remediation}`),
    ].join('\n');

    return { content: [{ type: 'text', text: output }] };
  }

  private handleGetGraphDiff(): McpToolCallResult {
    const diff = this.engine.getGraphDiff();
    if (!diff) {
      return { content: [{ type: 'text', text: 'No previous generation snapshot available to diff against. Run multiple scans to track changes.' }] };
    }

    const output = [
      `# Knowledge Graph Diff (Gen ${diff.fromGeneration} -> Gen ${diff.toGeneration})`,
      `Churn Rate: ${Math.round(diff.summary.churnRate * 100)}%`,
      `Nodes Added: +${diff.summary.nodesAdded} | Removed: -${diff.summary.nodesRemoved} | Modified: ~${diff.summary.nodesModified}`,
      `Edges Added: +${diff.summary.edgesAdded} | Removed: -${diff.summary.edgesRemoved} | Modified: ~${diff.summary.edgesModified}`,
      `Net Node Change: ${diff.summary.netNodeChange >= 0 ? `+${diff.summary.netNodeChange}` : diff.summary.netNodeChange}`,
      '',
      `## Significant Changes:`,
      ...diff.significantChanges.map(c => `- [${c.changeType.toUpperCase()}] ${c.type}: ${c.name} (${c.reason})`),
    ].join('\n');

    return { content: [{ type: 'text', text: output }] };
  }

  private handleExecuteGraphQuery(args: Record<string, unknown>): McpToolCallResult {
    const mode = String(args.mode || 'definition') as QueryMode;
    const text = String(args.text || '');

    if (!text) {
      return { content: [{ type: 'text', text: 'Missing required argument: text' }], isError: true };
    }

    const graph = this.engine.getGraph();
    const result = executeGraphQuery(graph, mode, text);

    const itemsText = result.results.map((r, i) => {
      return `${i + 1}. [${r.kind}] ${r.name} (${r.qualifiedName}) -> ${r.path}:${r.line}`;
    }).join('\n');

    const output = [
      `# Graph Query: ${mode.toUpperCase()} for "${text}"`,
      `Summary: ${result.summary}`,
      `Results Count: ${result.results.length}`,
      '',
      itemsText || 'No items matched.',
    ].join('\n');

    return { content: [{ type: 'text', text: output }] };
  }
}
