/**
 * Context Types
 *
 * Defines the specialized context structures that StoryForge creates
 * for each phase of the workflow. These are NOT 500 files dumped into
 * a prompt. They are compact, evidence-backed, relevance-ranked
 * context packages.
 */

import type {
  EntityId,
  RelativePath,
  Evidence,
  ConfidenceSummary,
  ArchitecturalLayer,
  ArchitecturalRole,
} from '../../shared/types.js';

// ─── Feature Intelligence Context ────────────────────────────────────────────

/**
 * Built by the Context Builder when a feature request is received.
 * This becomes the foundation for Discovery.
 */
export interface FeatureIntelligenceContext {
  readonly feature: {
    readonly intent: string;
    readonly concepts: ConceptMatch[];
  };
  readonly architecture: {
    readonly relevantLayers: LayerSummary[];
    readonly affectedModules: ModuleSummary[];
  };
  readonly components: {
    readonly existing: ComponentSummary[];
    readonly potentialGaps: IdentifiedGap[];
  };
  readonly apis: {
    readonly existingEndpoints: ApiSummary[];
    readonly relatedFlows: FlowSummary[];
  };
  readonly dependencies: {
    readonly direct: DependencySummary[];
    readonly external: DependencySummary[];
  };
  readonly tests: {
    readonly existingCoverage: TestSummary[];
    readonly impactedSuites: TestSummary[];
  };
  readonly configuration: {
    readonly relevantItems: ConfigSummary[];
  };
  readonly evidence: Evidence[];
  readonly unresolvedQuestions: UnresolvedQuestion[];
  readonly confidence: ConfidenceSummary;
  readonly generation: number;
}

// ─── Discovery Context ───────────────────────────────────────────────────────

/**
 * Produced by the Discovery Engine after user iteration.
 * This becomes the input for Story generation.
 */
export interface DiscoveryContext {
  readonly featureIntent: string;
  readonly repositoryUnderstanding: FeatureIntelligenceContext;
  readonly affectedAreas: AffectedArea[];
  readonly currentBehavior: BehaviorDescription[];
  readonly proposedBehavior: BehaviorDescription[];
  readonly dependencies: DependencySummary[];
  readonly risks: Risk[];
  readonly assumptions: Assumption[];
  readonly openQuestions: UnresolvedQuestion[];
  readonly evidence: Evidence[];
  readonly approvalStatus: 'draft' | 'in-review' | 'approved';
}

// ─── Story Intelligence Context ──────────────────────────────────────────────

/**
 * Drives user-story and QA-story creation from approved Discovery.
 */
export interface StoryIntelligenceContext {
  readonly discovery: DiscoveryContext;
  readonly componentMap: ComponentSummary[];
  readonly apiMap: ApiSummary[];
  readonly testMap: TestSummary[];
  readonly acceptanceCriteriaInputs: string[];
  readonly qaScenarioInputs: string[];
}

// ─── Supporting Types ────────────────────────────────────────────────────────

export interface ConceptMatch {
  readonly concept: string;
  readonly nodeId: EntityId;
  readonly relevanceScore: number;
  readonly evidence: Evidence[];
}

export interface LayerSummary {
  readonly layer: ArchitecturalLayer;
  readonly nodeCount: number;
  readonly relevantNodes: Array<{ id: EntityId; name: string; type: string }>;
}

export interface ModuleSummary {
  readonly name: string;
  readonly path: RelativePath;
  readonly fileCount: number;
  readonly relevance: number;
}

export interface ComponentSummary {
  readonly id: EntityId;
  readonly name: string;
  readonly filePath: RelativePath;
  readonly role: ArchitecturalRole;
  readonly relevance: number;
  readonly evidence: Evidence[];
}

export interface IdentifiedGap {
  readonly description: string;
  readonly expectedIn: string; // where we'd expect to find this
  readonly confidence: number;
}

export interface ApiSummary {
  readonly method: string;
  readonly path: string;
  readonly handlerFile: RelativePath;
  readonly relevance: number;
}

export interface FlowSummary {
  readonly name: string;
  readonly steps: Array<{ nodeId: EntityId; name: string; type: string }>;
}

export interface DependencySummary {
  readonly name: string;
  readonly type: 'internal' | 'external';
  readonly path?: RelativePath;
  readonly reason: string;
}

export interface TestSummary {
  readonly name: string;
  readonly filePath: RelativePath;
  readonly testCount?: number;
  readonly framework?: string;
}

export interface ConfigSummary {
  readonly key: string;
  readonly filePath: RelativePath;
  readonly type: string;
}

export interface AffectedArea {
  readonly name: string;
  readonly description: string;
  readonly components: ComponentSummary[];
  readonly impactLevel: 'direct' | 'indirect' | 'potential';
}

export interface BehaviorDescription {
  readonly area: string;
  readonly description: string;
  readonly evidence?: Evidence[];
}

export interface Risk {
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly mitigation?: string;
}

export interface Assumption {
  readonly description: string;
  readonly basis: string;
  readonly needsValidation: boolean;
}

export interface UnresolvedQuestion {
  readonly question: string;
  readonly context: string;
  readonly suggestedResolution?: string;
  readonly importance: 'blocking' | 'important' | 'nice-to-know';
}

// ─── Capability Flow Types ───────────────────────────────────────────────────

export type CapabilityStageKind =
  | 'feature-request'
  | 'relevant-capability'
  | 'existing-ui'
  | 'frontend-component'
  | 'api-endpoint'
  | 'backend-controller'
  | 'service-layer'
  | 'shared-library'
  | 'data-configuration'
  | 'existing-tests'
  | 'related-workflows';

export interface CapabilityStage {
  readonly stageNumber: number;
  readonly stage: CapabilityStageKind;
  readonly label: string;
  readonly entityName?: string;
  readonly entityId?: EntityId;
  readonly filePath?: RelativePath;
  readonly description: string;
  readonly evidence: Evidence[];
  readonly confidence: number;
}

export interface CapabilityChain {
  readonly featureIntent: string;
  readonly stages: CapabilityStage[];
  readonly gaps: IdentifiedGap[];
  readonly overallConfidence: number;
}
