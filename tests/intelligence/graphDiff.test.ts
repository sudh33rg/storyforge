/**
 * Graph Diff Engine Tests
 *
 * Tests comparing two snapshots of the knowledge graph across generations.
 */

import { describe, it, expect } from 'vitest';
import { KnowledgeGraph } from '../../src/intelligence/graph/knowledgeGraph';
import { createGraphNode } from '../../src/intelligence/graph/graphNode';
import { resetEdgeCounter } from '../../src/intelligence/graph/graphEdge';
import { diffGraphs, computeGraphDiff, snapshotFromGraph } from '../../src/intelligence/graph/graphDiff';

describe('GraphDiff Engine', () => {
  it('should detect added, removed, and modified nodes between graph generations', () => {
    resetEdgeCounter();

    const graphGen1 = new KnowledgeGraph();
    const nodeA = createGraphNode('file', 'file:a.ts', 'a.ts', 'file:a.ts', { hash: 'hash1' }, 1);
    const nodeB = createGraphNode('file', 'file:b.ts', 'b.ts', 'file:b.ts', { hash: 'hash1' }, 1);
    graphGen1.addNode(nodeA);
    graphGen1.addNode(nodeB);
    graphGen1.addEdge('file:a.ts', 'file:b.ts', 'imports', 'confirmed', 1.0, []);

    const graphGen2 = new KnowledgeGraph();
    // nodeA modified (hash changed)
    const nodeAMod = createGraphNode('file', 'file:a.ts', 'a.ts', 'file:a.ts', { hash: 'hash2_changed' }, 2);
    // nodeB removed (not in gen2)
    // nodeC added
    const nodeC = createGraphNode('file', 'file:c.ts', 'c.ts', 'file:c.ts', { hash: 'hash_c' }, 2);
    graphGen2.addNode(nodeAMod);
    graphGen2.addNode(nodeC);
    graphGen2.addEdge('file:a.ts', 'file:c.ts', 'imports', 'confirmed', 1.0, []);

    const diff = diffGraphs(graphGen1, graphGen2);

    expect(diff.summary.nodesAdded).toBe(1);
    expect(diff.addedNodes[0].id).toBe('file:c.ts');

    expect(diff.summary.nodesRemoved).toBe(1);
    expect(diff.removedNodes[0].id).toBe('file:b.ts');

    expect(diff.summary.nodesModified).toBe(1);
    expect(diff.modifiedNodes[0].node.id).toBe('file:a.ts');
    expect(diff.modifiedNodes[0].changedFields).toContain('content');

    expect(diff.summary.edgesAdded).toBe(1);
    expect(diff.summary.edgesRemoved).toBe(1);
    expect(diff.summary.churnRate).toBeGreaterThan(0);
  });

  it('should report zero churn for identical snapshots', () => {
    const graph = new KnowledgeGraph();
    graph.addNode(createGraphNode('file', 'file:x.ts', 'x.ts', 'file:x.ts', {}, 1));

    const snap1 = snapshotFromGraph(graph);
    const snap2 = snapshotFromGraph(graph);

    const diff = computeGraphDiff(snap1, snap2);
    expect(diff.summary.nodesAdded).toBe(0);
    expect(diff.summary.nodesRemoved).toBe(0);
    expect(diff.summary.nodesModified).toBe(0);
    expect(diff.summary.churnRate).toBe(0);
  });
});
