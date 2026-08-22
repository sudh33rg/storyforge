/**
 * Code Quality & Complexity Tests
 *
 * Validates cyclomatic complexity calculation, module coupling,
 * circular dependency detection via DFS, and maintainability index grading.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraph } from '../../src/intelligence/graph/knowledgeGraph';
import { createGraphNode } from '../../src/intelligence/graph/graphNode';
import { resetEdgeCounter } from '../../src/intelligence/graph/graphEdge';
import { computeQualityMetrics } from '../../src/intelligence/analyzer/qualityAnalyzer';
import type { FileParseResult } from '../../src/intelligence/parser/treeSitterParser';

describe('QualityAnalyzer', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();
    resetEdgeCounter();
  });

  it('should compute cyclomatic complexity for branch-heavy functions', () => {
    graph.addNode(createGraphNode('symbol', 'symbol:complexFn', 'complexFn', 'complexFn', {
      filePath: 'src/utils.ts',
    }, 1));

    const parseResults: FileParseResult[] = [
      {
        filePath: 'src/utils.ts',
        language: 'typescript',
        symbols: [
          {
            name: 'complexFn',
            qualifiedName: 'complexFn',
            kind: 'function',
            location: { filePath: 'src/utils.ts', startLine: 1, startColumn: 0, endLine: 20, endColumn: 1 },
            documentation: 'if (a) { while(b) { for(c) { if (d && e || f) { switch(x) { case 1: break; } } } } }',
            parameters: [{ name: 'a', isOptional: false }, { name: 'b', isOptional: false }, { name: 'c', isOptional: false }, { name: 'd', isOptional: false }],
          },
        ],
        imports: [],
        apiEndpoints: [],
        sqlTables: [],
        dockerServices: [],
        docSections: [],
        parseTimeMs: 1,
        usedTreeSitter: false,
      },
    ];

    const report = computeQualityMetrics(graph, parseResults);
    expect(report.symbolComplexity.length).toBe(1);
    expect(report.symbolComplexity[0].cyclomaticComplexity).toBeGreaterThanOrEqual(6);
    expect(report.avgCyclomaticComplexity).toBeGreaterThanOrEqual(6);
  });

  it('should detect circular dependencies between modules using DFS', () => {
    const fileA = createGraphNode('file', 'file:a.ts', 'a.ts', 'file:a.ts', {}, 1);
    const fileB = createGraphNode('file', 'file:b.ts', 'b.ts', 'file:b.ts', {}, 1);
    const fileC = createGraphNode('file', 'file:c.ts', 'c.ts', 'file:c.ts', {}, 1);

    graph.addNode(fileA);
    graph.addNode(fileB);
    graph.addNode(fileC);

    // A -> B -> C -> A (Circular dependency)
    graph.addEdge('file:a.ts', 'file:b.ts', 'imports', 'confirmed', 1.0, []);
    graph.addEdge('file:b.ts', 'file:c.ts', 'imports', 'confirmed', 1.0, []);
    graph.addEdge('file:c.ts', 'file:a.ts', 'imports', 'confirmed', 1.0, []);

    const report = computeQualityMetrics(graph, []);
    expect(report.circularDependencyCount).toBeGreaterThanOrEqual(1);
    expect(report.circularDependencies[0].length).toBe(3);
  });

  it('should compute maintainability grade accurately', () => {
    // Clean graph with no cycles and low complexity
    const fileA = createGraphNode('file', 'file:clean.ts', 'clean.ts', 'file:clean.ts', {}, 1);
    graph.addNode(fileA);

    const report = computeQualityMetrics(graph, []);
    expect(report.maintainabilityScore).toBeGreaterThanOrEqual(80);
    expect(['A', 'B']).toContain(report.maintainabilityGrade);
  });
});
