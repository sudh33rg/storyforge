/**
 * Relationship Analyzer
 *
 * Analyzes parse results to detect and build relationship edges
 * in the knowledge graph (Level 8: Relationships):
 *
 * - Import/dependency relationships
 * - Call chains & method invocations (STATIC CALL GRAPH — cross-file)
 * - Inheritance and implementation hierarchies
 * - API flows & route handlers
 * - SQL Table foreign keys & Model-to-Table mappings
 * - Container & infrastructure dependencies
 *
 * GAP 2 FIX: The static call graph now wires ParsedCallSite[] data
 * from every parsed symbol into 'calls' edges in the knowledge graph,
 * enabling accurate impact analysis, caller/callee queries, and blast-radius UI.
 */

import * as path from 'path';
import { createLogger } from '../../shared/logger.js';
import type { Evidence, RelativePath } from '../../shared/types.js';
import type { KnowledgeGraph } from '../graph/knowledgeGraph.js';
import { createGraphNode } from '../graph/graphNode.js';
import {
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
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
  const initialEdgeCount = graph.getStats().edgeCount;

  // 1. Build import relationships
  for (const result of parseResults) {
    buildImportRelationships(graph, result, parseResults, generation);
  }

  // 2. Build inheritance/implementation relationships
  for (const result of parseResults) {
    buildTypeRelationships(graph, result, parseResults, generation);
  }

  // 3. Build API flow relationships
  buildApiFlowRelationships(graph, parseResults, generation);

  // 4. Build SQL schema foreign key relationships
  buildSqlSchemaRelationships(graph, parseResults, generation);

  // 5. Build Model to Table mapping relationships
  buildModelTableRelationships(graph, parseResults, generation);

  // 6. Build static call graph (GAP 2 — wires ParsedCallSite[] into 'calls' edges)
  buildCallGraphRelationships(graph, parseResults, generation);

  const finalEdgeCount = graph.getStats().edgeCount;
  const edgesCreated = finalEdgeCount - initialEdgeCount;

  log.info('Relationships built', { edgesCreated, totalEdges: finalEdgeCount });
  return { edgesCreated, edgesUpdated: 0 };
}

// ─── Import Relationships ────────────────────────────────────────────────────

function buildImportRelationships(
  graph: KnowledgeGraph,
  result: FileParseResult,
  allResults: FileParseResult[],
  generation: number,
): void {
  const sourceFileId = `file:${result.filePath}`;
  if (!graph.hasNode(sourceFileId)) return;

  for (const imp of result.imports) {
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
          }
        }
      }
    } else if (isExternalPackage(imp.source)) {
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
    }
  }
}

// ─── Type Relationships (Inheritance/Implementation) ─────────────────────────

function buildTypeRelationships(
  graph: KnowledgeGraph,
  result: FileParseResult,
  allResults: FileParseResult[],
  generation: number,
): void {
  for (const symbol of result.symbols) {
    const symbolId = ['class', 'interface', 'struct', 'trait', 'impl', 'enum'].includes(symbol.kind)
      ? `component:${symbol.qualifiedName}`
      : `symbol:${symbol.qualifiedName}`;

    if (!graph.hasNode(symbolId)) continue;

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
      }
    }

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
        }
      }
    }
  }
}

// ─── API Flow Relationships ──────────────────────────────────────────────────

function buildApiFlowRelationships(
  graph: KnowledgeGraph,
  parseResults: FileParseResult[],
  generation: number,
): void {
  for (const result of parseResults) {
    for (const endpoint of result.apiEndpoints) {
      const endpointId = `api:${endpoint.method}:${endpoint.path}`;
      if (!graph.hasNode(endpointId)) continue;

      const handlerSymbol = result.symbols.find((s) =>
        s.kind === 'method' || s.kind === 'function',
      );

      if (handlerSymbol) {
        const handlerId = ['class', 'interface', 'struct', 'enum', 'trait'].includes(handlerSymbol.kind)
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
        }
      }
    }
  }
}

// ─── SQL Schema Relationships ────────────────────────────────────────────────

function buildSqlSchemaRelationships(
  graph: KnowledgeGraph,
  parseResults: FileParseResult[],
  generation: number,
): void {
  for (const result of parseResults) {
    for (const table of result.sqlTables || []) {
      const sourceTableId = `table:${table.tableName}`;
      if (!graph.hasNode(sourceTableId)) continue;

      for (const fk of table.foreignKeys || []) {
        const targetTableId = `table:${fk.referencesTable}`;
        if (graph.hasNode(targetTableId)) {
          graph.addEdge(sourceTableId, targetTableId, 'depends-on', 'confirmed', CONFIDENCE_HIGH, [{
            type: 'sql-query',
            source: table.location,
            description: `${table.tableName}.${fk.column} references ${fk.referencesTable}.${fk.referencesColumn}`,
            resolution: 'confirmed',
            confidence: CONFIDENCE_HIGH,
          }]);
        }
      }
    }
  }
}

// ─── Model to Table Mapping Relationships ────────────────────────────────────

function buildModelTableRelationships(
  graph: KnowledgeGraph,
  parseResults: FileParseResult[],
  generation: number,
): void {
  const tables = graph.getNodesByType('database-table');
  const tableNames = new Map(tables.map((t) => [t.name.toLowerCase(), t.id]));

  for (const result of parseResults) {
    for (const symbol of result.symbols) {
      if (symbol.kind === 'class' || symbol.kind === 'struct' || symbol.kind === 'interface') {
        const lowerName = symbol.name.toLowerCase();
        const pluralName = `${lowerName}s`;

        const matchedTableId = tableNames.get(lowerName) || tableNames.get(pluralName);
        if (matchedTableId) {
          const compId = `component:${symbol.qualifiedName}`;
          if (graph.hasNode(compId)) {
            graph.addEdge(compId, matchedTableId, 'maps-to', 'resolved', CONFIDENCE_MEDIUM, [{
              type: 'naming-convention',
              source: symbol.location,
              description: `Entity ${symbol.name} maps to SQL table ${graph.getNode(matchedTableId)?.name}`,
              resolution: 'resolved',
              confidence: CONFIDENCE_MEDIUM,
            }]);
          }
        }
      }
    }
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function resolveImportPath(
  fromFile: RelativePath,
  importSource: string,
  allResults: FileParseResult[],
): RelativePath | undefined {
  if (isExternalPackage(importSource)) return undefined;

  const fromDir = path.dirname(fromFile);

  const candidates = [
    path.join(fromDir, importSource),
    path.join(fromDir, importSource + '.ts'),
    path.join(fromDir, importSource + '.tsx'),
    path.join(fromDir, importSource + '.js'),
    path.join(fromDir, importSource + '.jsx'),
    path.join(fromDir, importSource + '.rs'),
    path.join(fromDir, importSource + '.go'),
    path.join(fromDir, importSource, 'index.ts'),
    path.join(fromDir, importSource, 'index.js'),
    path.join(fromDir, importSource, 'mod.rs'),
    path.join(fromDir, importSource.replace(/\.js$/, '.ts')),
  ];

  const normalizedCandidates = candidates.map((c) => path.normalize(c));
  const allPaths = new Set(allResults.map((r) => path.normalize(r.filePath)));

  for (const candidate of normalizedCandidates) {
    if (allPaths.has(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function isExternalPackage(source: string): boolean {
  return !source.startsWith('.') && !source.startsWith('/');
}

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

function findTypeByName(
  graph: KnowledgeGraph,
  typeName: string,
  allResults: FileParseResult[],
): string | undefined {
  const byQName = graph.getNodeByQualifiedName(typeName);
  if (byQName) return byQName.id;

  const components = graph.getNodesByType('component');
  const match = components.find((c) => c.name === typeName);
  if (match) return match.id;

  return undefined;
}

// ─── Static Call Graph ───────────────────────────────────────────────────────

/**
 * Build static call graph edges from parsed call sites.
 *
 * For every symbol that has `callSites`, resolves each callee to a graph node
 * and creates a typed `'calls'` edge. Resolution order:
 *   1. Exact qualified name match in the graph
 *   2. Exact name match across all symbols/components
 *   3. Name match scoped to the same file first (prefer local)
 *
 * This activates accurate caller/callee queries, test impact propagation,
 * and blast-radius UI — all of which require a wired call graph.
 */
function buildCallGraphRelationships(
  graph: KnowledgeGraph,
  parseResults: FileParseResult[],
  generation: number,
): void {
  // Build fast name → nodeId resolution map
  const symbolsByName = new Map<string, string[]>(); // name → [nodeId, ...]
  const allSymbols = [...graph.getNodesByType('symbol'), ...graph.getNodesByType('component')];

  for (const node of allSymbols) {
    if (!symbolsByName.has(node.name)) {
      symbolsByName.set(node.name, []);
    }
    symbolsByName.get(node.name)!.push(node.id);
  }

  let callEdgesCreated = 0;

  for (const result of parseResults) {
    for (const symbol of result.symbols) {
      if (!symbol.callSites || symbol.callSites.length === 0) continue;

      // Determine the caller node id
      const isComponent = ['class', 'interface', 'struct', 'trait', 'impl', 'enum'].includes(symbol.kind);
      const callerId = isComponent
        ? `component:${symbol.qualifiedName}`
        : `symbol:${symbol.qualifiedName}`;

      if (!graph.hasNode(callerId)) continue;

      for (const callSite of symbol.callSites) {
        const callee = callSite.callee;

        // 1. Try exact qualified name
        let targetId: string | undefined;
        const byQName = graph.getNodeByQualifiedName(callee);
        if (byQName) {
          targetId = byQName.id;
        }

        // 2. Try exact name match — prefer same-file nodes
        if (!targetId) {
          const candidates = symbolsByName.get(callee);
          if (candidates && candidates.length > 0) {
            // Prefer nodes from the same file
            const sameFile = candidates.find((id) => {
              const n = graph.getNode(id);
              return (n?.data as { filePath?: string })?.filePath === result.filePath;
            });
            targetId = sameFile ?? candidates[0];
          }
        }

        // 3. Try partial name match (for method calls like obj.method())
        if (!targetId && callee.includes('.')) {
          const methodName = callee.split('.').pop()!;
          const candidates = symbolsByName.get(methodName);
          if (candidates && candidates.length > 0) {
            targetId = candidates[0];
          }
        }

        if (!targetId || targetId === callerId) continue;

        // Skip self-references and already-existing edges
        try {
          graph.addEdge(callerId, targetId, 'calls', 'resolved', CONFIDENCE_MEDIUM, [{
            type: 'call-site',
            source: callSite.location,
            description: `${symbol.name} calls ${callee}`,
            resolution: 'resolved',
            confidence: CONFIDENCE_MEDIUM,
          }]);
          callEdgesCreated++;
        } catch {
          // Silently skip if source/target not found (race condition from incremental update)
        }
      }
    }
  }

  log.info('Static call graph built', { callEdgesCreated });
}
