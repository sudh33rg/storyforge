/**
 * Documentation Gap Analyzer (GAP 5)
 *
 * Audits the knowledge graph for documentation deficits:
 *
 *   - Public symbols (functions, classes, methods) missing JSDoc/docstrings
 *   - API endpoints missing descriptions or OpenAPI annotations
 *   - Modules missing README files
 *   - Database tables missing column descriptions
 *   - Services missing architecture documentation
 *
 * Reports gap confidence scores, file locations, and actionable remediation hints.
 * Surfaces as "Documentation Health" card in the Quality Dashboard UI.
 */

import { createLogger } from '../../shared/logger.js';
import type { KnowledgeGraph } from '../graph/knowledgeGraph.js';
import type { FileParseResult } from '../parser/treeSitterParser.js';

const log = createLogger('intelligence:documentation');

// ─── Documentation Gap Types ──────────────────────────────────────────────────

export type DocGapSeverity = 'critical' | 'warning' | 'info';
export type DocGapKind =
  | 'missing-symbol-doc'
  | 'missing-api-description'
  | 'missing-module-readme'
  | 'missing-table-description'
  | 'missing-service-doc';

export interface DocumentationGap {
  readonly kind: DocGapKind;
  readonly severity: DocGapSeverity;
  readonly entityName: string;
  readonly entityType: string;
  readonly filePath: string;
  readonly line?: number;
  readonly confidence: number;
  readonly remediation: string;
}

export interface DocumentationHealthReport {
  readonly generation: number;
  readonly computedAt: number;

  readonly totalEntitiesAudited: number;
  readonly documentedCount: number;
  readonly undocumentedCount: number;
  readonly coveragePercent: number;

  readonly gaps: DocumentationGap[];
  readonly criticalGaps: DocumentationGap[];
  readonly warningGaps: DocumentationGap[];

  readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
  readonly summary: string;

  // Breakdown by gap kind
  readonly gapsByKind: Record<DocGapKind, number>;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function analyzeDocumentationHealth(
  graph: KnowledgeGraph,
  parseResults: FileParseResult[],
  fileList: string[],
): DocumentationHealthReport {
  log.info('Analyzing documentation health');

  const gaps: DocumentationGap[] = [];
  let totalAudited = 0;
  let documentedCount = 0;

  // 1. Audit public symbols for missing docstrings
  const { symGaps, symAudited, symDocumented } = auditSymbolDocumentation(parseResults);
  gaps.push(...symGaps);
  totalAudited += symAudited;
  documentedCount += symDocumented;

  // 2. Audit API endpoints for descriptions
  const { apiGaps, apiAudited, apiDocumented } = auditApiEndpoints(graph);
  gaps.push(...apiGaps);
  totalAudited += apiAudited;
  documentedCount += apiDocumented;

  // 3. Audit modules for README files
  const { modGaps, modAudited, modDocumented } = auditModuleReadmes(graph, fileList);
  gaps.push(...modGaps);
  totalAudited += modAudited;
  documentedCount += modDocumented;

  // 4. Audit database tables for column descriptions
  const { tableGaps, tableAudited, tableDocumented } = auditTableDescriptions(graph);
  gaps.push(...tableGaps);
  totalAudited += tableAudited;
  documentedCount += tableDocumented;

  const undocumentedCount = totalAudited - documentedCount;
  const coveragePercent = totalAudited > 0 ? Math.round((documentedCount / totalAudited) * 100) : 100;

  const criticalGaps = gaps.filter(g => g.severity === 'critical');
  const warningGaps = gaps.filter(g => g.severity === 'warning');

  const grade: DocumentationHealthReport['grade'] =
    coveragePercent >= 90 ? 'A' :
    coveragePercent >= 75 ? 'B' :
    coveragePercent >= 60 ? 'C' :
    coveragePercent >= 40 ? 'D' : 'F';

  const gapsByKind = gaps.reduce((acc, g) => {
    acc[g.kind] = (acc[g.kind] ?? 0) + 1;
    return acc;
  }, {} as Record<DocGapKind, number>);

  const summary = buildDocSummary(coveragePercent, grade, criticalGaps.length, warningGaps.length);

  log.info('Documentation health computed', { coveragePercent, grade, gaps: gaps.length });

  return {
    generation: graph.getGeneration(),
    computedAt: Date.now(),
    totalEntitiesAudited: totalAudited,
    documentedCount,
    undocumentedCount,
    coveragePercent,
    gaps: gaps.slice(0, 100), // cap for UI performance
    criticalGaps,
    warningGaps,
    grade,
    summary,
    gapsByKind,
  };
}

// ─── Symbol Documentation Audit ──────────────────────────────────────────────

function auditSymbolDocumentation(
  parseResults: FileParseResult[],
): { symGaps: DocumentationGap[]; symAudited: number; symDocumented: number } {
  const symGaps: DocumentationGap[] = [];
  let symAudited = 0;
  let symDocumented = 0;

  // Only audit "public" symbols (functions, classes, methods, interfaces)
  const auditedKinds = new Set(['function', 'method', 'class', 'interface', 'struct', 'trait']);

  for (const result of parseResults) {
    // Skip test files — they conventionally lack docstrings
    const lowerPath = result.filePath.toLowerCase();
    if (lowerPath.includes('.test.') || lowerPath.includes('.spec.') || lowerPath.includes('/__tests__/')) {
      continue;
    }

    for (const symbol of result.symbols) {
      if (!auditedKinds.has(symbol.kind)) continue;

      // Skip private symbols (underscore-prefixed or marked private)
      if (symbol.name.startsWith('_') || symbol.modifiers?.includes('private')) continue;

      symAudited++;
      const hasDoc = !!(symbol.documentation && symbol.documentation.trim().length > 10);

      if (hasDoc) {
        symDocumented++;
      } else {
        const isPublicApi = symbol.modifiers?.includes('export') || symbol.modifiers?.includes('public');
        symGaps.push({
          kind: 'missing-symbol-doc',
          severity: isPublicApi ? 'critical' : 'warning',
          entityName: symbol.name,
          entityType: symbol.kind,
          filePath: result.filePath,
          line: typeof symbol.location === 'string' ? undefined : undefined,
          confidence: 0.95,
          remediation: `Add JSDoc/docstring to \`${symbol.name}\` in ${result.filePath}`,
        });
      }
    }
  }

  return { symGaps, symAudited, symDocumented };
}

// ─── API Endpoint Audit ───────────────────────────────────────────────────────

function auditApiEndpoints(
  graph: KnowledgeGraph,
): { apiGaps: DocumentationGap[]; apiAudited: number; apiDocumented: number } {
  const apiGaps: DocumentationGap[] = [];
  const endpoints = graph.getNodesByType('api-endpoint');
  let apiDocumented = 0;

  for (const endpoint of endpoints) {
    const data = endpoint.data as {
      method?: string;
      path?: string;
      filePath?: string;
      documentation?: string;
    };

    const hasDoc = !!(endpoint.description || data.documentation);
    if (hasDoc) {
      apiDocumented++;
    } else {
      apiGaps.push({
        kind: 'missing-api-description',
        severity: 'warning',
        entityName: `${data.method ?? 'GET'} ${data.path ?? ''}`,
        entityType: 'api-endpoint',
        filePath: data.filePath ?? '',
        confidence: 0.9,
        remediation: `Add OpenAPI/JSDoc description to endpoint ${data.method} ${data.path}`,
      });
    }
  }

  return { apiGaps, apiAudited: endpoints.length, apiDocumented };
}

// ─── Module README Audit ──────────────────────────────────────────────────────

function auditModuleReadmes(
  graph: KnowledgeGraph,
  fileList: string[],
): { modGaps: DocumentationGap[]; modAudited: number; modDocumented: number } {
  const modGaps: DocumentationGap[] = [];
  const modules = graph.getNodesByType('module');
  const fileSet = new Set(fileList.map(f => f.toLowerCase()));
  let modDocumented = 0;

  for (const mod of modules) {
    const data = mod.data as { path?: string };
    const modPath = data.path ?? '';

    // Check if a README exists in this module's directory
    const hasReadme =
      fileSet.has(`${modPath}/readme.md`) ||
      fileSet.has(`${modPath}/README.md`) ||
      fileSet.has(`${modPath}/README`) ||
      fileSet.has(`${modPath}/readme`);

    if (hasReadme) {
      modDocumented++;
    } else {
      modGaps.push({
        kind: 'missing-module-readme',
        severity: 'info',
        entityName: mod.name,
        entityType: 'module',
        filePath: modPath,
        confidence: 0.85,
        remediation: `Add README.md to module directory \`${modPath}/\``,
      });
    }
  }

  return { modGaps, modAudited: modules.length, modDocumented };
}

// ─── Database Table Audit ─────────────────────────────────────────────────────

function auditTableDescriptions(
  graph: KnowledgeGraph,
): { tableGaps: DocumentationGap[]; tableAudited: number; tableDocumented: number } {
  const tableGaps: DocumentationGap[] = [];
  const tables = graph.getNodesByType('database-table');
  let tableDocumented = 0;

  for (const table of tables) {
    const data = table.data as {
      tableName?: string;
      filePath?: string;
      columns?: Array<{ name: string; type: string }>;
    };

    // A table is "documented" if it has a description node or comments in the schema
    const hasDoc = !!(table.description && table.description.length > 5);

    if (hasDoc) {
      tableDocumented++;
    } else {
      tableGaps.push({
        kind: 'missing-table-description',
        severity: 'info',
        entityName: data.tableName ?? table.name,
        entityType: 'database-table',
        filePath: data.filePath ?? '',
        confidence: 0.8,
        remediation: `Add SQL comment or migration description for table \`${data.tableName ?? table.name}\``,
      });
    }
  }

  return { tableGaps, tableAudited: tables.length, tableDocumented };
}

// ─── Summary Builder ──────────────────────────────────────────────────────────

function buildDocSummary(
  coveragePercent: number,
  grade: string,
  criticalCount: number,
  warningCount: number,
): string {
  const parts: string[] = [];
  parts.push(`Documentation grade: ${grade} (${coveragePercent}% coverage)`);
  if (criticalCount > 0) parts.push(`${criticalCount} critical gap${criticalCount > 1 ? 's' : ''} in public API`);
  if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
  if (coveragePercent >= 90) parts.push('Excellent documentation coverage');
  else if (coveragePercent < 50) parts.push('Major documentation investment needed');
  return parts.join('. ') + '.';
}
