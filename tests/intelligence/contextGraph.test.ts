/**
 * Context Graph Tests (Layer 5)
 *
 * Tests dynamic situational subgraph projection, 11-stage capability flow reasoning,
 * and multi-evidence grounding.
 */

import { describe, it, expect } from 'vitest';
import { KnowledgeGraph } from '../../src/intelligence/graph/knowledgeGraph.js';
import { SemanticIndexer } from '../../src/intelligence/semantic/semanticIndexer.js';
import { ContextGraph } from '../../src/intelligence/contextGraph/contextGraph.js';
import { createGraphNode } from '../../src/intelligence/graph/graphNode.js';

describe('Context Graph (Layer 5)', () => {
  it('should dynamically project a grounded situational context graph with 11-stage reasoning', () => {
    const graph = new KnowledgeGraph();
    const indexer = new SemanticIndexer();

    const fileNode = createGraphNode('file', 'file:src/auth.ts', 'auth.ts', 'src/auth.ts', {
      filePath: 'src/auth.ts',
      layer: 'business-logic',
    }, 1);

    const compNode = createGraphNode('component', 'comp:auth', 'AuthService', 'src/auth/AuthService.ts', {
      filePath: 'src/auth/AuthService.ts',
      architecturalRole: 'service',
    }, 1);

    const apiNode = createGraphNode('api-endpoint', 'api:POST:/api/login', 'POST /api/login', 'api:POST:/api/login', {
      method: 'POST',
      path: '/api/login',
      filePath: 'src/auth/AuthController.ts',
    }, 1);

    const testNode = createGraphNode('test-suite', 'test:auth', 'AuthTests', 'tests/auth.test.ts', {
      filePath: 'tests/auth.test.ts',
      testCount: 5,
    }, 1);

    graph.addNode(fileNode);
    graph.addNode(compNode);
    graph.addNode(apiNode);
    graph.addNode(testNode);

    graph.addEdge('file:src/auth.ts', 'comp:auth', 'contains', 'confirmed', 1.0, []);
    graph.addEdge('comp:auth', 'api:POST:/api/login', 'calls', 'resolved', 0.9, []);

    indexer.indexNodes(graph.getAllNodes());

    const contextGraph = new ContextGraph(graph, indexer);
    const projection = contextGraph.project('User authentication and login token validation', ['auth', 'login']);

    expect(projection.situationalContext.userIntent).toContain('User authentication');
    expect(projection.capabilityChain.stages.length).toBe(11);
    expect(projection.capabilityChain.stages[0].stage).toBe('feature-request');
    expect(projection.capabilityChain.stages[4].stage).toBe('api-endpoint');
    expect(projection.capabilityChain.stages[6].stage).toBe('service-layer');
    expect(projection.capabilityChain.stages[9].stage).toBe('existing-tests');
    expect(projection.confidence.overall).toBeGreaterThan(0);
  });
});
