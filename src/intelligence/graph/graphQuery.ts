/**
 * Graph Query API
 *
 * High-level query operations on the knowledge graph.
 * These queries answer the questions StoryForge needs to reason about features:
 *
 * - "What would changing X affect?"
 * - "What is the API flow for this endpoint?"
 * - "What tests cover this component?"
 * - "Which services communicate with each other?"
 */

import type { GraphNode, GraphNodeType } from './graphNode.js';
import type { GraphEdge, GraphEdgeType } from './graphEdge.js';
import type { KnowledgeGraph, GraphQueryResult } from './knowledgeGraph.js';
import type { EntityId, ArchitecturalLayer, ArchitecturalRole } from '../../shared/types.js';

// ─── Impact Analysis ─────────────────────────────────────────────────────────

export interface ImpactAnalysisResult {
  /** The node being changed */
  readonly target: GraphNode;
  /** Directly affected nodes */
  readonly directImpact: GraphNode[];
  /** Transitively affected nodes */
  readonly transitiveImpact: GraphNode[];
  /** Tests that may be affected */
  readonly affectedTests: GraphNode[];
  /** API endpoints that may be affected */
  readonly affectedApis: GraphNode[];
  /** Services that may be affected */
  readonly affectedServices: GraphNode[];
  /** All evidence for the impact chain */
  readonly impactEdges: GraphEdge[];
}

/**
 * Analyze the impact of changing a specific node.
 */
export function analyzeImpact(
  graph: KnowledgeGraph,
  nodeId: EntityId,
  maxDepth: number = 4,
): ImpactAnalysisResult {
  const target = graph.getNode(nodeId);
  if (!target) {
    return {
      target: target!,
      directImpact: [],
      transitiveImpact: [],
      affectedTests: [],
      affectedApis: [],
      affectedServices: [],
      impactEdges: [],
    };
  }

  // Direct dependents (things that depend on / call / import this node)
  const directResult = graph.traverse(nodeId, {
    maxDepth: 1,
    direction: 'incoming',
    edgeTypes: ['imports', 'depends-on', 'calls', 'extends', 'implements', 'type-reference'],
  });

  // Transitive dependents (up to maxDepth)
  const transitiveResult = graph.traverse(nodeId, {
    maxDepth,
    direction: 'incoming',
    edgeTypes: ['imports', 'depends-on', 'calls', 'extends', 'implements'],
  });

  // Find affected tests
  const testResult = graph.traverse(nodeId, {
    maxDepth: maxDepth + 1,
    direction: 'incoming',
    nodeTypes: ['test-suite'],
  });

  // Find affected API endpoints
  const apiResult = graph.traverse(nodeId, {
    maxDepth: maxDepth + 1,
    direction: 'incoming',
    nodeTypes: ['api-endpoint'],
  });

  // Find affected services
  const serviceResult = graph.traverse(nodeId, {
    maxDepth: maxDepth + 1,
    direction: 'both',
    nodeTypes: ['service'],
  });

  return {
    target,
    directImpact: directResult.nodes.filter((n) => n.id !== nodeId),
    transitiveImpact: transitiveResult.nodes.filter(
      (n) => n.id !== nodeId && !directResult.nodes.some((d) => d.id === n.id),
    ),
    affectedTests: testResult.nodes,
    affectedApis: apiResult.nodes,
    affectedServices: serviceResult.nodes.filter((n) => n.id !== nodeId),
    impactEdges: transitiveResult.edges,
  };
}

// ─── API Flow Tracing ────────────────────────────────────────────────────────

export interface ApiFlowResult {
  readonly endpoint: GraphNode;
  readonly chain: GraphNode[];
  readonly edges: GraphEdge[];
}

/**
 * Trace the full API flow from an endpoint through controller → service → data.
 */
export function traceApiFlow(
  graph: KnowledgeGraph,
  endpointId: EntityId,
): ApiFlowResult | undefined {
  const endpoint = graph.getNode(endpointId);
  if (!endpoint) return undefined;

  const result = graph.traverse(endpointId, {
    maxDepth: 10,
    direction: 'outgoing',
    edgeTypes: ['api-flow', 'calls', 'depends-on', 'handles-route'],
  });

  return {
    endpoint,
    chain: result.nodes,
    edges: result.edges,
  };
}

// ─── Architecture Queries ────────────────────────────────────────────────────

/**
 * Get all nodes in a specific architectural layer.
 */
export function getNodesByLayer(
  graph: KnowledgeGraph,
  layer: ArchitecturalLayer,
): GraphNode[] {
  const allFiles = graph.getNodesByType('file');
  const allModules = graph.getNodesByType('module');

  return [...allFiles, ...allModules].filter((node) => {
    const data = node.data as { layer?: ArchitecturalLayer };
    return data.layer === layer;
  });
}

/**
 * Get all nodes with a specific architectural role.
 */
export function getNodesByRole(
  graph: KnowledgeGraph,
  role: ArchitecturalRole,
): GraphNode[] {
  const components = graph.getNodesByType('component');
  return components.filter((node) => {
    const data = node.data as { architecturalRole?: ArchitecturalRole };
    return data.architecturalRole === role;
  });
}

/**
 * Find all cross-layer dependencies.
 */
export function findCrossLayerDependencies(graph: KnowledgeGraph): GraphEdge[] {
  return graph.getEdgesByType('layer-boundary');
}

// ─── Concept Queries ─────────────────────────────────────────────────────────

/**
 * Find all nodes related to a semantic concept.
 */
export function findRelatedToConcept(
  graph: KnowledgeGraph,
  conceptId: EntityId,
  maxDepth: number = 3,
): GraphQueryResult {
  return graph.traverse(conceptId, {
    maxDepth,
    edgeTypes: ['belongs-to-concept', 'related-concept', 'contains'],
  });
}

/**
 * Search for concepts matching a query string.
 */
export function searchConcepts(
  graph: KnowledgeGraph,
  query: string,
): GraphNode[] {
  return graph.searchNodes(query, ['concept']);
}

// ─── Test Coverage Queries ───────────────────────────────────────────────────

/**
 * Find test suites that cover a component.
 */
export function findTestCoverage(
  graph: KnowledgeGraph,
  componentId: EntityId,
): GraphNode[] {
  return graph.getNeighbors(componentId, 'incoming', ['tests']);
}

/**
 * Find components that are NOT covered by any test.
 */
export function findUncoveredComponents(graph: KnowledgeGraph): GraphNode[] {
  const components = graph.getNodesByType('component');
  return components.filter((component) => {
    const testEdges = graph.getEdgesForNode(component.id, 'incoming')
      .filter((e) => e.type === 'tests');
    return testEdges.length === 0;
  });
}

// ─── Dependency Queries ──────────────────────────────────────────────────────

/**
 * Get the full dependency tree of a node (transitive closure).
 */
export function getDependencyTree(
  graph: KnowledgeGraph,
  nodeId: EntityId,
  maxDepth: number = 10,
): GraphQueryResult {
  return graph.traverse(nodeId, {
    maxDepth,
    direction: 'outgoing',
    edgeTypes: ['imports', 'depends-on', 'uses-package'],
  });
}

/**
 * Get the reverse dependency tree (what depends on this).
 */
export function getReverseDependencyTree(
  graph: KnowledgeGraph,
  nodeId: EntityId,
  maxDepth: number = 10,
): GraphQueryResult {
  return graph.traverse(nodeId, {
    maxDepth,
    direction: 'incoming',
    edgeTypes: ['imports', 'depends-on', 'uses-package'],
  });
}

// ─── Subgraph Extraction ────────────────────────────────────────────────────

/**
 * Extract a feature-relevant subgraph given seed concepts.
 * This is the key operation for building Feature Intelligence Context.
 */
export function extractFeatureSubgraph(
  graph: KnowledgeGraph,
  seedNodeIds: EntityId[],
  options: {
    maxDepth?: number;
    minConfidence?: number;
    includeTests?: boolean;
    includeApis?: boolean;
    includeConfig?: boolean;
  } = {},
): GraphQueryResult {
  const {
    maxDepth = 3,
    minConfidence = 0.3,
    includeTests = true,
    includeApis = true,
    includeConfig = true,
  } = options;

  const subgraph = graph.extractSubgraph(seedNodeIds, maxDepth, minConfidence);

  // Optionally expand to include related tests, APIs, and config
  const additionalNodes: GraphNode[] = [];
  const additionalEdges: GraphEdge[] = [];

  for (const node of subgraph.nodes) {
    if (includeTests) {
      const tests = graph.getNeighbors(node.id, 'incoming', ['tests']);
      additionalNodes.push(...tests);
    }

    if (includeApis && node.type === 'component') {
      const apis = graph.getNeighbors(node.id, 'incoming', ['handles-route', 'api-flow']);
      additionalNodes.push(...apis);
    }

    if (includeConfig) {
      const configs = graph.getNeighbors(node.id, 'both', ['configures', 'feature-flag']);
      additionalNodes.push(...configs);
    }
  }

  return {
    nodes: [...subgraph.nodes, ...additionalNodes],
    edges: [...subgraph.edges, ...additionalEdges],
  };
}
