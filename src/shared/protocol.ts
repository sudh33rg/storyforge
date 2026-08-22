/**
 * StoryForge Shared Protocol
 *
 * Strongly-typed message protocol between the webview and the extension host.
 * All communication flows through message passing (postMessage).
 *
 * Direction: Webview → Extension = WebviewRequest
 * Direction: Extension → Webview = ExtensionEvent
 */

// ─── View Names ──────────────────────────────────────────────────────────────

export type ViewName =
  | 'intelligence'
  | 'copilot'
  | 'enricher'
  | 'workbench'
  | 'feature'
  | 'discovery'
  | 'stories';

// ─── Intelligence Status ─────────────────────────────────────────────────────

export type IntelligenceState =
  | 'unavailable'    // no intelligence built yet
  | 'indexing'       // full scan or incremental refresh in progress
  | 'cancelling'     // cancellation requested
  | 'fresh'          // intelligence is current
  | 'stale'          // workspace changes detected since last refresh
  | 'partial'        // intelligence available but with gaps
  | 'degraded'       // significant coverage issues
  | 'failed'         // last refresh failed
  | 'cancelled';     // last refresh was cancelled

export interface IntelligenceMetrics {
  readonly discovered: number;
  readonly indexed: number;
  readonly reused: number;
  readonly reparsed: number;
  readonly skipped: number;
  readonly unsupported: number;
  readonly failed: number;
  readonly contentReads: number;
  readonly symbols: number;
  readonly relationships: number;
  readonly entryPoints: number;
  readonly tests: number;
  readonly dependencies: number;
  readonly durationMs: number;
}

export interface IntelligenceCoverage {
  readonly completeness: 'full' | 'partial' | 'degraded';
  readonly languageBreakdown: Array<{ language: string; fileCount: number; percentage: number }>;
  readonly frameworks: string[];
  readonly patterns: string[];
}

export interface IntelligenceProgress {
  readonly jobId: string;
  readonly phase: string;
  readonly message: string;
  readonly completed: number;
  readonly total: number;
}

export interface SqlTableDto {
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  readonly line: number;
  readonly columns: Array<{ name: string; type: string; isPrimary?: boolean; isNullable?: boolean }>;
  readonly foreignKeys: Array<{ column: string; targetTable: string; targetColumn: string }>;
  readonly mappedModels: string[];
}

export interface DockerServiceDto {
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  readonly line: number;
  readonly image?: string;
  readonly ports: string[];
  readonly dependsOn: string[];
}

export interface CapabilityStageDto {
  readonly stage: string;
  readonly label: string;
  readonly component: string;
  readonly filePath: string;
  readonly line: number;
  readonly confidence: number;
  readonly status: 'confirmed' | 'resolved' | 'heuristic' | 'gap';
  readonly role: string;
  readonly notes: string;
  readonly seedAcceptanceCriteria?: string[];
}

export interface SemanticSearchMatchDto {
  readonly name: string;
  readonly type: string;
  readonly qualifiedName: string;
  readonly filePath: string;
  readonly bm25Score: number;
  readonly denseScore: number;
  readonly rrfScore: number;
  readonly score: number;
  readonly matchedTerms: string[];
}

export interface IntelligenceStatus {
  readonly state: IntelligenceState;
  readonly workspaceName: string;
  readonly generationId: string | null;
  readonly completedAt: string | null;
  readonly lastRefresh: string | null;
  readonly stalePaths: number;
  readonly stalePathList: string[];
  readonly metrics: IntelligenceMetrics | null;
  readonly coverage: IntelligenceCoverage | null;
  readonly progress: IntelligenceProgress | null;
  readonly error: string | null;
  readonly sqlTables?: SqlTableDto[];
  readonly dockerServices?: DockerServiceDto[];
  readonly capabilityStages?: CapabilityStageDto[];
}

// ─── App Snapshot ────────────────────────────────────────────────────────────

export interface AppSnapshot {
  readonly activeView: ViewName;
  readonly intelligence: IntelligenceStatus;
  readonly discovery: DiscoverySnapshot | null;
  readonly featureHistory: FeatureLifecycleSnapshot[];
  readonly storyGeneration: StoryGenerationSnapshot | null;
}

// ─── Feature & Discovery ─────────────────────────────────────────────────────

export interface FeatureIntent {
  readonly title: string;
  readonly description: string;
  readonly acceptanceContext: string[];
  readonly domainTerms: string[];
  readonly source: 'manual' | 'valueedge' | 'alm';
}

export interface DiscoveryEvidenceItem {
  readonly id: string;
  readonly conceptId: string;
  readonly displayName: string;
  readonly kind: string;
  readonly group: string;
  readonly relevance: string;
  readonly confidence: number;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly selected: boolean;
}

export interface DiscoveryQuestion {
  readonly id: string;
  readonly question: string;
  readonly context: string;
  readonly category: string;
  readonly status: 'open' | 'answered' | 'skipped' | 'deferred';
  readonly answer?: string;
}

export interface DiscoverySnapshot {
  readonly id: string;
  readonly feature: FeatureIntent;
  readonly evidence: DiscoveryEvidenceItem[];
  readonly questions: DiscoveryQuestion[];
  readonly groups: Array<{ id: string; title: string; description: string; evidenceCount: number }>;
  readonly overallConfidence: number;
  readonly generationId: string;
  readonly approvedAt: string | null;
  readonly createdAt: string;
  readonly iterationCount: number;
}

// ─── Story Generation ────────────────────────────────────────────────────────

export type StoryReviewStatus = 'draft' | 'accepted' | 'rejected';

export interface UserStorySnapshot {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly outcome: string;
  readonly scope: string[];
  readonly acceptanceCriteria: string[];
  readonly affectedComponents: string[];
  readonly status: StoryReviewStatus;
  readonly selected: boolean;
}

export interface QaStorySnapshot {
  readonly id: string;
  readonly title: string;
  readonly testObjective: string;
  readonly parentUserStoryId?: string;
  readonly scenarios: string[];
  readonly positivePaths: string[];
  readonly negativePaths: string[];
  readonly boundaryCases: string[];
  readonly status: StoryReviewStatus;
  readonly selected: boolean;
}

export interface StoryGenerationSnapshot {
  readonly state: string;
  readonly generatedAt: string | null;
  readonly userStories: UserStorySnapshot[];
  readonly qaStories: QaStorySnapshot[];
  readonly error: string | null;
}

export interface FeatureLifecycleSnapshot {
  readonly id: string;
  readonly feature: FeatureIntent;
  readonly phase: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── Graph Explorer & Visual Modeling ───────────────────────────────────────

export type GraphMode =
  | 'architecture'
  | 'dependencies'
  | 'calls'
  | 'flows'
  | 'tests-impact';

export interface GraphFilters {
  readonly kind?: string;
  readonly language?: string;
  readonly search?: string;
  readonly confidence?: 'all' | 'high' | 'medium' | 'low';
}

export interface GraphNodeDto {
  readonly id: string;
  readonly label: string;
  readonly qualifiedName: string;
  readonly kind: string;
  readonly path?: string;
  readonly line?: number;
  readonly groupId?: string;
  readonly groupLabel?: string;
  readonly depth: number;
  readonly unresolved: boolean;
  readonly confidence: number;
  readonly language?: string;
  readonly framework?: string;
}

export interface GraphEdgeDto {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly relationshipType: string;
  readonly resolution: string;
  readonly confidence: number;
  readonly unresolved: boolean;
}

export interface GraphResponseDto {
  readonly mode: GraphMode;
  readonly nodes: GraphNodeDto[];
  readonly edges: GraphEdgeDto[];
  readonly totalNodes: number;
  readonly truncated: boolean;
}

// ─── Query Surface & Flow Tracing ────────────────────────────────────────────

export type QueryMode =
  | 'definition'
  | 'callers'
  | 'callees'
  | 'implementations'
  | 'usages'
  | 'tests'
  | 'flow'
  | 'search'
  | 'ai'
  | 'structural';

export interface QueryItemDto {
  readonly id: string;
  readonly name: string;
  readonly qualifiedName: string;
  readonly kind: string;
  readonly path: string;
  readonly line: number;
  readonly language?: string;
  readonly framework?: string;
  readonly confidence: number;
  readonly role?: string;
}

export interface FlowPathDto {
  readonly id: string;
  readonly totalDepth: number;
  readonly nodes: QueryItemDto[];
  readonly relationships: Array<{ kind: string; resolution: string; confidence: number }>;
  readonly cycleDetected?: boolean;
}

export interface QueryResultDto {
  readonly mode: QueryMode;
  readonly queryText: string;
  readonly results: QueryItemDto[];
  readonly flow?: FlowPathDto;
  readonly summary: string;
}

export interface MetricDetailsDto {
  readonly category: string;
  readonly title: string;
  readonly items: QueryItemDto[];
}

// ─── Impact Analysis ─────────────────────────────────────────────────────────

export interface ImpactNodeDto {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly filePath?: string;
  readonly impactLevel: 'direct' | 'transitive' | 'test' | 'api';
  readonly confidence: number;
}

export interface ImpactAnalysisResponseDto {
  readonly targetId: string;
  readonly targetName: string;
  readonly targetType: string;
  readonly targetPath?: string;
  readonly directImpact: ImpactNodeDto[];
  readonly transitiveImpact: ImpactNodeDto[];
  readonly affectedTests: ImpactNodeDto[];
  readonly affectedApis: ImpactNodeDto[];
  readonly totalImpacted: number;
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// ─── Code Quality ─────────────────────────────────────────────────────────────

export interface ComplexityItemDto {
  readonly nodeId: string;
  readonly name: string;
  readonly filePath: string;
  readonly cyclomaticComplexity: number;
  readonly rating: 'low' | 'medium' | 'high' | 'very-high';
}

export interface CircularDepDto {
  readonly cycleNames: string[];
  readonly length: number;
  readonly severity: 'minor' | 'moderate' | 'severe';
}

export interface HotSpotDto {
  readonly name: string;
  readonly filePath: string;
  readonly complexity: number;
  readonly coupling: number;
  readonly score: number;
  readonly reasons: string[];
}

export interface QualityReportDto {
  readonly maintainabilityScore: number;
  readonly maintainabilityGrade: string;
  readonly avgCyclomaticComplexity: number;
  readonly p90CyclomaticComplexity: number;
  readonly circularDependencyCount: number;
  readonly hotSpots: HotSpotDto[];
  readonly topComplexSymbols: ComplexityItemDto[];
  readonly circularDeps: CircularDepDto[];
  readonly topIssues: string[];
  readonly summary: string;
}

// ─── Documentation Health ─────────────────────────────────────────────────────

export interface DocGapDto {
  readonly kind: string;
  readonly severity: string;
  readonly entityName: string;
  readonly entityType: string;
  readonly filePath: string;
  readonly remediation: string;
}

export interface DocHealthDto {
  readonly coveragePercent: number;
  readonly grade: string;
  readonly totalAudited: number;
  readonly documentedCount: number;
  readonly undocumentedCount: number;
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly gaps: DocGapDto[];
  readonly summary: string;
}

// ─── Graph Diff ───────────────────────────────────────────────────────────────

export interface GraphDiffNodeDto {
  readonly changeType: 'added' | 'removed' | 'modified';
  readonly name: string;
  readonly type: string;
  readonly path?: string;
  readonly changedFields?: string[];
}

export interface GraphDiffDto {
  readonly fromGeneration: number;
  readonly toGeneration: number;
  readonly nodesAdded: number;
  readonly nodesRemoved: number;
  readonly nodesModified: number;
  readonly edgesAdded: number;
  readonly edgesRemoved: number;
  readonly netNodeChange: number;
  readonly churnRate: number;
  readonly changesByType: Record<string, { added: number; removed: number; modified: number }>;
  readonly significantChanges: GraphDiffNodeDto[];
  readonly summary: string;
}

// ─── Prompt Enricher ─────────────────────────────────────────────────────────

export type PromptTask =
  | 'implementation'
  | 'investigation'
  | 'testing'
  | 'review'
  | 'general';

export type PromptRewriteLevel =
  | 'conservative'
  | 'moderate'
  | 'aggressive';

export interface PromptEvidenceDto {
  readonly id: string;
  readonly conceptId: string;
  readonly label: string;
  readonly kind: string;
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly confidence: number;
  readonly reason: string;
  readonly category: string;
}

export interface PromptEnrichmentDto {
  readonly id: string;
  readonly promptId: string;
  readonly originalPrompt: string;
  readonly task: PromptTask;
  readonly rewriteLevel: PromptRewriteLevel;
  readonly tokenBudget: number;
  readonly enrichedPrompt: string;
  readonly estimatedTokens: number;
  readonly equivalentSourceTokens: number;
  readonly reduction: number;
  readonly evidence: PromptEvidenceDto[];
  readonly flowLines: string[];
  readonly scores?: Record<string, number>;
  readonly followUpQuestions: string[];
  readonly evaluation: string;
  readonly createdAt: string;
}

// ─── Copilot Customization ──────────────────────────────────────────────────

export type CopilotArtifactType =
  | 'intelligence-map'
  | 'language-guidance'
  | 'skill'
  | 'agent';

export interface CopilotArtifactDto {
  readonly id: string;
  readonly type: CopilotArtifactType;
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly content: string;
  readonly estimatedTokens: number;
  readonly selected: boolean;
}

export interface CopilotCustomizationPackDto {
  readonly workspaceName: string;
  readonly generationId: string;
  readonly artifacts: CopilotArtifactDto[];
  readonly totalTokens: number;
  readonly createdAt: string;
}

// ─── Webview → Extension Requests ────────────────────────────────────────────

export type WebviewRequest =
  | { type: 'app/ready' }
  | { type: 'navigation/open'; view: ViewName }
  | { type: 'intelligence/refresh' }
  | { type: 'intelligence/cancel' }
  | { type: 'intelligence/metric-details'; category: string }
  | { type: 'graph/overview'; mode: GraphMode; filters?: GraphFilters }
  | { type: 'graph/expand'; nodeId: string; mode: GraphMode }
  | { type: 'graph/query'; mode: QueryMode; text: string }
  | { type: 'graph/suggestions' }
  | { type: 'graph/impact'; nodeId: string }
  | { type: 'graph/diff'; fromGeneration?: number; toGeneration?: number }
  | { type: 'intelligence/quality-metrics' }
  | { type: 'intelligence/doc-health' }
  | { type: 'copilot/generate' }
  | { type: 'copilot/apply'; artifacts: CopilotArtifactDto[] }
  | {
      type: 'prompt/enrich';
      prompt: string;
      task?: PromptTask;
      rewriteLevel?: PromptRewriteLevel;
      tokenBudget?: number;
    }
  | {
      type: 'prompt/iterate';
      promptId: string;
      originalPrompt: string;
      guidance: string;
      task?: PromptTask;
      tokenBudget?: number;
    }
  | { type: 'feature/discover'; feature: FeatureIntent }
  | { type: 'discovery/select'; conceptId: string; selected: boolean }
  | { type: 'discovery/approve' }
  | { type: 'discovery/iterate'; guidance: string }
  | { type: 'discovery/question-answer'; questionId: string; answer: string }
  | { type: 'discovery/question-skip'; questionId: string; skipReason: string }
  | { type: 'stories/generate' }
  | { type: 'stories/cancel' }
  | { type: 'stories/approve'; storyIds: string[] }
  | { type: 'stories/reject'; storyIds: string[] }
  | { type: 'stories/add-manual'; kind: 'user' | 'qa'; title: string; description: string }
  | { type: 'stories/iterate'; followUp: string; scope: 'all' | 'user' | 'qa' }
  | { type: 'semantic/search'; query: string }
  | { type: 'evidence/open'; path: string; line: number };

// ─── Extension → Webview Events ──────────────────────────────────────────────

export type ExtensionEvent =
  | { type: 'app/snapshot'; snapshot: AppSnapshot }
  | { type: 'app/error'; message: string }
  | { type: 'app/notice'; message: string }
  | { type: 'intelligence/metric-details-response'; details: MetricDetailsDto }
  | { type: 'semantic/search-response'; results: SemanticSearchMatchDto[] }
  | { type: 'graph/response'; response: GraphResponseDto }
  | { type: 'graph/query-response'; result: QueryResultDto }
  | { type: 'graph/suggestions-response'; suggestions: Array<{ label: string; value: string; kind: string }> }
  | { type: 'graph/impact-response'; result: ImpactAnalysisResponseDto }
  | { type: 'graph/diff-response'; diff: GraphDiffDto }
  | { type: 'intelligence/quality-metrics-response'; report: QualityReportDto }
  | { type: 'intelligence/doc-health-response'; report: DocHealthDto }
  | { type: 'prompt/response'; enrichment: PromptEnrichmentDto }
  | { type: 'copilot/response'; pack: CopilotCustomizationPackDto }
  | { type: 'copilot/applied'; written: string[]; failed: Array<{ path: string; error: string }> };
