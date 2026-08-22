/**
 * Knowledge Graph Tests
 *
 * Tests the core graph data structure, traversal, and queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraph } from '../../src/intelligence/graph/knowledgeGraph';
import { createGraphNode } from '../../src/intelligence/graph/graphNode';
import { resetEdgeCounter } from '../../src/intelligence/graph/graphEdge';
import { analyzeImpact, extractFeatureSubgraph } from '../../src/intelligence/graph/graphQuery';

describe('KnowledgeGraph', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();
    resetEdgeCounter();
  });

  describe('Node Operations', () => {
    it('should add and retrieve nodes', () => {
      const node = createGraphNode('file', 'file:test.ts', 'test.ts', 'file:test.ts', {
        path: 'test.ts',
        language: 'typescript' as const,
        size: 100,
        hash: 'abc123',
      }, 1);

      graph.addNode(node);

      expect(graph.getNode('file:test.ts')).toBeDefined();
      expect(graph.getNode('file:test.ts')!.name).toBe('test.ts');
      expect(graph.hasNode('file:test.ts')).toBe(true);
    });

    it('should retrieve nodes by type', () => {
      graph.addNode(createGraphNode('file', 'file:a.ts', 'a.ts', 'file:a.ts', {
        path: 'a.ts', language: 'typescript' as const, size: 100, hash: 'a',
      }, 1));

      graph.addNode(createGraphNode('file', 'file:b.ts', 'b.ts', 'file:b.ts', {
        path: 'b.ts', language: 'typescript' as const, size: 200, hash: 'b',
      }, 1));

      graph.addNode(createGraphNode('component', 'comp:X', 'X', 'comp:X', {
        filePath: 'a.ts', language: 'typescript' as const, symbolKind: 'class' as const,
        architecturalRole: 'service' as const,
      }, 1));

      const files = graph.getNodesByType('file');
      expect(files.length).toBe(2);

      const components = graph.getNodesByType('component');
      expect(components.length).toBe(1);
    });

    it('should retrieve nodes by qualified name', () => {
      graph.addNode(createGraphNode('component', 'comp:UserService', 'UserService', 'src/services/UserService', {
        filePath: 'src/services/UserService.ts', language: 'typescript' as const,
        symbolKind: 'class' as const, architecturalRole: 'service' as const,
      }, 1));

      const node = graph.getNodeByQualifiedName('src/services/UserService');
      expect(node).toBeDefined();
      expect(node!.name).toBe('UserService');
    });

    it('should remove nodes and connected edges', () => {
      graph.addNode(createGraphNode('file', 'f1', 'a.ts', 'f1', {
        path: 'a.ts', language: 'typescript' as const, size: 100, hash: 'a',
      }, 1));

      graph.addNode(createGraphNode('file', 'f2', 'b.ts', 'f2', {
        path: 'b.ts', language: 'typescript' as const, size: 100, hash: 'b',
      }, 1));

      graph.addEdge('f1', 'f2', 'imports', 'confirmed', 0.9, []);

      expect(graph.getStats().edgeCount).toBe(1);

      graph.removeNode('f1');

      expect(graph.hasNode('f1')).toBe(false);
      expect(graph.getStats().edgeCount).toBe(0);
    });
  });

  describe('Edge Operations', () => {
    it('should add edges with evidence', () => {
      graph.addNode(createGraphNode('file', 'f1', 'a.ts', 'f1', {
        path: 'a.ts', language: 'typescript' as const, size: 100, hash: 'a',
      }, 1));

      graph.addNode(createGraphNode('file', 'f2', 'b.ts', 'f2', {
        path: 'b.ts', language: 'typescript' as const, size: 100, hash: 'b',
      }, 1));

      const edge = graph.addEdge('f1', 'f2', 'imports', 'confirmed', 0.9, [{
        type: 'import-statement',
        source: 'a.ts',
        description: 'a.ts imports from b.ts',
        resolution: 'confirmed',
        confidence: 0.9,
      }]);

      expect(edge.source).toBe('f1');
      expect(edge.target).toBe('f2');
      expect(edge.type).toBe('imports');
      expect(edge.confidence).toBe(0.9);
      expect(edge.resolution).toBe('confirmed');
      expect(edge.evidence.length).toBe(1);
    });

    it('should merge duplicate edges', () => {
      graph.addNode(createGraphNode('file', 'f1', 'a.ts', 'f1', {
        path: 'a.ts', language: 'typescript' as const, size: 100, hash: 'a',
      }, 1));

      graph.addNode(createGraphNode('file', 'f2', 'b.ts', 'f2', {
        path: 'b.ts', language: 'typescript' as const, size: 100, hash: 'b',
      }, 1));

      graph.addEdge('f1', 'f2', 'imports', 'heuristic', 0.5, [{
        type: 'naming-convention',
        source: 'a.ts',
        description: 'First evidence',
        resolution: 'heuristic',
        confidence: 0.5,
      }]);

      graph.addEdge('f1', 'f2', 'imports', 'confirmed', 0.9, [{
        type: 'import-statement',
        source: 'a.ts',
        description: 'Second evidence',
        resolution: 'confirmed',
        confidence: 0.9,
      }]);

      // Should still be one edge, but with merged evidence and higher confidence
      expect(graph.getStats().edgeCount).toBe(1);
      const edges = graph.getEdgesForNode('f1', 'outgoing');
      expect(edges[0].confidence).toBe(0.9); // Higher confidence
      expect(edges[0].evidence.length).toBe(2); // Merged evidence
    });
  });

  describe('Traversal', () => {
    beforeEach(() => {
      // Build a small graph:
      // Controller → Service → Repository → Model
      graph.addNode(createGraphNode('component', 'ctrl', 'UserController', 'ctrl', {
        filePath: 'controller.ts', language: 'typescript' as const,
        symbolKind: 'class' as const, architecturalRole: 'controller' as const,
      }, 1));

      graph.addNode(createGraphNode('component', 'svc', 'UserService', 'svc', {
        filePath: 'service.ts', language: 'typescript' as const,
        symbolKind: 'class' as const, architecturalRole: 'service' as const,
      }, 1));

      graph.addNode(createGraphNode('component', 'repo', 'UserRepository', 'repo', {
        filePath: 'repository.ts', language: 'typescript' as const,
        symbolKind: 'class' as const, architecturalRole: 'repository' as const,
      }, 1));

      graph.addNode(createGraphNode('component', 'model', 'User', 'model', {
        filePath: 'model.ts', language: 'typescript' as const,
        symbolKind: 'class' as const, architecturalRole: 'model' as const,
      }, 1));

      graph.addEdge('ctrl', 'svc', 'calls', 'confirmed', 0.9, []);
      graph.addEdge('svc', 'repo', 'calls', 'confirmed', 0.9, []);
      graph.addEdge('repo', 'model', 'depends-on', 'confirmed', 0.9, []);
    });

    it('should traverse breadth-first', () => {
      const result = graph.traverse('ctrl', { maxDepth: 3, direction: 'outgoing' });
      expect(result.nodes.length).toBe(4); // ctrl + svc + repo + model
    });

    it('should find callers and callees', () => {
      const callees = graph.getCallees('ctrl');
      expect(callees.length).toBe(1);
      expect(callees[0].name).toBe('UserService');

      const callers = graph.getCallers('svc');
      expect(callers.length).toBe(1);
      expect(callers[0].name).toBe('UserController');
    });

    it('should find shortest path', () => {
      const result = graph.findPath('ctrl', 'model');
      expect(result).toBeDefined();
      expect(result!.path.length).toBe(4); // ctrl → svc → repo → model
    });

    it('should get dependencies', () => {
      const deps = graph.getDependencies('repo');
      expect(deps.length).toBe(1);
      expect(deps[0].name).toBe('User');
    });

    it('should get dependents', () => {
      const dependents = graph.getDependents('svc');
      expect(dependents.length).toBe(1);
      expect(dependents[0].name).toBe('UserController');
    });
  });

  describe('Search', () => {
    it('should search nodes by name', () => {
      graph.addNode(createGraphNode('component', 'comp1', 'UserController', 'comp1', {
        filePath: 'user.ts', language: 'typescript' as const,
        symbolKind: 'class' as const, architecturalRole: 'controller' as const,
      }, 1));

      graph.addNode(createGraphNode('component', 'comp2', 'UserService', 'comp2', {
        filePath: 'user.ts', language: 'typescript' as const,
        symbolKind: 'class' as const, architecturalRole: 'service' as const,
      }, 1));

      graph.addNode(createGraphNode('component', 'comp3', 'OrderService', 'comp3', {
        filePath: 'order.ts', language: 'typescript' as const,
        symbolKind: 'class' as const, architecturalRole: 'service' as const,
      }, 1));

      const userResults = graph.searchNodes('user');
      expect(userResults.length).toBe(2);

      const serviceResults = graph.searchNodes('service');
      expect(serviceResults.length).toBe(2);
    });
  });

  describe('Serialization', () => {
    it('should export and import graph data', () => {
      graph.addNode(createGraphNode('file', 'f1', 'a.ts', 'f1', {
        path: 'a.ts', language: 'typescript' as const, size: 100, hash: 'a',
      }, 1));

      graph.addNode(createGraphNode('file', 'f2', 'b.ts', 'f2', {
        path: 'b.ts', language: 'typescript' as const, size: 200, hash: 'b',
      }, 1));

      graph.addEdge('f1', 'f2', 'imports', 'confirmed', 0.9, []);
      graph.incrementGeneration();

      const data = graph.exportData();

      // Create a new graph and import
      const graph2 = new KnowledgeGraph();
      graph2.importData(data);

      expect(graph2.getStats().nodeCount).toBe(2);
      expect(graph2.getStats().edgeCount).toBe(1);
      expect(graph2.getGeneration()).toBe(1);
    });
  });

  describe('Generation Tracking', () => {
    it('should increment generations', () => {
      expect(graph.getGeneration()).toBe(0);
      graph.incrementGeneration();
      expect(graph.getGeneration()).toBe(1);
      graph.incrementGeneration();
      expect(graph.getGeneration()).toBe(2);
    });
  });

  describe('Stats', () => {
    it('should report accurate statistics', () => {
      graph.addNode(createGraphNode('file', 'f1', 'a.ts', 'f1', {
        path: 'a.ts', language: 'typescript' as const, size: 100, hash: 'a',
      }, 1));

      graph.addNode(createGraphNode('component', 'c1', 'X', 'c1', {
        filePath: 'a.ts', language: 'typescript' as const,
        symbolKind: 'class' as const, architecturalRole: 'service' as const,
      }, 1));

      graph.addEdge('f1', 'c1', 'contains', 'confirmed', 1.0, []);

      const stats = graph.getStats();
      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);
      expect(stats.nodesByType['file']).toBe(1);
      expect(stats.nodesByType['component']).toBe(1);
      expect(stats.edgesByType['contains']).toBe(1);
    });
  });
});
