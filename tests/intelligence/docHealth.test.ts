/**
 * Documentation Health & Gap Analyzer Tests
 *
 * Tests detection of missing docstrings, API descriptions, and module READMEs.
 */

import { describe, it, expect } from 'vitest';
import { KnowledgeGraph } from '../../src/intelligence/graph/knowledgeGraph';
import { createGraphNode } from '../../src/intelligence/graph/graphNode';
import { analyzeDocumentationHealth } from '../../src/intelligence/analyzer/documentationAnalyzer';
import type { FileParseResult } from '../../src/intelligence/parser/treeSitterParser';

describe('DocumentationAnalyzer', () => {
  it('should flag public functions lacking documentation as critical gaps', () => {
    const graph = new KnowledgeGraph();

    const parseResults: FileParseResult[] = [
      {
        filePath: 'src/api/auth.ts',
        language: 'typescript',
        symbols: [
          {
            name: 'authenticateUser',
            qualifiedName: 'authenticateUser',
            kind: 'function',
            location: { filePath: 'src/api/auth.ts', startLine: 1, startColumn: 0, endLine: 10, endColumn: 1 },
            modifiers: ['export'],
            // documentation is omitted
          },
          {
            name: 'documentedHelper',
            qualifiedName: 'documentedHelper',
            kind: 'function',
            location: { filePath: 'src/api/auth.ts', startLine: 12, startColumn: 0, endLine: 20, endColumn: 1 },
            documentation: 'This is a fully documented helper function explaining purpose and params.',
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

    const report = analyzeDocumentationHealth(graph, parseResults, ['src/api/auth.ts']);
    expect(report.totalEntitiesAudited).toBe(2);
    expect(report.documentedCount).toBe(1);
    expect(report.undocumentedCount).toBe(1);
    expect(report.coveragePercent).toBe(50);
    expect(report.criticalGaps.length).toBe(1);
    expect(report.criticalGaps[0].entityName).toBe('authenticateUser');
  });

  it('should flag modules lacking README files', () => {
    const graph = new KnowledgeGraph();
    graph.addNode(createGraphNode('module', 'module:src/payments', 'payments', 'module:src/payments', {
      path: 'src/payments',
    }, 1));

    // File list without README.md in payments
    const report = analyzeDocumentationHealth(graph, [], ['src/payments/service.ts']);
    expect(report.gaps.some(g => g.kind === 'missing-module-readme')).toBe(true);
  });
});
