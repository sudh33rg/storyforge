import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraph } from '../../src/intelligence/graph/knowledgeGraph.js';
import { createGraphNode } from '../../src/intelligence/graph/graphNode.js';
import {
  buildFeatureContext,
  buildDiscoveryContext,
  buildStoryIntelligenceContext,
  buildCapabilityChain,
} from '../../src/intelligence/context/contextBuilder.js';

describe('Context Builders & Capability Flow', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();

    // 1. Add repository structure
    const repoNode = createGraphNode('repository', 'repo:root', 'test-repo', 'test-repo', {
      rootPath: '.',
      detectedLanguages: ['typescript'],
      totalFiles: 10,
      totalSymbols: 25,
    }, 1);
    graph.addNode(repoNode);

    // 2. Add Component (UI & Service)
    const uiComponent = createGraphNode('component', 'component:LoadTestConfig', 'LoadTestConfig', 'src/ui/LoadTestConfig.tsx:LoadTestConfig', {
      filePath: 'src/ui/LoadTestConfig.tsx',
      language: 'typescript',
      symbolKind: 'class',
      architecturalRole: 'component',
    }, 1);
    graph.addNode(uiComponent);

    const controller = createGraphNode('component', 'component:LoadTestController', 'LoadTestController', 'src/controllers/LoadTestController.ts:LoadTestController', {
      filePath: 'src/controllers/LoadTestController.ts',
      language: 'typescript',
      symbolKind: 'class',
      architecturalRole: 'controller',
    }, 1);
    graph.addNode(controller);

    const service = createGraphNode('component', 'component:SchedulerService', 'SchedulerService', 'src/services/SchedulerService.ts:SchedulerService', {
      filePath: 'src/services/SchedulerService.ts',
      language: 'typescript',
      symbolKind: 'class',
      architecturalRole: 'service',
    }, 1);
    graph.addNode(service);

    // 3. Add API Endpoint
    const apiEndpoint = createGraphNode('api-endpoint', 'api:POST:/api/v1/schedule', 'POST /api/v1/schedule', 'api:POST:/api/v1/schedule', {
      method: 'POST',
      path: '/api/v1/schedule',
      filePath: 'src/controllers/LoadTestController.ts',
      handlerSymbol: 'scheduleTest',
    }, 1);
    graph.addNode(apiEndpoint);

    // 4. Add Test Suite
    const testSuite = createGraphNode('test-suite', 'test:SchedulerService.test', 'SchedulerService.test.ts', 'test:SchedulerService.test.ts', {
      filePath: 'tests/services/SchedulerService.test.ts',
      testCount: 5,
      testFramework: 'vitest',
    }, 1);
    graph.addNode(testSuite);

    // Edges
    graph.addEdge(controller.id, service.id, 'depends-on', 'confirmed', 0.95, [{
      type: 'import-statement',
      source: 'src/controllers/LoadTestController.ts',
      description: 'imports SchedulerService',
      resolution: 'confirmed',
      confidence: 0.95,
    }]);

    graph.addEdge(apiEndpoint.id, controller.id, 'api-flow', 'confirmed', 0.95, [{
      type: 'api-route',
      source: 'src/controllers/LoadTestController.ts',
      description: 'routes to LoadTestController',
      resolution: 'confirmed',
      confidence: 0.95,
    }]);

    graph.addEdge(testSuite.id, service.id, 'tests', 'confirmed', 0.95, [{
      type: 'test-coverage',
      source: 'tests/services/SchedulerService.test.ts',
      description: 'tests SchedulerService',
      resolution: 'confirmed',
      confidence: 0.95,
    }]);
  });

  it('should build FeatureIntelligenceContext with evidence and gaps', () => {
    const context = buildFeatureContext(graph, 'Add load test scheduling', ['schedule', 'scheduler', 'loadtest']);

    expect(context.feature.intent).toBe('Add load test scheduling');
    expect(context.components.existing.length).toBeGreaterThan(0);
    expect(context.confidence.overall).toBeGreaterThan(0);
  });

  it('should build DiscoveryContext from repository understanding', () => {
    const discovery = buildDiscoveryContext(graph, 'Add load test scheduling', ['scheduler']);

    expect(discovery.featureIntent).toBe('Add load test scheduling');
    expect(discovery.affectedAreas.length).toBeGreaterThan(0);
    expect(discovery.currentBehavior.length).toBeGreaterThan(0);
    expect(discovery.proposedBehavior.length).toBeGreaterThan(0);
    expect(discovery.approvalStatus).toBe('draft');
  });

  it('should build StoryIntelligenceContext with seed acceptance criteria and QA matrices', () => {
    const discovery = buildDiscoveryContext(graph, 'Add load test scheduling', ['scheduler', 'schedule']);
    const storyContext = buildStoryIntelligenceContext(graph, discovery);

    expect(storyContext.componentMap.length).toBeGreaterThan(0);
    expect(storyContext.acceptanceCriteriaInputs.length).toBeGreaterThan(0);
    expect(storyContext.qaScenarioInputs.length).toBe(4);
  });

  it('should build 11-Stage Capability Reasoning Chain', () => {
    const chain = buildCapabilityChain(graph, 'Add load test scheduling', ['scheduler', 'schedule']);

    expect(chain.stages.length).toBe(11);
    expect(chain.stages[0].stage).toBe('feature-request');
    expect(chain.stages[1].stage).toBe('relevant-capability');
    expect(chain.stages[10].stage).toBe('related-workflows');
    expect(chain.overallConfidence).toBeGreaterThan(0.5);
  });
});
