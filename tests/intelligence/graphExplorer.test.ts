import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraph } from '../../src/intelligence/graph/knowledgeGraph.js';
import { createGraphNode } from '../../src/intelligence/graph/graphNode.js';
import {
  getGraphOverview,
  expandGraphNode,
  executeGraphQuery,
  getQuerySuggestions,
} from '../../src/intelligence/graph/graphExplorer.js';

describe('Graph Explorer & Query Surface', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();

    const controller = createGraphNode(
      'component',
      'node-ctrl',
      'LoadTestController',
      'src/controllers/LoadTestController.ts',
      { filePath: 'src/controllers/LoadTestController.ts', startLine: 10, language: 'typescript' } as any,
      1,
    );

    const service = createGraphNode(
      'service',
      'node-svc',
      'SchedulerService',
      'src/services/SchedulerService.ts',
      { filePath: 'src/services/SchedulerService.ts', startLine: 35, language: 'typescript' } as any,
      1,
    );

    const test = createGraphNode(
      'test-suite',
      'node-test',
      'SchedulerService.test.ts',
      'tests/services/SchedulerService.test.ts',
      { filePath: 'tests/services/SchedulerService.test.ts', startLine: 1, language: 'typescript' } as any,
      1,
    );

    graph.addNode(controller);
    graph.addNode(service);
    graph.addNode(test);

    graph.addEdge('node-ctrl', 'node-svc', 'calls', 'confirmed', 0.95, []);
    graph.addEdge('node-test', 'node-svc', 'tests', 'confirmed', 0.9, []);
  });

  it('should generate an architecture graph overview projection', () => {
    const overview = getGraphOverview(graph, 'architecture');

    expect(overview.mode).toBe('architecture');
    expect(overview.nodes.length).toBeGreaterThan(0);
    expect(overview.nodes.some((n) => n.label === 'SchedulerService')).toBe(true);
  });

  it('should expand immediate neighbors of a node', () => {
    const expanded = expandGraphNode(graph, 'node-svc', 'calls');

    expect(expanded.nodes.length).toBeGreaterThanOrEqual(1);
    expect(expanded.nodes.some((n) => n.label === 'SchedulerService')).toBe(true);
  });

  it('should execute callers query mode', () => {
    const result = executeGraphQuery(graph, 'callers', 'SchedulerService');

    expect(result.mode).toBe('callers');
    expect(result.results.length).toBe(1);
    expect(result.results[0].name).toBe('LoadTestController');
    expect(result.summary).toContain('Found 1 caller');
  });

  it('should execute tests query mode', () => {
    const result = executeGraphQuery(graph, 'tests', 'SchedulerService');

    expect(result.mode).toBe('tests');
    expect(result.results.length).toBe(1);
    expect(result.results[0].name).toBe('SchedulerService.test.ts');
  });

  it('should trace execution flow between components', () => {
    const result = executeGraphQuery(graph, 'flow', 'LoadTestController -> SchedulerService');

    expect(result.mode).toBe('flow');
    expect(result.flow).toBeDefined();
    expect(result.flow?.totalDepth).toBe(2);
    expect(result.flow?.nodes[0].name).toBe('LoadTestController');
    expect(result.flow?.nodes[1].name).toBe('SchedulerService');
  });

  it('should provide query suggestions for autocomplete', () => {
    const suggestions = getQuerySuggestions(graph);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.label === 'SchedulerService')).toBe(true);
  });
});
