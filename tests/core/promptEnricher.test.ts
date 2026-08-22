import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraph } from '../../src/intelligence/graph/knowledgeGraph.js';
import { createGraphNode } from '../../src/intelligence/graph/graphNode.js';
import { enrichPrompt } from '../../src/core/promptEnricher.js';

describe('Prompt Enricher', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();

    // Setup sample graph
    const userController = createGraphNode(
      'component',
      'node-1',
      'UserController',
      'src/controllers/UserController.ts',
      { filePath: 'src/controllers/UserController.ts', startLine: 12, language: 'typescript' } as any,
      1,
    );

    const userService = createGraphNode(
      'service',
      'node-2',
      'UserService',
      'src/services/UserService.ts',
      { filePath: 'src/services/UserService.ts', startLine: 45, language: 'typescript' } as any,
      1,
    );

    const userTest = createGraphNode(
      'test-suite',
      'node-3',
      'UserService.test',
      'tests/services/UserService.test.ts',
      { filePath: 'tests/services/UserService.test.ts', startLine: 1, language: 'typescript' } as any,
      1,
    );

    graph.addNode(userController);
    graph.addNode(userService);
    graph.addNode(userTest);

    graph.addEdge('node-1', 'node-2', 'calls', 'confirmed', 0.95, []);
    graph.addEdge('node-3', 'node-2', 'tests', 'confirmed', 0.9, []);
  });

  it('should enrich a prompt with relevant repository evidence and flow lines', () => {
    const result = enrichPrompt(graph, 'Add caching to UserService and update controller', {
      task: 'implementation',
      tokenBudget: 3000,
    });

    expect(result.originalPrompt).toBe('Add caching to UserService and update controller');
    expect(result.task).toBe('implementation');
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.enrichedPrompt).toContain('Grounding Repository Evidence');
    expect(result.enrichedPrompt).toContain('UserService');
    expect(result.estimatedTokens).toBeLessThan(3000);
    expect(result.reduction).toBeGreaterThan(0.5);
  });

  it('should prioritize test suites when task mode is testing', () => {
    const result = enrichPrompt(graph, 'Test user registration and service error states', {
      task: 'testing',
      tokenBudget: 2000,
    });

    expect(result.task).toBe('testing');
    expect(result.enrichedPrompt).toContain('Prioritize observable behavior');
    expect(result.evidence.some((e) => e.kind === 'test-suite')).toBe(true);
  });

  it('should include user iteration guidance when provided', () => {
    const result = enrichPrompt(graph, 'Add auth token validation', {
      guidance: 'Exclude legacy session manager',
    });

    expect(result.enrichedPrompt).toContain('**User Guidance:** Exclude legacy session manager');
  });

  it('should provide deterministic prompt quality scores', () => {
    const result = enrichPrompt(graph, 'Add rate limiting to UserController');

    expect(result.scores).toBeDefined();
    expect(result.scores?.intentPreservation).toBe(5);
    expect(result.scores?.tokenEfficiency).toBe(5);
  });
});
