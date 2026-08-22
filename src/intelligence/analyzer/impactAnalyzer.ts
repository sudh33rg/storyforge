/**
 * Impact Analyzer
 *
 * Given a change target, traverses the knowledge graph to find
 * all affected areas: direct dependents, transitive dependents,
 * test suites, API consumers, and configuration dependencies.
 *
 * This is Level 10: Tests / Impact in the understanding hierarchy.
 */

import { createLogger } from '../../shared/logger.js';
import type { KnowledgeGraph } from '../graph/knowledgeGraph.js';
import { analyzeImpact, type ImpactAnalysisResult } from '../graph/graphQuery.js';
import type { EntityId } from '../../shared/types.js';

const log = createLogger('intelligence:analyzer:impact');

export interface ImpactReport {
  readonly targetNode: string;
  readonly targetType: string;
  readonly directImpactCount: number;
  readonly transitiveImpactCount: number;
  readonly affectedTestCount: number;
  readonly affectedApiCount: number;
  readonly affectedServiceCount: number;
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
  readonly analysis: ImpactAnalysisResult;
  readonly summary: string;
}

/**
 * Produce a comprehensive impact report for a proposed change.
 */
export function produceImpactReport(
  graph: KnowledgeGraph,
  nodeId: EntityId,
): ImpactReport {
  const analysis = analyzeImpact(graph, nodeId, 5);

  const directCount = analysis.directImpact.length;
  const transitiveCount = analysis.transitiveImpact.length;
  const testCount = analysis.affectedTests.length;
  const apiCount = analysis.affectedApis.length;
  const serviceCount = analysis.affectedServices.length;

  const riskLevel = computeRiskLevel(directCount, transitiveCount, testCount, apiCount, serviceCount);

  const targetName = analysis.target?.name ?? nodeId;
  const targetType = analysis.target?.type ?? 'unknown';

  const summary = [
    `Impact analysis for ${targetName} (${targetType}):`,
    `${directCount} direct dependent(s), ${transitiveCount} transitive dependent(s).`,
    testCount > 0 ? `${testCount} test suite(s) may be affected.` : 'No affected test suites identified.',
    apiCount > 0 ? `${apiCount} API endpoint(s) may be affected.` : '',
    serviceCount > 0 ? `${serviceCount} service(s) may be affected.` : '',
    `Risk level: ${riskLevel}.`,
  ].filter(Boolean).join(' ');

  log.info('Impact report produced', {
    target: targetName,
    riskLevel,
    directCount,
    transitiveCount,
    testCount,
  });

  return {
    targetNode: targetName,
    targetType,
    directImpactCount: directCount,
    transitiveImpactCount: transitiveCount,
    affectedTestCount: testCount,
    affectedApiCount: apiCount,
    affectedServiceCount: serviceCount,
    riskLevel,
    analysis,
    summary,
  };
}

function computeRiskLevel(
  direct: number,
  transitive: number,
  tests: number,
  apis: number,
  services: number,
): 'low' | 'medium' | 'high' | 'critical' {
  const totalImpact = direct + transitive;

  if (services > 2 || apis > 5 || totalImpact > 50) return 'critical';
  if (services > 0 || apis > 2 || totalImpact > 20) return 'high';
  if (apis > 0 || totalImpact > 5 || tests > 3) return 'medium';
  return 'low';
}
