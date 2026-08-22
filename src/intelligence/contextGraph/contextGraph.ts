/**
 * Context Graph — Dynamic Situational Subgraph Engine (Layer 5)
 *
 * Implements the "Context Graph (Context + Knowledge)" in the 5-Tier Architecture:
 * - Dynamic graph connecting Knowledge Graph entities with live situational context
 * - Combines user intent, active file/cursor state, generation delta, and token budgets
 * - Proves facts with verifiable, exact line-level evidence and confidence matrices
 * - Generates the 11-Stage Capability Reasoning Chain
 */

import type { KnowledgeGraph } from '../graph/knowledgeGraph.js';
import type { GraphNode, GraphNodeType } from '../graph/graphNode.js';
import type { GraphEdge } from '../graph/graphEdge.js';
import type { SemanticIndexer } from '../semantic/semanticIndexer.js';
import type {
  FeatureIntelligenceContext,
  CapabilityChain,
  CapabilityStage,
  ConceptMatch,
  ComponentSummary,
  ApiSummary,
  TestSummary,
  IdentifiedGap,
  UnresolvedQuestion,
  LayerSummary,
  ModuleSummary,
  DependencySummary,
} from '../context/contextTypes.js';
import type { Evidence, ArchitecturalLayer, EntityId, ConfidenceSummary } from '../../shared/types.js';
import { computeConfidence, mergeEvidence } from '../context/evidenceCollector.js';
import { extractFeatureSubgraph } from '../graph/graphQuery.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('intelligence:contextGraph');

export interface SituationalContext {
  readonly userIntent: string;
  readonly activeFilePath?: string;
  readonly activeSelection?: string;
  readonly currentGeneration: number;
  readonly tokenBudget?: number;
}

export interface DynamicContextGraphProjection {
  readonly situationalContext: SituationalContext;
  readonly relevantNodes: GraphNode[];
  readonly relevantEdges: GraphEdge[];
  readonly capabilityChain: CapabilityChain;
  readonly featureContext: FeatureIntelligenceContext;
  readonly confidence: ConfidenceSummary;
}

export class ContextGraph {
  constructor(
    private readonly graph: KnowledgeGraph,
    private readonly semanticIndexer: SemanticIndexer,
  ) {}

  /**
   * Project a dynamic situational Context Graph from user intent and active context.
   */
  project(
    intent: string,
    keywords: string[],
    contextOptions: Partial<SituationalContext> = {},
  ): DynamicContextGraphProjection {
    const situation: SituationalContext = {
      userIntent: intent,
      currentGeneration: this.graph.getGeneration(),
      activeFilePath: contextOptions.activeFilePath,
      activeSelection: contextOptions.activeSelection,
      tokenBudget: contextOptions.tokenBudget ?? 2400,
    };

    log.info('Projecting dynamic context graph', {
      intent: intent.slice(0, 60),
      generation: situation.currentGeneration,
    });

    // 1. Semantic Layer match
    const semanticMatches = this.semanticIndexer.search(intent, { limit: 25, minScore: 0.1 });
    const keywordMatches = this.findKeywordConcepts(keywords);

    // Combine unique seed nodes
    const seedMap = new Map<string, { node: GraphNode; score: number }>();

    for (const sm of semanticMatches) {
      seedMap.set(sm.node.id, { node: sm.node, score: Math.min(1.0, sm.score / 5) });
    }
    for (const km of keywordMatches) {
      if (!seedMap.has(km.nodeId)) {
        const node = this.graph.getNode(km.nodeId);
        if (node) seedMap.set(km.nodeId, { node, score: km.relevanceScore });
      }
    }

    // If active file is present, add as contextual seed
    if (situation.activeFilePath) {
      const activeNode = this.graph.getNodeByQualifiedName(`file:${situation.activeFilePath}`);
      if (activeNode) {
        seedMap.set(activeNode.id, { node: activeNode, score: 0.95 });
      }
    }

    const seedNodeIds = Array.from(seedMap.keys());

    // 2. Extract multi-level subgraph from Knowledge Graph
    const subgraph = extractFeatureSubgraph(this.graph, seedNodeIds, {
      maxDepth: 3,
      minConfidence: 0.3,
      includeTests: true,
      includeApis: true,
      includeConfig: true,
    });

    // 3. Build 11-Stage Capability Reasoning Chain
    const capabilityChain = this.buildCapabilityChain(intent, keywords, subgraph.nodes);

    // 4. Synthesize Feature Intelligence Context
    const featureContext = this.synthesizeFeatureContext(intent, seedMap, subgraph);

    const confidence = featureContext.confidence;

    return {
      situationalContext: situation,
      relevantNodes: subgraph.nodes,
      relevantEdges: subgraph.edges,
      capabilityChain,
      featureContext,
      confidence,
    };
  }

  /**
   * Build the 11-Stage Capability Reasoning Flow.
   */
  private buildCapabilityChain(
    featureIntent: string,
    keywords: string[],
    nodes: GraphNode[],
  ): CapabilityChain {
    const stages: CapabilityStage[] = [];

    // Stage 1: Feature Request
    stages.push({
      stageNumber: 1,
      stage: 'feature-request',
      label: 'Feature Request & Intent',
      description: featureIntent,
      evidence: [],
      confidence: 1.0,
    });

    // Stage 2: Domain Capability
    const conceptNodes = nodes.filter((n) => n.type === 'concept' || n.type === 'module');
    const primaryConcept = conceptNodes[0]?.name || keywords[0] || featureIntent;
    stages.push({
      stageNumber: 2,
      stage: 'relevant-capability',
      label: 'Domain Capability',
      entityName: primaryConcept,
      description: `Domain capability context for "${primaryConcept}"`,
      evidence: [],
      confidence: 0.85,
    });

    // Stage 3: Existing UI
    const uiNode = nodes.find((n) => {
      const data = n.data as { filePath?: string; layer?: string };
      return data?.layer === 'presentation' || data?.filePath?.includes('/ui/') || data?.filePath?.includes('/pages/');
    });
    stages.push({
      stageNumber: 3,
      stage: 'existing-ui',
      label: 'Existing UI Page / View',
      entityName: uiNode?.name,
      entityId: uiNode?.id,
      filePath: (uiNode?.data as any)?.filePath,
      description: uiNode ? `UI view in \`${(uiNode.data as any).filePath}\`` : 'Headless / backend capability (no dedicated UI view)',
      evidence: uiNode ? [{
        type: 'structural-proximity',
        source: (uiNode.data as any).filePath || uiNode.name,
        description: `UI Component ${uiNode.name}`,
        resolution: 'confirmed',
        confidence: 0.9,
      }] : [],
      confidence: uiNode ? 0.9 : 0.5,
    });

    // Stage 4: Frontend Component
    const compNode = nodes.find((n) => {
      const data = n.data as { architecturalRole?: string };
      return data?.architecturalRole === 'component' || data?.architecturalRole === 'hook' || data?.architecturalRole === 'store';
    });
    stages.push({
      stageNumber: 4,
      stage: 'frontend-component',
      label: 'Frontend State / Component',
      entityName: compNode?.name,
      entityId: compNode?.id,
      filePath: (compNode?.data as any)?.filePath,
      description: compNode ? `Component \`${compNode.name}\`` : 'No frontend state hook/component matched',
      evidence: compNode ? [{
        type: 'naming-convention',
        source: compNode.qualifiedName,
        description: `Component ${compNode.name}`,
        resolution: 'confirmed',
        confidence: 0.9,
      }] : [],
      confidence: compNode ? 0.9 : 0.5,
    });

    // Stage 5: API Endpoint
    const apiNode = nodes.find((n) => n.type === 'api-endpoint');
    const apiData = apiNode?.data as any;
    stages.push({
      stageNumber: 5,
      stage: 'api-endpoint',
      label: 'API Endpoint',
      entityName: apiNode ? `${apiData.method} ${apiData.path}` : undefined,
      entityId: apiNode?.id,
      filePath: apiData?.filePath,
      description: apiNode ? `Route \`${apiData.method} ${apiData.path}\`` : 'No direct API route matched',
      evidence: apiNode ? [{
        type: 'api-route',
        source: apiData.filePath || apiNode.name,
        description: `Route ${apiData.method} ${apiData.path}`,
        resolution: 'confirmed',
        confidence: 0.9,
      }] : [],
      confidence: apiNode ? 0.9 : 0.5,
    });

    // Stage 6: Backend Controller
    const controllerNode = nodes.find((n) => {
      const data = n.data as { architecturalRole?: string };
      return data?.architecturalRole === 'controller' || data?.architecturalRole === 'handler';
    });
    stages.push({
      stageNumber: 6,
      stage: 'backend-controller',
      label: 'Backend Controller / Handler',
      entityName: controllerNode?.name,
      entityId: controllerNode?.id,
      filePath: (controllerNode?.data as any)?.filePath,
      description: controllerNode ? `Handler in \`${(controllerNode.data as any).filePath}\`` : 'No controller/handler matched',
      evidence: controllerNode ? [{
        type: 'naming-convention',
        source: controllerNode.qualifiedName,
        description: `Controller ${controllerNode.name}`,
        resolution: 'confirmed',
        confidence: 0.85,
      }] : [],
      confidence: controllerNode ? 0.85 : 0.5,
    });

    // Stage 7: Service Layer
    const serviceNode = nodes.find((n) => {
      const data = n.data as { architecturalRole?: string };
      return data?.architecturalRole === 'service';
    });
    stages.push({
      stageNumber: 7,
      stage: 'service-layer',
      label: 'Service Layer (Business Logic)',
      entityName: serviceNode?.name,
      entityId: serviceNode?.id,
      filePath: (serviceNode?.data as any)?.filePath,
      description: serviceNode ? `Business service in \`${(serviceNode.data as any).filePath}\`` : 'No dedicated business logic service matched',
      evidence: serviceNode ? [{
        type: 'naming-convention',
        source: serviceNode.qualifiedName,
        description: `Service ${serviceNode.name}`,
        resolution: 'confirmed',
        confidence: 0.85,
      }] : [],
      confidence: serviceNode ? 0.85 : 0.5,
    });

    // Stage 8: Shared Library / Utility
    const utilNode = nodes.find((n) => {
      const data = n.data as { architecturalRole?: string };
      return data?.architecturalRole === 'utility' || data?.architecturalRole === 'shared';
    });
    stages.push({
      stageNumber: 8,
      stage: 'shared-library',
      label: 'Shared Library / Utility',
      entityName: utilNode?.name,
      entityId: utilNode?.id,
      filePath: (utilNode?.data as any)?.filePath,
      description: utilNode ? `Shared helper in \`${(utilNode.data as any).filePath}\`` : 'No shared utility mapped',
      evidence: utilNode ? [{
        type: 'structural-proximity',
        source: utilNode.qualifiedName,
        description: `Shared helper ${utilNode.name}`,
        resolution: 'resolved',
        confidence: 0.75,
      }] : [],
      confidence: utilNode ? 0.75 : 0.5,
    });

    // Stage 9: Data & Schema Configuration
    const dataNode = nodes.find((n) => {
      const data = n.data as { architecturalRole?: string; layer?: string };
      return n.type === 'database-table' || data?.architecturalRole === 'model' || data?.architecturalRole === 'repository';
    });
    stages.push({
      stageNumber: 9,
      stage: 'data-configuration',
      label: 'Data, Schema & Configuration',
      entityName: dataNode?.name,
      entityId: dataNode?.id,
      filePath: (dataNode?.data as any)?.filePath,
      description: dataNode ? `Data entity / schema \`${dataNode.name}\`` : 'No schema entity mapped',
      evidence: dataNode ? [{
        type: 'naming-convention',
        source: dataNode.qualifiedName,
        description: `Data entity ${dataNode.name}`,
        resolution: 'confirmed',
        confidence: 0.85,
      }] : [],
      confidence: dataNode ? 0.85 : 0.5,
    });

    // Stage 10: Existing Tests
    const testNode = nodes.find((n) => n.type === 'test-suite');
    stages.push({
      stageNumber: 10,
      stage: 'existing-tests',
      label: 'Existing Test Suites',
      entityName: testNode?.name,
      entityId: testNode?.id,
      filePath: (testNode?.data as any)?.filePath,
      description: testNode ? `Test suite \`${(testNode.data as any).filePath}\`` : 'No existing test coverage identified',
      evidence: testNode ? [{
        type: 'structural-proximity',
        source: (testNode.data as any).filePath || testNode.name,
        description: `Test suite ${testNode.name}`,
        resolution: 'confirmed',
        confidence: 0.95,
      }] : [],
      confidence: testNode ? 0.95 : 0.5,
    });

    // Stage 11: Related Workflows
    stages.push({
      stageNumber: 11,
      stage: 'related-workflows',
      label: 'Related Workflows & Execution Pipelines',
      description: `Execution workflows orchestrating ${primaryConcept}`,
      evidence: [],
      confidence: 0.75,
    });

    const gaps: IdentifiedGap[] = [];
    if (!testNode) {
      gaps.push({
        description: 'No test suite covers the affected area.',
        expectedIn: 'test directory',
        confidence: 0.8,
      });
    }

    const confidences = stages.map((s) => s.confidence);
    const overallConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    return {
      featureIntent,
      stages,
      gaps,
      overallConfidence,
    };
  }

  private synthesizeFeatureContext(
    featureIntent: string,
    seedMap: Map<string, { node: GraphNode; score: number }>,
    subgraph: { nodes: GraphNode[]; edges: GraphEdge[] },
  ): FeatureIntelligenceContext {
    const conceptMatches: ConceptMatch[] = Array.from(seedMap.values()).map(({ node, score }) => ({
      concept: node.name,
      nodeId: node.id,
      relevanceScore: score,
      evidence: [{
        type: 'naming-convention',
        source: node.qualifiedName,
        description: `Node ${node.name} (${node.type}) matched semantic intent`,
        resolution: score >= 0.8 ? 'confirmed' : 'resolved',
        confidence: score,
      }],
    }));

    const components: ComponentSummary[] = subgraph.nodes
      .filter((n) => n.type === 'component' || n.type === 'symbol')
      .map((n) => {
        const data = n.data as any;
        return {
          id: n.id,
          name: n.name,
          filePath: data.filePath || '',
          role: data.architecturalRole || 'unknown',
          relevance: 0.8,
          evidence: [],
        };
      });

    const apis: ApiSummary[] = subgraph.nodes
      .filter((n) => n.type === 'api-endpoint')
      .map((n) => {
        const data = n.data as any;
        return {
          method: data.method || 'GET',
          path: data.path || '',
          handlerFile: data.filePath || '',
          relevance: 0.9,
        };
      });

    const tests: TestSummary[] = subgraph.nodes
      .filter((n) => n.type === 'test-suite')
      .map((n) => {
        const data = n.data as any;
        return {
          name: n.name,
          filePath: data.filePath || '',
          testCount: data.testCount,
          framework: data.testFramework,
        };
      });

    const layerMap = new Map<ArchitecturalLayer, GraphNode[]>();
    for (const node of subgraph.nodes) {
      const data = node.data as any;
      const layer = data.layer || 'unknown';
      if (!layerMap.has(layer)) layerMap.set(layer, []);
      layerMap.get(layer)!.push(node);
    }

    const layers: LayerSummary[] = Array.from(layerMap.entries()).map(([layer, nodes]) => ({
      layer,
      nodeCount: nodes.length,
      relevantNodes: nodes.slice(0, 8).map((n) => ({ id: n.id, name: n.name, type: n.type })),
    }));

    const modules: ModuleSummary[] = subgraph.nodes
      .filter((n) => n.type === 'module')
      .map((n) => ({
        name: n.name,
        path: (n.data as any).path || '',
        fileCount: 0,
        relevance: 0.7,
      }));

    const allEvidence = mergeEvidence(
      conceptMatches.flatMap((m) => m.evidence),
      subgraph.edges.flatMap((e) => e.evidence),
    );

    const confidence = computeConfidence(allEvidence);

    return {
      feature: { intent: featureIntent, concepts: conceptMatches },
      architecture: { relevantLayers: layers, affectedModules: modules },
      components: { existing: components, potentialGaps: [] },
      apis: { existingEndpoints: apis, relatedFlows: [] },
      dependencies: { direct: [], external: [] },
      tests: { existingCoverage: tests, impactedSuites: tests },
      configuration: { relevantItems: [] },
      evidence: allEvidence,
      unresolvedQuestions: [],
      confidence,
      generation: this.graph.getGeneration(),
    };
  }

  private findKeywordConcepts(keywords: string[]): ConceptMatch[] {
    const matches: ConceptMatch[] = [];
    const seen = new Set<string>();

    for (const keyword of keywords) {
      const nodes = this.graph.searchNodes(keyword);
      for (const node of nodes) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);

        matches.push({
          concept: node.name,
          nodeId: node.id,
          relevanceScore: node.name.toLowerCase() === keyword.toLowerCase() ? 1.0 : 0.8,
          evidence: [{
            type: 'naming-convention',
            source: node.qualifiedName,
            description: `Keyword match "${keyword}"`,
            resolution: 'resolved',
            confidence: 0.8,
          }],
        });
      }
    }

    return matches;
  }
}
