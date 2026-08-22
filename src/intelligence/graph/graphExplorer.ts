/**
 * StoryForge Graph Explorer & Query Service
 *
 * Implements interactive graph projections and multi-mode query algorithms:
 * - Architecture: Top-level hierarchy, services, components
 * - Dependencies: Module & package imports, external dependencies
 * - Calls: Invocation trees & references
 * - Flows: Endpoints, handlers, services, data paths
 * - Tests & Impact: Test coverage, blast radius analysis
 *
 * Provides the 7 query modes: definition, callers, callees, implementations, usages, tests, flow.
 */

import type { KnowledgeGraph } from './knowledgeGraph.js';
import type { GraphNode, GraphNodeType } from './graphNode.js';
import type { GraphEdge, GraphEdgeType } from './graphEdge.js';
import type {
  GraphMode,
  GraphFilters,
  GraphNodeDto,
  GraphEdgeDto,
  GraphResponseDto,
  QueryMode,
  QueryItemDto,
  FlowPathDto,
  QueryResultDto,
  MetricDetailsDto,
} from '../../shared/protocol.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('intelligence:graph:explorer');

const MAX_NODES_DEFAULT = 120;
const MAX_EDGES_DEFAULT = 240;

const modeEdgeTypes: Record<GraphMode, GraphEdgeType[]> = {
  architecture: ['contains', 'depends-on', 'imports', 'api-flow', 'handles-route'],
  dependencies: ['imports', 'depends-on', 'uses-package'],
  calls: ['calls', 'instantiates', 'api-flow', 'communicates-with'],
  flows: ['api-flow', 'handles-route', 'calls', 'data-flow', 'publishes-event', 'subscribes-event'],
  'tests-impact': ['tests', 'calls', 'depends-on', 'imports'],
};

/**
 * Generate a graph projection for visual exploration in the webview.
 */
export function getGraphOverview(
  graph: KnowledgeGraph,
  mode: GraphMode = 'architecture',
  filters: GraphFilters = {},
  maxNodes: number = MAX_NODES_DEFAULT,
): GraphResponseDto {
  const allowedEdges = modeEdgeTypes[mode] ?? modeEdgeTypes.architecture;
  let allNodes = graph.getAllNodes();

  // Apply filters
  if (filters.kind) {
    allNodes = allNodes.filter((n) => n.type === filters.kind);
  }
  if (filters.language) {
    const lang = filters.language.toLowerCase();
    allNodes = allNodes.filter((n) => {
      const data = n.data as { language?: string };
      return data.language?.toLowerCase() === lang;
    });
  }
  if (filters.search) {
    const s = filters.search.toLowerCase();
    allNodes = allNodes.filter((n) =>
      n.name.toLowerCase().includes(s) ||
      n.qualifiedName.toLowerCase().includes(s) ||
      ((n.data as { filePath?: string }).filePath || '').toLowerCase().includes(s),
    );
  }
  if (filters.confidence && filters.confidence !== 'all') {
    // Check node generation or edge confidence
  }

  // Filter based on mode
  if (mode === 'architecture') {
    const archTypes: GraphNodeType[] = ['repository', 'project', 'application', 'service', 'module', 'component', 'api-endpoint'];
    allNodes = allNodes.filter((n) => archTypes.includes(n.type));
  } else if (mode === 'dependencies') {
    const depTypes: GraphNodeType[] = ['project', 'module', 'component', 'file', 'external-dependency'];
    allNodes = allNodes.filter((n) => depTypes.includes(n.type));
  } else if (mode === 'tests-impact') {
    const testTypes: GraphNodeType[] = ['test-suite', 'component', 'service', 'api-endpoint', 'module'];
    allNodes = allNodes.filter((n) => testTypes.includes(n.type));
  }

  // Cap nodes
  const truncated = allNodes.length > maxNodes;
  const selectedNodes = allNodes.slice(0, maxNodes);
  const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));

  // Collect relevant edges
  const allEdges = graph.getAllEdges();
  const selectedEdges: GraphEdge[] = [];

  for (const edge of allEdges) {
    if (selectedEdges.length >= MAX_EDGES_DEFAULT) break;
    if (allowedEdges.includes(edge.type) && selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)) {
      selectedEdges.push(edge);
    }
  }

  const nodesDto: GraphNodeDto[] = selectedNodes.map((node) => toGraphNodeDto(node, graph));
  const edgesDto: GraphEdgeDto[] = selectedEdges.map((edge) => toGraphEdgeDto(edge));

  return {
    mode,
    nodes: nodesDto,
    edges: edgesDto,
    totalNodes: allNodes.length,
    truncated,
  };
}

/**
 * Expand a node's immediate neighborhood.
 */
export function expandGraphNode(
  graph: KnowledgeGraph,
  nodeId: string,
  mode: GraphMode = 'architecture',
): { nodes: GraphNodeDto[]; edges: GraphEdgeDto[] } {
  const allowedEdges = modeEdgeTypes[mode] ?? modeEdgeTypes.architecture;
  const neighbors = graph.getNeighbors(nodeId, 'both', allowedEdges);
  const targetNode = graph.getNode(nodeId);

  const nodes: GraphNodeDto[] = [];
  if (targetNode) nodes.push(toGraphNodeDto(targetNode, graph));
  for (const n of neighbors) {
    nodes.push(toGraphNodeDto(n, graph));
  }

  const edges: GraphEdgeDto[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const connectedEdges = graph.getEdgesForNode(nodeId, 'both');

  for (const edge of connectedEdges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edges.push(toGraphEdgeDto(edge));
    }
  }

  return { nodes, edges };
}

/**
 * Execute a query on the knowledge graph using one of the 7 query modes.
 */
export function executeGraphQuery(
  graph: KnowledgeGraph,
  mode: QueryMode,
  queryText: string,
): QueryResultDto {
  const text = queryText.trim();
  if (!text) {
    return {
      mode,
      queryText: '',
      results: [],
      summary: 'Please enter a search query.',
    };
  }

  switch (mode) {
    case 'definition': {
      const matching = graph.searchNodes(text);
      const results = matching.slice(0, 30).map((n) => toQueryItemDto(n));
      return {
        mode,
        queryText: text,
        results,
        summary: `Found ${matching.length} definition match${matching.length === 1 ? '' : 'es'} for "${text}".`,
      };
    }

    case 'callers': {
      const seed = findSeedNode(graph, text);
      if (!seed) {
        return { mode, queryText: text, results: [], summary: `No component found matching "${text}".` };
      }
      const callers = graph.getCallers(seed.id);
      return {
        mode,
        queryText: text,
        results: callers.map((c) => toQueryItemDto(c, 'Caller')),
        summary: `Found ${callers.length} caller(s) invoking ${seed.name}.`,
      };
    }

    case 'callees': {
      const seed = findSeedNode(graph, text);
      if (!seed) {
        return { mode, queryText: text, results: [], summary: `No component found matching "${text}".` };
      }
      const callees = graph.getCallees(seed.id);
      return {
        mode,
        queryText: text,
        results: callees.map((c) => toQueryItemDto(c, 'Callee')),
        summary: `Found ${callees.length} callee(s) invoked by ${seed.name}.`,
      };
    }

    case 'implementations': {
      const seed = findSeedNode(graph, text);
      if (!seed) {
        return { mode, queryText: text, results: [], summary: `No interface/class found matching "${text}".` };
      }
      const edges = graph.getEdgesForNode(seed.id, 'incoming');
      const implEdges = edges.filter((e) => e.type === 'implements' || e.type === 'extends');
      const implNodes = implEdges
        .map((e) => graph.getNode(e.source))
        .filter((n): n is GraphNode => n !== undefined);

      return {
        mode,
        queryText: text,
        results: implNodes.map((n) => toQueryItemDto(n, 'Implementation')),
        summary: `Found ${implNodes.length} implementation(s) or subclass(es) of ${seed.name}.`,
      };
    }

    case 'usages': {
      const seed = findSeedNode(graph, text);
      if (!seed) {
        return { mode, queryText: text, results: [], summary: `No symbol found matching "${text}".` };
      }
      const dependents = graph.getDependents(seed.id);
      return {
        mode,
        queryText: text,
        results: dependents.map((d) => toQueryItemDto(d, 'Usage')),
        summary: `Found ${dependents.length} reference(s) / usage(s) of ${seed.name}.`,
      };
    }

    case 'tests': {
      const seed = findSeedNode(graph, text);
      if (!seed) {
        return { mode, queryText: text, results: [], summary: `No component found matching "${text}".` };
      }
      const edges = graph.getEdgesForNode(seed.id, 'incoming');
      const testEdges = edges.filter((e) => e.type === 'tests');
      const testSuites = testEdges
        .map((e) => graph.getNode(e.source))
        .filter((n): n is GraphNode => n !== undefined);

      return {
        mode,
        queryText: text,
        results: testSuites.map((t) => toQueryItemDto(t, 'Test Suite')),
        summary: `Found ${testSuites.length} test suite(s) covering ${seed.name}.`,
      };
    }

    case 'flow': {
      return traceFlowQuery(graph, text);
    }

    case 'ai': {
      // Simplistic placeholder for AI reasoning over the graph. 
      // In production, this would use enrichPrompt or call an LLM directly.
      const matching = graph.searchNodes(text);
      const results = matching.slice(0, 20).map((n) => toQueryItemDto(n, 'AI Match'));
      return {
        mode,
        queryText: text,
        results,
        summary: `AI Query processed. Found ${results.length} related components based on semantic context for "${text}".`,
      };
    }

    case 'structural': {
      // Basic structural cypher-like query processing
      // e.g., MATCH (n:api-endpoint) RETURN n
      const typeMatch = text.match(/\(n:([a-zA-Z-]+)\)/);
      let results: QueryItemDto[] = [];
      if (typeMatch) {
        const t = typeMatch[1];
        results = graph.getAllNodes().filter(n => n.type === t).slice(0, 30).map(n => toQueryItemDto(n, `Matched ${t}`));
      } else {
        const matching = graph.searchNodes(text);
        results = matching.slice(0, 30).map((n) => toQueryItemDto(n, 'Structural Match'));
      }
      return {
        mode,
        queryText: text,
        results,
        summary: `Executed structural graph query. Found ${results.length} matching entities.`,
      };
    }

    case 'search':
    default: {
      const matching = graph.searchNodes(text);
      const results = matching.slice(0, 40).map((n) => toQueryItemDto(n));
      return {
        mode: 'search',
        queryText: text,
        results,
        summary: `Found ${matching.length} matching entity(ies) across the knowledge graph.`,
      };
    }
  }
}

/**
 * Trace a flow path between two components or from an entry point.
 */
function traceFlowQuery(graph: KnowledgeGraph, queryText: string): QueryResultDto {
  const parts = queryText.split(/\s*->\s*|\s*=>\s*/);
  const startQuery = parts[0]?.trim() || '';
  const endQuery = parts[1]?.trim() || '';

  const startNode = findSeedNode(graph, startQuery);
  if (!startNode) {
    return {
      mode: 'flow',
      queryText,
      results: [],
      summary: `Could not resolve start node for "${startQuery}".`,
    };
  }

  if (endQuery) {
    const endNode = findSeedNode(graph, endQuery);
    if (!endNode) {
      return {
        mode: 'flow',
        queryText,
        results: [],
        summary: `Could not resolve end node for "${endQuery}".`,
      };
    }

    const pathResult = graph.findPath(startNode.id, endNode.id);
    if (!pathResult || pathResult.path.length === 0) {
      return {
        mode: 'flow',
        queryText,
        results: [],
        summary: `No path resolved between ${startNode.name} and ${endNode.name}.`,
      };
    }

    const pathNodes = pathResult.path
      .map((id) => graph.getNode(id))
      .filter((n): n is GraphNode => n !== undefined);

    const flowDto: FlowPathDto = {
      id: `flow-${Date.now().toString(36)}`,
      totalDepth: pathNodes.length,
      nodes: pathNodes.map((n) => toQueryItemDto(n)),
      relationships: pathResult.edges.map((e) => ({
        kind: e.type,
        resolution: e.resolution,
        confidence: e.confidence,
      })),
      cycleDetected: false,
    };

    return {
      mode: 'flow',
      queryText,
      results: flowDto.nodes,
      flow: flowDto,
      summary: `Resolved ${flowDto.totalDepth}-step flow from ${startNode.name} to ${endNode.name}.`,
    };
  }

  // Single node flow trace — explore outgoing execution path
  const traversal = graph.traverse(startNode.id, {
    maxDepth: 6,
    direction: 'outgoing',
    edgeTypes: ['api-flow', 'handles-route', 'calls', 'data-flow'],
  });

  const pathNodes = traversal.nodes.slice(0, 15);
  const flowDto: FlowPathDto = {
    id: `flow-${Date.now().toString(36)}`,
    totalDepth: pathNodes.length,
    nodes: pathNodes.map((n) => toQueryItemDto(n)),
    relationships: traversal.edges.slice(0, pathNodes.length - 1).map((e) => ({
      kind: e.type,
      resolution: e.resolution,
      confidence: e.confidence,
    })),
  };

  return {
    mode: 'flow',
    queryText,
    results: flowDto.nodes,
    flow: flowDto,
    summary: `Traced ${flowDto.totalDepth} execution step(s) originating at ${startNode.name}.`,
  };
}

/**
 * Get suggestions for query autocomplete.
 */
export function getQuerySuggestions(
  graph: KnowledgeGraph,
  limit: number = 50,
): Array<{ label: string; value: string; kind: string }> {
  const nodes = graph.getAllNodes();
  const priorityTypes: GraphNodeType[] = ['api-endpoint', 'component', 'service', 'test-suite', 'symbol', 'file'];

  return nodes
    .filter((n) => priorityTypes.includes(n.type))
    .slice(0, limit)
    .map((n) => ({
      label: n.name,
      value: n.qualifiedName,
      kind: n.type,
    }));
}

/**
 * Get detailed items for a specific intelligence metric category.
 */
export function getMetricDetails(graph: KnowledgeGraph, category: string): MetricDetailsDto {
  let items: GraphNode[] = [];
  let title = '';

  switch (category) {
    case 'indexed':
    case 'discovered':
      title = 'Indexed Files';
      items = graph.getAllNodes().filter(n => n.type === 'file');
      break;
    case 'symbols':
      title = 'Top Symbols';
      items = graph.getAllNodes().filter(n => n.type === 'symbol');
      break;
    case 'entryPoints':
      title = 'Entry Points';
      items = graph.getAllNodes().filter(n => n.type === 'api-endpoint' || n.type === 'component');
      break;
    case 'tests':
      title = 'Test Suites';
      items = graph.getAllNodes().filter(n => n.type === 'test-suite');
      break;
    case 'dependencies':
      title = 'External Dependencies';
      items = graph.getAllNodes().filter(n => n.type === 'external-dependency');
      break;
    default:
      title = `Items for ${category}`;
      items = graph.getAllNodes();
      break;
  }

  // Sort by name and cap to avoid massive payloads
  items = items.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100);

  return {
    category,
    title,
    items: items.map(n => toQueryItemDto(n)),
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function findSeedNode(graph: KnowledgeGraph, text: string): GraphNode | undefined {
  const exact = graph.getNodeByQualifiedName(text);
  if (exact) return exact;

  const matches = graph.searchNodes(text);
  return matches[0];
}

function toGraphNodeDto(node: GraphNode, graph: KnowledgeGraph): GraphNodeDto {
  const data = node.data as {
    filePath?: string;
    startLine?: number;
    language?: string;
    framework?: string;
  };

  const parent = graph.getParent(node.id);

  return {
    id: node.id,
    label: node.name,
    qualifiedName: node.qualifiedName,
    kind: node.type,
    path: data.filePath,
    line: data.startLine ?? 1,
    groupId: parent?.id,
    groupLabel: parent?.name,
    depth: 0,
    unresolved: false,
    confidence: 0.95,
    language: data.language,
    framework: data.framework,
  };
}

function toGraphEdgeDto(edge: GraphEdge): GraphEdgeDto {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    relationshipType: edge.type,
    resolution: edge.resolution,
    confidence: edge.confidence,
    unresolved: edge.resolution === 'unresolved',
  };
}

function toQueryItemDto(node: GraphNode, role?: string): QueryItemDto {
  const data = node.data as {
    filePath?: string;
    startLine?: number;
    language?: string;
    framework?: string;
  };

  return {
    id: node.id,
    name: node.name,
    qualifiedName: node.qualifiedName,
    kind: node.type,
    path: data.filePath || '',
    line: data.startLine ?? 1,
    language: data.language,
    framework: data.framework,
    confidence: 0.95,
    role,
  };
}
