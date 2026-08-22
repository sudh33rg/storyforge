/**
 * Graph Diff Engine (GAP 4)
 *
 * Compares two knowledge graph states (snapshots) to produce a typed diff:
 *
 *   - Added nodes: new entities discovered since last generation
 *   - Removed nodes: deleted files/symbols between generations
 *   - Modified nodes: nodes whose data changed (hash, metadata, description)
 *   - Added edges: new relationships created
 *   - Removed edges: stale relationships pruned
 *   - Modified edges: edges whose confidence or resolution changed
 *
 * Used by:
 *   - Graph Timeline / Diff UI (GraphDiffView.tsx)
 *   - Staleness auditor (enhanced)
 *   - Generation-over-generation trend sparklines
 *   - Impact diff reports in CI/CD contexts
 *
 * Design: Works entirely from serialized graph snapshots — no live graph needed.
 * Snapshots are stored as compressed JSON by the StorageEngine.
 */

import { createLogger } from '../../shared/logger.js';
import type { GraphNode } from '../graph/graphNode.js';
import type { GraphEdge } from '../graph/graphEdge.js';
import type { KnowledgeGraph } from '../graph/knowledgeGraph.js';

const log = createLogger('intelligence:graphDiff');

// ─── Diff Types ───────────────────────────────────────────────────────────────

export type DiffChangeType = 'added' | 'removed' | 'modified';

export interface NodeDiff {
  readonly changeType: DiffChangeType;
  readonly node: GraphNode;
  readonly previousNode?: GraphNode;
  readonly changedFields?: string[];
}

export interface EdgeDiff {
  readonly changeType: DiffChangeType;
  readonly edge: GraphEdge;
  readonly previousEdge?: GraphEdge;
  readonly changedFields?: string[];
}

export interface GraphDiffSummary {
  readonly nodesAdded: number;
  readonly nodesRemoved: number;
  readonly nodesModified: number;
  readonly edgesAdded: number;
  readonly edgesRemoved: number;
  readonly edgesModified: number;
  readonly netNodeChange: number;
  readonly netEdgeChange: number;
  readonly churnRate: number;  // (added + removed) / max(fromCount, toCount) — 0..1
}

export interface GraphDiff {
  readonly fromGeneration: number;
  readonly toGeneration: number;
  readonly computedAt: number;

  readonly nodeDiffs: NodeDiff[];
  readonly edgeDiffs: EdgeDiff[];
  readonly summary: GraphDiffSummary;

  // Categorized for UI rendering
  readonly addedNodes: GraphNode[];
  readonly removedNodes: GraphNode[];
  readonly modifiedNodes: NodeDiff[];

  // Impact breakdown by node type
  readonly changesByType: Record<string, { added: number; removed: number; modified: number }>;

  // Most significant changes (top 20 by edit weight)
  readonly significantChanges: Array<{
    kind: 'node' | 'edge';
    changeType: DiffChangeType;
    name: string;
    type: string;
    path?: string;
    reason: string;
  }>;
}

// ─── Snapshot Type ────────────────────────────────────────────────────────────

export interface GraphSnapshot {
  readonly generation: number;
  readonly timestamp: number;
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
}

// ─── Main Diff Computation ────────────────────────────────────────────────────

/**
 * Compute a full diff between two graph snapshots.
 */
export function computeGraphDiff(from: GraphSnapshot, to: GraphSnapshot): GraphDiff {
  log.info('Computing graph diff', {
    fromGeneration: from.generation,
    toGeneration: to.generation,
    fromNodes: from.nodes.length,
    toNodes: to.nodes.length,
  });

  const startTime = performance.now();

  // Build fast lookup maps
  const fromNodesById = new Map<string, GraphNode>(from.nodes.map(n => [n.id, n]));
  const toNodesById = new Map<string, GraphNode>(to.nodes.map(n => [n.id, n]));
  const fromEdgesById = new Map<string, GraphEdge>(from.edges.map(e => [e.id, e]));
  const toEdgesById = new Map<string, GraphEdge>(to.edges.map(e => [e.id, e]));

  // ── Node Diffs ──
  const nodeDiffs: NodeDiff[] = [];
  const addedNodes: GraphNode[] = [];
  const removedNodes: GraphNode[] = [];
  const modifiedNodes: NodeDiff[] = [];

  for (const [id, toNode] of toNodesById) {
    if (!fromNodesById.has(id)) {
      const diff: NodeDiff = { changeType: 'added', node: toNode };
      nodeDiffs.push(diff);
      addedNodes.push(toNode);
    } else {
      const fromNode = fromNodesById.get(id)!;
      const changedFields = detectNodeChanges(fromNode, toNode);
      if (changedFields.length > 0) {
        const diff: NodeDiff = {
          changeType: 'modified',
          node: toNode,
          previousNode: fromNode,
          changedFields,
        };
        nodeDiffs.push(diff);
        modifiedNodes.push(diff);
      }
    }
  }

  for (const [id, fromNode] of fromNodesById) {
    if (!toNodesById.has(id)) {
      const diff: NodeDiff = { changeType: 'removed', node: fromNode };
      nodeDiffs.push(diff);
      removedNodes.push(fromNode);
    }
  }

  // ── Edge Diffs ──
  const edgeDiffs: EdgeDiff[] = [];

  for (const [id, toEdge] of toEdgesById) {
    if (!fromEdgesById.has(id)) {
      edgeDiffs.push({ changeType: 'added', edge: toEdge });
    } else {
      const fromEdge = fromEdgesById.get(id)!;
      const changedFields = detectEdgeChanges(fromEdge, toEdge);
      if (changedFields.length > 0) {
        edgeDiffs.push({
          changeType: 'modified',
          edge: toEdge,
          previousEdge: fromEdge,
          changedFields,
        });
      }
    }
  }

  for (const [id, fromEdge] of fromEdgesById) {
    if (!toEdgesById.has(id)) {
      edgeDiffs.push({ changeType: 'removed', edge: fromEdge });
    }
  }

  // ── Summary ──
  const nodesAdded = addedNodes.length;
  const nodesRemoved = removedNodes.length;
  const nodesModified = modifiedNodes.length;
  const edgesAdded = edgeDiffs.filter(e => e.changeType === 'added').length;
  const edgesRemoved = edgeDiffs.filter(e => e.changeType === 'removed').length;
  const edgesModified = edgeDiffs.filter(e => e.changeType === 'modified').length;

  const maxNodes = Math.max(from.nodes.length, to.nodes.length, 1);
  const churnRate = Math.round(((nodesAdded + nodesRemoved) / maxNodes) * 100) / 100;

  const summary: GraphDiffSummary = {
    nodesAdded,
    nodesRemoved,
    nodesModified,
    edgesAdded,
    edgesRemoved,
    edgesModified,
    netNodeChange: nodesAdded - nodesRemoved,
    netEdgeChange: edgesAdded - edgesRemoved,
    churnRate,
  };

  // ── Change breakdown by node type ──
  const changesByType: Record<string, { added: number; removed: number; modified: number }> = {};

  for (const node of addedNodes) {
    if (!changesByType[node.type]) changesByType[node.type] = { added: 0, removed: 0, modified: 0 };
    changesByType[node.type].added++;
  }
  for (const node of removedNodes) {
    if (!changesByType[node.type]) changesByType[node.type] = { added: 0, removed: 0, modified: 0 };
    changesByType[node.type].removed++;
  }
  for (const diff of modifiedNodes) {
    if (!changesByType[diff.node.type]) changesByType[diff.node.type] = { added: 0, removed: 0, modified: 0 };
    changesByType[diff.node.type].modified++;
  }

  // ── Most significant changes ──
  const significantChanges: GraphDiff['significantChanges'] = [];

  for (const node of addedNodes.slice(0, 8)) {
    significantChanges.push({
      kind: 'node',
      changeType: 'added',
      name: node.name,
      type: node.type,
      path: (node.data as { filePath?: string })?.filePath,
      reason: `New ${node.type} discovered`,
    });
  }

  for (const node of removedNodes.slice(0, 6)) {
    significantChanges.push({
      kind: 'node',
      changeType: 'removed',
      name: node.name,
      type: node.type,
      path: (node.data as { filePath?: string })?.filePath,
      reason: `${node.type} removed from codebase`,
    });
  }

  for (const diff of modifiedNodes.slice(0, 6)) {
    significantChanges.push({
      kind: 'node',
      changeType: 'modified',
      name: diff.node.name,
      type: diff.node.type,
      path: (diff.node.data as { filePath?: string })?.filePath,
      reason: `Changed fields: ${diff.changedFields?.join(', ')}`,
    });
  }

  log.info('Graph diff computed', {
    ...summary,
    durationMs: Math.round(performance.now() - startTime),
  });

  return {
    fromGeneration: from.generation,
    toGeneration: to.generation,
    computedAt: Date.now(),
    nodeDiffs,
    edgeDiffs,
    summary,
    addedNodes,
    removedNodes,
    modifiedNodes,
    changesByType,
    significantChanges,
  };
}

/**
 * Extract a snapshot from a live knowledge graph.
 */
export function snapshotFromGraph(graph: KnowledgeGraph): GraphSnapshot {
  return {
    generation: graph.getGeneration(),
    timestamp: Date.now(),
    nodes: graph.getAllNodes(),
    edges: graph.getAllEdges(),
  };
}

/**
 * Compute diff directly between two live graphs.
 */
export function diffGraphs(from: KnowledgeGraph, to: KnowledgeGraph): GraphDiff {
  return computeGraphDiff(snapshotFromGraph(from), snapshotFromGraph(to));
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function detectNodeChanges(from: GraphNode, to: GraphNode): string[] {
  const changed: string[] = [];

  if (from.name !== to.name) changed.push('name');
  if (from.description !== to.description) changed.push('description');
  if (from.type !== to.type) changed.push('type');

  // Check data hash if available
  const fromData = from.data as { hash?: string; size?: number };
  const toData = to.data as { hash?: string; size?: number };
  if (fromData?.hash && toData?.hash && fromData.hash !== toData.hash) changed.push('content');
  if (fromData?.size !== toData?.size) changed.push('size');

  return changed;
}

function detectEdgeChanges(from: GraphEdge, to: GraphEdge): string[] {
  const changed: string[] = [];

  if (from.type !== to.type) changed.push('type');
  if (Math.abs(from.confidence - to.confidence) > 0.05) changed.push('confidence');
  if (from.resolution !== to.resolution) changed.push('resolution');

  return changed;
}
