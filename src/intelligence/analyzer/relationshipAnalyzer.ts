/**
 * Relationship Analyzer
 *
 * Analyzes parse results to detect and build relationship edges
 * in the knowledge graph (Level 8: Relationships):
 *
 * - Import/dependency relationships
 * - Call chains
 * - Inheritance and implementation hierarchies
 * - API flows
 * - Type references
 *
 * Each relationship is created with evidence and confidence scoring.
 */

import * as path from 'path';
import { createLogger } from '../../shared/logger.js';
import type { Evidence, RelativePath, ResolutionStatus } from '../../shared/types.js';
import type { KnowledgeGraph } from '../graph/knowledgeGraph.js';
import { createGraphNode } from '../graph/graphNode.js';
import type { GraphEdgeType } from '../graph/graphEdge.js';
import {
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  CONFIDENCE_LOW,
} from '../graph/graphEdge.js';
import type { FileParseResult } from '../parser/treeSitterParser.js';

const log = createLogger('intelligence:analyzer:relationships');

/**
 * Build all relationship edges from parse results.
 */
export function buildRelationships(
  graph: KnowledgeGraph,
  parseResults: FileParseResult[],
  generation: number,
): { edgesCreated: number; edgesUpdated: number } {
  let edgesCreated = 0;
  let edgesUpdated = 0;

  const initialEdgeCount = graph.getStats().edgeCount;

  // Build import relationships
  for (const result of parseResults) {
    edgesCreated += buildImportRelationships(graph, result, parseResults, generation);
  }

  // Build inheritance/implementation relationships
  for (const result of parseResults) {
    edgesCreated += buildTypeRelationships(graph, result, parseResults, generation);
  }

  // Build API flow relationships
  edgesCreated += buildApiFlowRelationships(graph, parseResults, generation);

  const finalEdgeCount = graph.getStats().edgeCount;
  edgesCreated = finalEdgeCount - initialEdgeCount;

  log.info('Relationships built', { edgesCreated, edgesUpdated });
  return { edgesCreated, edgesUpdated };
}

// ─── Import Relationships ────────────────────────────────────────────────────

function buildImportRelationships(
  graph: KnowledgeGraph,
  result: FileParseResult,
  allResults: FileParseResult[],
  generation: number,
): number {
  let count = 0;
  const sourceFileId = `file:${result.filePath}`;

  if (!graph.hasNode(sourceFileId)) return 0;

  for (const imp of result.imports) {
    // Resolve the import to a target file
    const targetFilePath = resolveImportPath(result.filePath, imp.source, allResults);

    if (targetFilePath) {
      const targetFileId = `file:${targetFilePath}`;
      if (graph.hasNode(targetFileId)) {
        const evidence: Evidence = {
          type: 'import-statement',
          source: imp.location,
          description: `${result.filePath} imports from ${imp.source} → resolved to ${targetFilePath}`,
          resolution: 'confirmed',
          confidence: CONFIDENCE_HIGH,
        };

        graph.addEdge(
          sourceFileId,
          targetFileId,
          'imports',
          'confirmed',
          CONFIDENCE_HIGH,
          [evidence],
        );
        count++;

        // Also create edges for specific imported symbols
        for (const specifier of imp.specifiers) {
          const targetSymbol = findSymbolInFile(graph, targetFilePath, specifier);
          if (targetSymbol) {
            graph.addEdge(
              sourceFileId,
              targetSymbol,
              'depends-on',
              'confirmed',
              CONFIDENCE_HIGH,
              [{
                type: 'import-statement',
                source: imp.location,
                description: `Imports ${specifier} from ${imp.source}`,
                resolution: 'confirmed',
                confidence: CONFIDENCE_HIGH,
              }],
            );
            count++;
          }
        }
      }
    } else if (isExternalPackage(imp.source)) {
      // Create external dependency node if it doesn't exist
      const extDepId = `ext:${imp.source}`;
      if (!graph.hasNode(extDepId)) {
        graph.addNode(
          createGraphNode('external-dependency', extDepId, imp.source, extDepId, {
            packageName: imp.source,
          }, generation),
        );
      }

      graph.addEdge(
        sourceFileId,
        extDepId,
        'uses-package',
        'confirmed',
        CONFIDENCE_HIGH,
        [{
          type: 'import-statement',
          source: imp.location,
          description: `Uses external package ${imp.source}`,
          resolution: 'confirmed',
          confidence: CONFIDENCE_HIGH,
        }],
      );
      count++;
    }
  }

  return count;
}

// ─── Type Relationships (Inheritance/Implementation) ─────────────────────────

function buildTypeRelationships(
  graph: KnowledgeGraph,
  result: FileParseResult,
  allResults: FileParseResult[],
  generation: number,
): number {
  let count = 0;

  for (const symbol of result.symbols) {
    const symbolId = ['class', 'interface', 'struct', 'enum'].includes(symbol.kind)
      ? `component:${symbol.qualifiedName}`
      : `symbol:${symbol.qualifiedName}`;

    if (!graph.hasNode(symbolId)) continue;

    // Extends relationship
    if (symbol.extendsType) {
      const parentId = findTypeByName(graph, symbol.extendsType, allResults);
      if (parentId) {
        graph.addEdge(symbolId, parentId, 'extends', 'confirmed', CONFIDENCE_HIGH, [{
          type: 'inheritance',
          source: symbol.location,
          description: `${symbol.name} extends ${symbol.extendsType}`,
          resolution: 'confirmed',
          confidence: CONFIDENCE_HIGH,
        }]);
        count++;
      } else {
        // Heuristic: type exists but we couldn't resolve it
        log.debug('Unresolved extends', {
          symbol: symbol.name,
          extends: symbol.extendsType,
        });
      }
    }

    // Implements relationship
    if (symbol.implementsTypes) {
      for (const impl of symbol.implementsTypes) {
        const interfaceId = findTypeByName(graph, impl, allResults);
        if (interfaceId) {
          graph.addEdge(symbolId, interfaceId, 'implements', 'confirmed', CONFIDENCE_HIGH, [{
            type: 'implementation',
            source: symbol.location,
            description: `${symbol.name} implements ${impl}`,
            resolution: 'confirmed',
            confidence: CONFIDENCE_HIGH,
          }]);
          count++;
        }
      }
    }
  }

  return count;
}

// ─── API Flow Relationships ──────────────────────────────────────────────────

function buildApiFlowRelationships(
  graph: KnowledgeGraph,
  parseResults: FileParseResult[],
  generation: number,
): number {
  let count = 0;

  // Find API endpoints and trace to their handlers
  for (const result of parseResults) {
    for (const endpoint of result.apiEndpoints) {
      const endpointId = `api:${endpoint.method}:${endpoint.path}`;
      if (!graph.hasNode(endpointId)) continue;

      // Find the handler symbol in the same file
      const handlerSymbol = result.symbols.find((s) =>
        s.kind === 'method' || s.kind === 'function',
      );

      if (handlerSymbol) {
        const handlerId = ['class', 'interface', 'struct', 'enum'].includes(handlerSymbol.kind)
          ? `component:${handlerSymbol.qualifiedName}`
          : `symbol:${handlerSymbol.qualifiedName}`;

        if (graph.hasNode(handlerId)) {
          graph.addEdge(endpointId, handlerId, 'api-flow', 'resolved', CONFIDENCE_MEDIUM, [{
            type: 'api-route',
            source: endpoint.location,
            description: `${endpoint.method} ${endpoint.path} → ${handlerSymbol.name}`,
            resolution: 'resolved',
            confidence: CONFIDENCE_MEDIUM,
          }]);
          count++;
        }
      }
    }
  }

  return count;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Resolve an import path to an actual file path.
 */
function resolveImportPath(
  fromFile: RelativePath,
  importSource: string,
  allResults: FileParseResult[],
): RelativePath | undefined {
  // Skip external packages
  if (isExternalPackage(importSource)) return undefined;

  const fromDir = path.dirname(fromFile);

  // Try relative resolution
  const candidates = [
    path.join(fromDir, importSource),
    path.join(fromDir, importSource + '.ts'),
    path.join(fromDir, importSource + '.tsx'),
    path.join(fromDir, importSource + '.js'),
    path.join(fromDir, importSource + '.jsx'),
    path.join(fromDir, importSource, 'index.ts'),
    path.join(fromDir, importSource, 'index.js'),
    // Remove .js extension and try .ts
    path.join(fromDir, importSource.replace(/\.js$/, '.ts')),
  ];

  // Normalize paths
  const normalizedCandidates = candidates.map((c) => path.normalize(c));
  const allPaths = new Set(allResults.map((r) => path.normalize(r.filePath)));

  for (const candidate of normalizedCandidates) {
    if (allPaths.has(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Check if an import source is an external package (not a relative path).
 */
function isExternalPackage(source: string): boolean {
  return !source.startsWith('.') && !source.startsWith('/');
}

/**
 * Find a symbol node in a file by name.
 */
function findSymbolInFile(
  graph: KnowledgeGraph,
  filePath: RelativePath,
  symbolName: string,
): string | undefined {
  const fileId = `file:${filePath}`;
  const children = graph.getChildren(fileId);

  for (const child of children) {
    if (child.name === symbolName) {
      return child.id;
    }
  }

  return undefined;
}

/**
 * Find a type (class/interface) by name across all files.
 */
function findTypeByName(
  graph: KnowledgeGraph,
  typeName: string,
  allResults: FileParseResult[],
): string | undefined {
  // First try exact qualified name match
  const byQName = graph.getNodeByQualifiedName(typeName);
  if (byQName) return byQName.id;

  // Then search all components by name
  const components = graph.getNodesByType('component');
  const match = components.find((c) => c.name === typeName);
  if (match) return match.id;

  return undefined;
}
