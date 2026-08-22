/**
 * Knowledge Graph Edge Types
 *
 * Every edge represents a relationship between two nodes in the knowledge graph.
 * Every edge carries evidence, resolution status, and confidence.
 *
 * This is the key differentiator: StoryForge doesn't pretend every relationship
 * is equally certain. Each edge has provenance.
 */

import type { EntityId, ResolutionStatus, Evidence } from '../../shared/types.js';

// ─── Edge Type Enumeration ───────────────────────────────────────────────────

export type GraphEdgeType =
  // Structural relationships
  | 'contains'           // parent contains child (module → component)
  | 'defined-in'         // symbol defined in file

  // Dependency relationships
  | 'imports'            // file imports from another file/module
  | 'depends-on'        // component depends on another component
  | 'uses-package'      // project uses external package

  // Type relationships
  | 'implements'         // class implements interface
  | 'extends'            // class extends superclass
  | 'type-reference'     // references a type

  // Invocation relationships
  | 'calls'              // function/method calls another
  | 'instantiates'       // creates an instance of a class

  // API relationships
  | 'api-flow'           // API endpoint → handler → service chain
  | 'handles-route'      // controller handles a route
  | 'consumes-api'       // service consumes an API endpoint

  // Communication relationships
  | 'communicates-with'  // service-to-service communication
  | 'publishes-event'    // publishes to a queue/event bus
  | 'subscribes-event'   // subscribes to a queue/event bus

  // Data relationships
  | 'data-flow'          // data transformation chain
  | 'reads-from'         // reads from data source
  | 'writes-to'          // writes to data source
  | 'maps-to'            // DTO maps to entity

  // Configuration relationships
  | 'configures'         // configuration controls behavior
  | 'feature-flag'       // feature flag gates functionality

  // Test relationships
  | 'tests'              // test suite tests component
  | 'test-fixture'       // test uses fixture/mock

  // Semantic relationships
  | 'related-concept'    // semantic relationship between concepts
  | 'belongs-to-concept' // component belongs to a semantic concept

  // Architecture relationships
  | 'layer-boundary'     // crosses architectural layer boundary
  | 'module-boundary';   // crosses module boundary

// ─── Edge Direction ──────────────────────────────────────────────────────────

export type EdgeDirection = 'outgoing' | 'incoming' | 'both';

// ─── Graph Edge ──────────────────────────────────────────────────────────────

export interface GraphEdge {
  readonly id: EntityId;
  readonly source: EntityId;
  readonly target: EntityId;
  readonly type: GraphEdgeType;

  /** How this relationship was determined */
  readonly resolution: ResolutionStatus;

  /** Confidence score from 0.0 to 1.0 */
  readonly confidence: number;

  /** Evidence supporting this relationship */
  readonly evidence: Evidence[];

  /** Optional label for display */
  readonly label?: string;

  /** Additional metadata */
  readonly metadata: Record<string, unknown>;

  /** Generation when this edge was first created */
  readonly generationCreated: number;

  /** Generation when this edge was last verified */
  generationVerified: number;
}

// ─── Edge Factory ────────────────────────────────────────────────────────────

let edgeCounter = 0;

/**
 * Create a new graph edge with evidence and confidence.
 */
export function createGraphEdge(
  source: EntityId,
  target: EntityId,
  type: GraphEdgeType,
  resolution: ResolutionStatus,
  confidence: number,
  evidence: Evidence[],
  generation: number,
  label?: string,
): GraphEdge {
  return {
    id: `edge-${++edgeCounter}-${Date.now().toString(36)}`,
    source,
    target,
    type,
    resolution,
    confidence: Math.max(0, Math.min(1, confidence)),
    evidence,
    label,
    metadata: {},
    generationCreated: generation,
    generationVerified: generation,
  };
}

/**
 * Reset the edge counter (used in testing).
 */
export function resetEdgeCounter(): void {
  edgeCounter = 0;
}

// ─── Edge Confidence Helpers ─────────────────────────────────────────────────

/** High confidence: statically confirmed (import, AST reference, LSP) */
export const CONFIDENCE_HIGH = 0.9;

/** Medium confidence: resolved through strong heuristics */
export const CONFIDENCE_MEDIUM = 0.7;

/** Low confidence: heuristic based on naming/structural patterns */
export const CONFIDENCE_LOW = 0.5;

/** Minimal confidence: unresolved, possible but unverified */
export const CONFIDENCE_MINIMAL = 0.3;

/**
 * Determine resolution status from confidence score.
 */
export function resolutionFromConfidence(confidence: number): ResolutionStatus {
  if (confidence >= CONFIDENCE_HIGH) return 'confirmed';
  if (confidence >= CONFIDENCE_MEDIUM) return 'resolved';
  if (confidence >= CONFIDENCE_LOW) return 'heuristic';
  return 'unresolved';
}
