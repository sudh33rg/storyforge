/**
 * Knowledge Graph — In-Memory Graph with Disk Persistence
 *
 * The central reasoning substrate of StoryForge Intelligence.
 *
 * This is NOT just a data structure. It is the foundation for:
 * - Architecture traversal
 * - Impact analysis
 * - Dependency analysis
 * - Test impact analysis
 * - Feature context building
 * - Evidence-backed reasoning
 *
 * Design decisions:
 * - In-memory for fast traversal (graphs need pointer chasing)
 * - Adjacency list representation for efficient neighbor queries
 * - Separate forward/reverse edge indexes for bidirectional traversal
 * - Disk persistence via GraphSerializer for durability across sessions
 */

import type { EntityId, ResolutionStatus, Evidence } from '../../shared/types.js';
import { GraphError } from '../../shared/errors.js';
import { createLogger } from '../../shared/logger.js';
import type { GraphNode, GraphNodeType } from './graphNode.js';
import type { GraphEdge, GraphEdgeType, EdgeDirection } from './graphEdge.js';
import { createGraphEdge } from './graphEdge.js';

const log = createLogger('intelligence:graph');

// ─── Graph Statistics ────────────────────────────────────────────────────────

export interface GraphStats {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodesByType: Record<string, number>;
  readonly edgesByType: Record<string, number>;
  readonly generation: number;
  readonly lastUpdated: number;
}

// ─── Query Result ────────────────────────────────────────────────────────────

export interface GraphQueryResult<T extends GraphNodeType = GraphNodeType> {
  readonly nodes: GraphNode<T>[];
  readonly edges: GraphEdge[];
  readonly traversalPath?: EntityId[];
}

// ─── Knowledge Graph ─────────────────────────────────────────────────────────

export class KnowledgeGraph {
  private readonly nodes = new Map<EntityId, GraphNode>();
  private readonly edges = new Map<EntityId, GraphEdge>();

  // Adjacency indexes for fast traversal
  private readonly outgoingEdges = new Map<EntityId, Set<EntityId>>(); // nodeId → edge IDs
  private readonly incomingEdges = new Map<EntityId, Set<EntityId>>(); // nodeId → edge IDs

  // Secondary indexes
  private readonly nodesByType = new Map<GraphNodeType, Set<EntityId>>();
  private readonly nodesByQualifiedName = new Map<string, EntityId>();
  private readonly edgesByType = new Map<GraphEdgeType, Set<EntityId>>();

  private currentGeneration = 0;
  private lastUpdated = Date.now();

  // ─── Node Operations ────────────────────────────────────────────────────

  /**
   * Add a node to the graph.
   * If a node with the same ID already exists, it is updated.
   */
  addNode(node: GraphNode): void {
    const existing = this.nodes.get(node.id);

    if (existing) {
      // Update existing node
      (existing as { generationUpdated: number }).generationUpdated = this.currentGeneration;
      this.nodes.set(node.id, { ...existing, ...node, generationUpdated: this.currentGeneration });
      log.debug('Updated node', { id: node.id, type: node.type });
    } else {
      // Add new node
      this.nodes.set(node.id, node);

      // Update type index
      if (!this.nodesByType.has(node.type)) {
        this.nodesByType.set(node.type, new Set());
      }
      this.nodesByType.get(node.type)!.add(node.id);

      // Update qualified name index
      this.nodesByQualifiedName.set(node.qualifiedName, node.id);

      // Initialize adjacency sets
      if (!this.outgoingEdges.has(node.id)) {
        this.outgoingEdges.set(node.id, new Set());
      }
      if (!this.incomingEdges.has(node.id)) {
        this.incomingEdges.set(node.id, new Set());
      }

      log.debug('Added node', { id: node.id, type: node.type, name: node.name });
    }

    this.lastUpdated = Date.now();
  }

  /**
   * Remove a node and all its connected edges.
   */
  removeNode(nodeId: EntityId): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    // Remove all connected edges
    const connectedEdgeIds = new Set<EntityId>();
    this.outgoingEdges.get(nodeId)?.forEach((id) => connectedEdgeIds.add(id));
    this.incomingEdges.get(nodeId)?.forEach((id) => connectedEdgeIds.add(id));

    for (const edgeId of connectedEdgeIds) {
      this.removeEdge(edgeId);
    }

    // Remove from indexes
    this.nodesByType.get(node.type)?.delete(nodeId);
    this.nodesByQualifiedName.delete(node.qualifiedName);
    this.outgoingEdges.delete(nodeId);
    this.incomingEdges.delete(nodeId);

    // Remove node
    this.nodes.delete(nodeId);
    this.lastUpdated = Date.now();

    log.debug('Removed node', { id: nodeId, type: node.type });
    return true;
  }

  /**
   * Get a node by ID.
   */
  getNode(nodeId: EntityId): GraphNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get a node by qualified name.
   */
  getNodeByQualifiedName(qualifiedName: string): GraphNode | undefined {
    const nodeId = this.nodesByQualifiedName.get(qualifiedName);
    return nodeId ? this.nodes.get(nodeId) : undefined;
  }

  /**
   * Get all nodes of a specific type.
   */
  getNodesByType<T extends GraphNodeType>(type: T): GraphNode<T>[] {
    const nodeIds = this.nodesByType.get(type);
    if (!nodeIds) return [];
    return Array.from(nodeIds)
      .map((id) => this.nodes.get(id))
      .filter((n): n is GraphNode<T> => n !== undefined && n.type === type);
  }

  /**
   * Check if a node exists.
   */
  hasNode(nodeId: EntityId): boolean {
    return this.nodes.has(nodeId);
  }

  /**
   * Get all nodes.
   */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  // ─── Edge Operations ────────────────────────────────────────────────────

  /**
   * Add an edge between two nodes.
   * Both source and target nodes must exist.
   */
  addEdge(
    source: EntityId,
    target: EntityId,
    type: GraphEdgeType,
    resolution: ResolutionStatus,
    confidence: number,
    evidence: Evidence[],
    label?: string,
  ): GraphEdge {
    if (!this.nodes.has(source)) {
      throw new GraphError(`Source node not found: ${source}`);
    }
    if (!this.nodes.has(target)) {
      throw new GraphError(`Target node not found: ${target}`);
    }

    // Check for duplicate edges
    const existing = this.findEdge(source, target, type);
    if (existing) {
      // Update existing edge with new evidence
      const updated: GraphEdge = {
        ...existing,
        confidence: Math.max(existing.confidence, confidence),
        resolution: this.higherResolution(existing.resolution, resolution),
        evidence: [...existing.evidence, ...evidence],
        generationVerified: this.currentGeneration,
      };
      this.edges.set(existing.id, updated);
      return updated;
    }

    const edge = createGraphEdge(
      source,
      target,
      type,
      resolution,
      confidence,
      evidence,
      this.currentGeneration,
      label,
    );

    this.edges.set(edge.id, edge);

    // Update adjacency indexes
    this.outgoingEdges.get(source)?.add(edge.id);
    this.incomingEdges.get(target)?.add(edge.id);

    // Update type index
    if (!this.edgesByType.has(type)) {
      this.edgesByType.set(type, new Set());
    }
    this.edgesByType.get(type)!.add(edge.id);

    this.lastUpdated = Date.now();

    log.debug('Added edge', {
      id: edge.id,
      type,
      source,
      target,
      confidence,
      resolution,
    });

    return edge;
  }

  /**
   * Remove an edge by ID.
   */
  removeEdge(edgeId: EntityId): boolean {
    const edge = this.edges.get(edgeId);
    if (!edge) return false;

    this.outgoingEdges.get(edge.source)?.delete(edgeId);
    this.incomingEdges.get(edge.target)?.delete(edgeId);
    this.edgesByType.get(edge.type)?.delete(edgeId);
    this.edges.delete(edgeId);

    this.lastUpdated = Date.now();
    return true;
  }

  /**
   * Get an edge by ID.
   */
  getEdge(edgeId: EntityId): GraphEdge | undefined {
    return this.edges.get(edgeId);
  }

  /**
   * Find an existing edge between source and target of a specific type.
   */
  findEdge(source: EntityId, target: EntityId, type: GraphEdgeType): GraphEdge | undefined {
    const outgoing = this.outgoingEdges.get(source);
    if (!outgoing) return undefined;

    for (const edgeId of outgoing) {
      const edge = this.edges.get(edgeId);
      if (edge && edge.target === target && edge.type === type) {
        return edge;
      }
    }
    return undefined;
  }

  /**
   * Get all edges connected to a node.
   */
  getEdgesForNode(nodeId: EntityId, direction: EdgeDirection = 'both'): GraphEdge[] {
    const result: GraphEdge[] = [];

    if (direction === 'outgoing' || direction === 'both') {
      const outgoing = this.outgoingEdges.get(nodeId);
      if (outgoing) {
        for (const edgeId of outgoing) {
          const edge = this.edges.get(edgeId);
          if (edge) result.push(edge);
        }
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      const incoming = this.incomingEdges.get(nodeId);
      if (incoming) {
        for (const edgeId of incoming) {
          const edge = this.edges.get(edgeId);
          if (edge) result.push(edge);
        }
      }
    }

    return result;
  }

  /**
   * Get all edges of a specific type.
   */
  getEdgesByType(type: GraphEdgeType): GraphEdge[] {
    const edgeIds = this.edgesByType.get(type);
    if (!edgeIds) return [];
    return Array.from(edgeIds)
      .map((id) => this.edges.get(id))
      .filter((e): e is GraphEdge => e !== undefined);
  }

  /**
   * Get all edges.
   */
  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  // ─── Traversal ─────────────────────────────────────────────────────────

  /**
   * Get direct neighbors of a node.
   */
  getNeighbors(
    nodeId: EntityId,
    direction: EdgeDirection = 'both',
    edgeTypes?: GraphEdgeType[],
  ): GraphNode[] {
    const edges = this.getEdgesForNode(nodeId, direction);
    const neighborIds = new Set<EntityId>();

    for (const edge of edges) {
      if (edgeTypes && !edgeTypes.includes(edge.type)) continue;

      if (edge.source === nodeId) {
        neighborIds.add(edge.target);
      } else {
        neighborIds.add(edge.source);
      }
    }

    return Array.from(neighborIds)
      .map((id) => this.nodes.get(id))
      .filter((n): n is GraphNode => n !== undefined);
  }

  /**
   * Get callers of a node (nodes that call this node).
   */
  getCallers(nodeId: EntityId): GraphNode[] {
    return this.getNeighbors(nodeId, 'incoming', ['calls']);
  }

  /**
   * Get callees of a node (nodes that this node calls).
   */
  getCallees(nodeId: EntityId): GraphNode[] {
    return this.getNeighbors(nodeId, 'outgoing', ['calls']);
  }

  /**
   * Get dependencies of a node.
   */
  getDependencies(nodeId: EntityId): GraphNode[] {
    return this.getNeighbors(nodeId, 'outgoing', ['imports', 'depends-on', 'uses-package']);
  }

  /**
   * Get dependents of a node (what depends on this node).
   */
  getDependents(nodeId: EntityId): GraphNode[] {
    return this.getNeighbors(nodeId, 'incoming', ['imports', 'depends-on', 'uses-package', 'calls', 'api-flow']);
  }

  /**
   * Get the parent (container) of a node.
   */
  getParent(nodeId: EntityId): GraphNode | undefined {
    const incoming = this.getEdgesForNode(nodeId, 'incoming');
    const containsEdge = incoming.find((e) => e.type === 'contains');
    return containsEdge ? this.nodes.get(containsEdge.source) : undefined;
  }

  /**
   * Get children (contained nodes) of a node.
   */
  getChildren(nodeId: EntityId): GraphNode[] {
    return this.getNeighbors(nodeId, 'outgoing', ['contains']);
  }

  /**
   * Traverse the graph breadth-first from a starting node.
   * Returns all reachable nodes within the given depth.
   */
  traverse(
    startNodeId: EntityId,
    options: {
      maxDepth?: number;
      direction?: EdgeDirection;
      edgeTypes?: GraphEdgeType[];
      nodeTypes?: GraphNodeType[];
      minConfidence?: number;
    } = {},
  ): GraphQueryResult {
    const {
      maxDepth = 5,
      direction = 'both',
      edgeTypes,
      nodeTypes,
      minConfidence = 0,
    } = options;

    const visited = new Set<EntityId>();
    const resultNodes: GraphNode[] = [];
    const resultEdges: GraphEdge[] = [];
    const traversalPath: EntityId[] = [];

    const queue: Array<{ nodeId: EntityId; depth: number }> = [
      { nodeId: startNodeId, depth: 0 },
    ];

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (!node) continue;

      if (!nodeTypes || nodeTypes.includes(node.type)) {
        resultNodes.push(node);
        traversalPath.push(nodeId);
      }

      if (depth >= maxDepth) continue;

      const edges = this.getEdgesForNode(nodeId, direction);
      for (const edge of edges) {
        if (edgeTypes && !edgeTypes.includes(edge.type)) continue;
        if (edge.confidence < minConfidence) continue;

        resultEdges.push(edge);

        const neighborId = edge.source === nodeId ? edge.target : edge.source;
        if (!visited.has(neighborId)) {
          queue.push({ nodeId: neighborId, depth: depth + 1 });
        }
      }
    }

    return { nodes: resultNodes, edges: resultEdges, traversalPath };
  }

  /**
   * Find the shortest path between two nodes.
   */
  findPath(
    sourceId: EntityId,
    targetId: EntityId,
    edgeTypes?: GraphEdgeType[],
  ): { path: EntityId[]; edges: GraphEdge[] } | undefined {
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      return undefined;
    }

    const visited = new Set<EntityId>();
    const parent = new Map<EntityId, { nodeId: EntityId; edge: GraphEdge }>();
    const queue: EntityId[] = [sourceId];
    visited.add(sourceId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (currentId === targetId) {
        // Reconstruct path
        const path: EntityId[] = [];
        const edges: GraphEdge[] = [];
        let current: EntityId | undefined = targetId;

        while (current !== undefined) {
          path.unshift(current);
          const parentInfo = parent.get(current);
          if (parentInfo) {
            edges.unshift(parentInfo.edge);
            current = parentInfo.nodeId;
          } else {
            current = undefined;
          }
        }

        return { path, edges };
      }

      const nodeEdges = this.getEdgesForNode(currentId, 'both');
      for (const edge of nodeEdges) {
        if (edgeTypes && !edgeTypes.includes(edge.type)) continue;

        const neighborId = edge.source === currentId ? edge.target : edge.source;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          parent.set(neighborId, { nodeId: currentId, edge });
          queue.push(neighborId);
        }
      }
    }

    return undefined;
  }

  /**
   * Extract a subgraph containing all nodes related to a concept.
   * Useful for building feature context.
   */
  extractSubgraph(
    seedNodeIds: EntityId[],
    maxDepth: number = 3,
    minConfidence: number = 0.3,
  ): GraphQueryResult {
    const allNodes = new Map<EntityId, GraphNode>();
    const allEdges = new Map<EntityId, GraphEdge>();

    for (const seedId of seedNodeIds) {
      const result = this.traverse(seedId, {
        maxDepth,
        minConfidence,
      });

      for (const node of result.nodes) {
        allNodes.set(node.id, node);
      }
      for (const edge of result.edges) {
        allEdges.set(edge.id, edge);
      }
    }

    return {
      nodes: Array.from(allNodes.values()),
      edges: Array.from(allEdges.values()),
    };
  }

  // ─── Search ────────────────────────────────────────────────────────────

  /**
   * Search nodes by name (case-insensitive substring match).
   */
  searchNodes(query: string, nodeTypes?: GraphNodeType[]): GraphNode[] {
    const lowerQuery = query.toLowerCase();
    const results: GraphNode[] = [];

    for (const node of this.nodes.values()) {
      if (nodeTypes && !nodeTypes.includes(node.type)) continue;

      if (
        node.name.toLowerCase().includes(lowerQuery) ||
        node.qualifiedName.toLowerCase().includes(lowerQuery) ||
        node.description?.toLowerCase().includes(lowerQuery)
      ) {
        results.push(node);
      }
    }

    return results;
  }

  // ─── Generation & Stats ────────────────────────────────────────────────

  /**
   * Increment the intelligence generation.
   */
  incrementGeneration(): number {
    this.currentGeneration++;
    this.lastUpdated = Date.now();
    log.info('Generation incremented', { generation: this.currentGeneration });
    return this.currentGeneration;
  }

  /**
   * Get the current generation number.
   */
  getGeneration(): number {
    return this.currentGeneration;
  }

  /**
   * Set the current generation (used when loading from disk).
   */
  setGeneration(generation: number): void {
    this.currentGeneration = generation;
  }

  /**
   * Get graph statistics.
   */
  getStats(): GraphStats {
    const nodesByType: Record<string, number> = {};
    for (const [type, ids] of this.nodesByType) {
      nodesByType[type] = ids.size;
    }

    const edgesByType: Record<string, number> = {};
    for (const [type, ids] of this.edgesByType) {
      edgesByType[type] = ids.size;
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      nodesByType,
      edgesByType,
      generation: this.currentGeneration,
      lastUpdated: this.lastUpdated,
    };
  }

  // ─── Serialization Support ─────────────────────────────────────────────

  /**
   * Export graph data for serialization.
   */
  exportData(): { nodes: GraphNode[]; edges: GraphEdge[]; generation: number } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      generation: this.currentGeneration,
    };
  }

  /**
   * Import graph data from deserialized state.
   */
  importData(data: { nodes: GraphNode[]; edges: GraphEdge[]; generation: number }): void {
    this.clear();
    this.currentGeneration = data.generation;

    for (const node of data.nodes) {
      this.addNode(node);
    }

    for (const edge of data.edges) {
      this.edges.set(edge.id, edge);

      // Rebuild adjacency indexes
      if (!this.outgoingEdges.has(edge.source)) {
        this.outgoingEdges.set(edge.source, new Set());
      }
      this.outgoingEdges.get(edge.source)!.add(edge.id);

      if (!this.incomingEdges.has(edge.target)) {
        this.incomingEdges.set(edge.target, new Set());
      }
      this.incomingEdges.get(edge.target)!.add(edge.id);

      // Update type index
      if (!this.edgesByType.has(edge.type)) {
        this.edgesByType.set(edge.type, new Set());
      }
      this.edgesByType.get(edge.type)!.add(edge.id);
    }

    this.lastUpdated = Date.now();
    log.info('Graph imported', {
      nodes: data.nodes.length,
      edges: data.edges.length,
      generation: data.generation,
    });
  }

  /**
   * Clear all graph data.
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.outgoingEdges.clear();
    this.incomingEdges.clear();
    this.nodesByType.clear();
    this.nodesByQualifiedName.clear();
    this.edgesByType.clear();
    this.currentGeneration = 0;
    this.lastUpdated = Date.now();
  }

  // ─── Internal Helpers ──────────────────────────────────────────────────

  private higherResolution(a: ResolutionStatus, b: ResolutionStatus): ResolutionStatus {
    const order: ResolutionStatus[] = ['confirmed', 'resolved', 'heuristic', 'unresolved'];
    return order.indexOf(a) <= order.indexOf(b) ? a : b;
  }
}
