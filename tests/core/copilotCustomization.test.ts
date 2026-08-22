import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraph } from '../../src/intelligence/graph/knowledgeGraph.js';
import { createGraphNode } from '../../src/intelligence/graph/graphNode.js';
import { generateCopilotCustomization } from '../../src/core/copilotCustomization.js';

describe('Copilot Customization Generator', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();

    const api = createGraphNode(
      'api-endpoint',
      'api-1',
      'POST /api/v1/users',
      'src/api/routes.ts:L10',
      { filePath: 'src/api/routes.ts', method: 'POST', language: 'typescript' } as any,
      1,
    );

    const service = createGraphNode(
      'service',
      'svc-1',
      'UserService',
      'src/services/UserService.ts',
      { filePath: 'src/services/UserService.ts', language: 'typescript' } as any,
      1,
    );

    const test = createGraphNode(
      'test-suite',
      'test-1',
      'UserService.test.ts',
      'tests/UserService.test.ts',
      { filePath: 'tests/UserService.test.ts', language: 'typescript' } as any,
      1,
    );

    graph.addNode(api);
    graph.addNode(service);
    graph.addNode(test);
  });

  it('should generate an intelligence map and language guidelines', () => {
    const pack = generateCopilotCustomization(graph, 'storyforge');

    expect(pack.workspaceName).toBe('storyforge');
    expect(pack.artifacts.length).toBeGreaterThanOrEqual(2);

    const map = pack.artifacts.find((a) => a.type === 'intelligence-map');
    expect(map).toBeDefined();
    expect(map?.content).toContain('POST /api/v1/users');
    expect(map?.content).toContain('UserService');
    expect(map?.path).toBe('.github/copilot/intelligence.md');

    const lang = pack.artifacts.find((a) => a.type === 'language-guidance');
    expect(lang).toBeDefined();
    expect(lang?.path).toContain('typescript');
  });

  it('should estimate total token weight for the customization pack', () => {
    const pack = generateCopilotCustomization(graph, 'storyforge');

    expect(pack.totalTokens).toBeGreaterThan(50);
    expect(pack.totalTokens).toBeLessThan(5000);
  });
});
