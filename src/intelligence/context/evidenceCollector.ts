/**
 * Evidence Collector
 *
 * Tracks provenance and confidence for intelligence conclusions.
 * Every important conclusion should have evidence — this is what
 * makes StoryForge different from pretending every relationship
 * is equally certain.
 */

import type { Evidence, ConfidenceSummary, ResolutionStatus } from '../../shared/types.js';

/**
 * Compute a confidence summary from a collection of evidence items.
 */
export function computeConfidence(evidence: Evidence[]): ConfidenceSummary {
  if (evidence.length === 0) {
    return {
      overall: 0,
      confirmedCount: 0,
      resolvedCount: 0,
      heuristicCount: 0,
      unresolvedCount: 0,
    };
  }

  let confirmedCount = 0;
  let resolvedCount = 0;
  let heuristicCount = 0;
  let unresolvedCount = 0;
  let totalConfidence = 0;

  for (const e of evidence) {
    totalConfidence += e.confidence;
    switch (e.resolution) {
      case 'confirmed': confirmedCount++; break;
      case 'resolved': resolvedCount++; break;
      case 'heuristic': heuristicCount++; break;
      case 'unresolved': unresolvedCount++; break;
    }
  }

  return {
    overall: totalConfidence / evidence.length,
    confirmedCount,
    resolvedCount,
    heuristicCount,
    unresolvedCount,
  };
}

/**
 * Merge multiple evidence collections, deduplicating by description.
 */
export function mergeEvidence(...collections: Evidence[][]): Evidence[] {
  const seen = new Set<string>();
  const result: Evidence[] = [];

  for (const collection of collections) {
    for (const e of collection) {
      const key = `${e.type}:${e.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(e);
      }
    }
  }

  return result;
}

/**
 * Filter evidence by minimum confidence.
 */
export function filterByConfidence(evidence: Evidence[], minConfidence: number): Evidence[] {
  return evidence.filter((e) => e.confidence >= minConfidence);
}

/**
 * Filter evidence by resolution status.
 */
export function filterByResolution(evidence: Evidence[], ...statuses: ResolutionStatus[]): Evidence[] {
  return evidence.filter((e) => statuses.includes(e.resolution));
}

/**
 * Sort evidence by confidence (highest first).
 */
export function sortByConfidence(evidence: Evidence[]): Evidence[] {
  return [...evidence].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Generate a human-readable evidence summary.
 */
export function summarizeEvidence(evidence: Evidence[]): string {
  const summary = computeConfidence(evidence);

  const parts: string[] = [];
  if (summary.confirmedCount > 0) parts.push(`${summary.confirmedCount} confirmed`);
  if (summary.resolvedCount > 0) parts.push(`${summary.resolvedCount} resolved`);
  if (summary.heuristicCount > 0) parts.push(`${summary.heuristicCount} heuristic`);
  if (summary.unresolvedCount > 0) parts.push(`${summary.unresolvedCount} unresolved`);

  return `${evidence.length} evidence items (${parts.join(', ')}). Overall confidence: ${(summary.overall * 100).toFixed(0)}%.`;
}
