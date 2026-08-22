/**
 * Context Builder
 *
 * Builds specialized, compact, evidence-backed context packages
 * for each phase of the StoryForge workflow.
 *
 * This is where intelligence becomes actionable:
 * - DON'T give the AI 500 files
 * - DO give it a Feature Intelligence Context with:
 *   relevant architecture, components, APIs, execution flows,
 *   dependencies, tests, configuration, evidence, and confidence
 */

import { createLogger } from '../../shared/logger.js';
import type { KnowledgeGraph } from '../graph/knowledgeGraph.js';
import type { GraphNode } from '../graph/graphNode.js';
import { extractFeatureSubgraph } from '../graph/graphQuery.js';
import type {
  FeatureIntelligenceContext,
  DiscoveryContext,
  StoryIntelligenceContext,
  CapabilityChain,
  CapabilityStage,
  ConceptMatch,
  ComponentSummary,
  ApiSummary,
  TestSummary,
  UnresolvedQuestion,
  IdentifiedGap,
  LayerSummary,
  ModuleSummary,
  DependencySummary,
  AffectedArea,
  BehaviorDescription,
  Risk,
  Assumption,
} from './contextTypes.js';
import { computeConfidence, mergeEvidence } from './evidenceCollector.js';
import type { Evidence, ArchitecturalLayer, EntityId } from '../../shared/types.js';

const log = createLogger('intelligence:context:builder');

/**
 * Build a Feature Intelligence Context for a given feature request.
 *
 * This traverses the knowledge graph, finds all relevant nodes,
 * and packages them into a compact context with evidence and confidence.
 */
export function buildFeatureContext(
  graph: KnowledgeGraph,
  featureIntent: string,
  keywords: string[],
): FeatureIntelligenceContext {
  log.info('Building feature context', { featureIntent, keywords });

  // Step 1: Search for relevant nodes using keywords
  const conceptMatches = findRelevantConcepts(graph, keywords);

  // Step 2: Extract the relevant subgraph
  const seedNodeIds = conceptMatches.map((m) => m.nodeId);
  const subgraph = extractFeatureSubgraph(graph, seedNodeIds, {
    maxDepth: 3,
    minConfidence: 0.3,
    includeTests: true,
    includeApis: true,
    includeConfig: true,
  });

  // Step 3: Categorize nodes by type
  const components = extractComponents(subgraph.nodes);
  const apis = extractApis(subgraph.nodes);
  const tests = extractTests(subgraph.nodes);
  const layers = extractLayers(subgraph.nodes);
  const modules = extractModules(subgraph.nodes);
  const dependencies = extractDependencies(graph, seedNodeIds);

  // Step 4: Identify gaps (absence detection)
  const gaps = identifyGaps(featureIntent, components, apis, tests);

  // Step 5: Identify unresolved questions
  const unresolvedQuestions = identifyUnresolvedQuestions(
    featureIntent,
    conceptMatches,
    components,
    gaps,
  );

  // Step 6: Collect all evidence
  const allEvidence = mergeEvidence(
    conceptMatches.flatMap((m) => m.evidence),
    subgraph.edges.flatMap((e) => e.evidence),
  );

  const confidence = computeConfidence(allEvidence);

  const context: FeatureIntelligenceContext = {
    feature: {
      intent: featureIntent,
      concepts: conceptMatches,
    },
    architecture: {
      relevantLayers: layers,
      affectedModules: modules,
    },
    components: {
      existing: components,
      potentialGaps: gaps,
    },
    apis: {
      existingEndpoints: apis,
      relatedFlows: [],
    },
    dependencies: {
      direct: dependencies.filter((d) => d.type === 'internal'),
      external: dependencies.filter((d) => d.type === 'external'),
    },
    tests: {
      existingCoverage: tests,
      impactedSuites: tests,
    },
    configuration: {
      relevantItems: [],
    },
    evidence: allEvidence,
    unresolvedQuestions,
    confidence,
    generation: graph.getGeneration(),
  };

  log.info('Feature context built', {
    concepts: conceptMatches.length,
    components: components.length,
    apis: apis.length,
    tests: tests.length,
    gaps: gaps.length,
    unresolvedQuestions: unresolvedQuestions.length,
    confidence: confidence.overall,
  });

  return context;
}

/**
 * Build a Discovery Context from Feature Intelligence and User Intent.
 */
export function buildDiscoveryContext(
  graph: KnowledgeGraph,
  featureIntent: string,
  keywords: string[],
  featureContext?: FeatureIntelligenceContext,
): DiscoveryContext {
  const repoUnderstanding = featureContext ?? buildFeatureContext(graph, featureIntent, keywords);

  // 1. Synthesize Affected Areas
  const affectedAreas: AffectedArea[] = [];
  const directComponents = repoUnderstanding.components.existing.filter((c) => c.relevance >= 0.7);
  const indirectComponents = repoUnderstanding.components.existing.filter((c) => c.relevance < 0.7);

  if (directComponents.length > 0) {
    affectedAreas.push({
      name: 'Primary Implementation Area',
      description: 'Components directly involved in the capability requested',
      components: directComponents,
      impactLevel: 'direct',
    });
  }

  if (indirectComponents.length > 0) {
    affectedAreas.push({
      name: 'Secondary / Downstream Area',
      description: 'Components transitively dependent or related to the primary target',
      components: indirectComponents,
      impactLevel: 'indirect',
    });
  }

  // 2. Synthesize Current Behavior vs Proposed Behavior
  const currentBehavior: BehaviorDescription[] = directComponents.map((comp) => ({
    area: comp.name,
    description: `Currently provides ${comp.role} logic in \`${comp.filePath}\`.`,
    evidence: comp.evidence,
  }));

  if (currentBehavior.length === 0) {
    currentBehavior.push({
      area: 'Core Repository',
      description: 'No existing implementation found for this capability.',
    });
  }

  const proposedBehavior: BehaviorDescription[] = [
    {
      area: 'Feature Implementation',
      description: `Implement "${featureIntent}" integrating with existing ${directComponents.map((c) => c.name).join(', ') || 'repository architecture'}.`,
    },
  ];

  // 3. Technical Risks & Assumptions
  const risks: Risk[] = [];
  if (repoUnderstanding.tests.existingCoverage.length === 0) {
    risks.push({
      description: 'No test suite covers the affected area; regression risk is elevated.',
      severity: 'high',
      mitigation: 'Author comprehensive unit and integration tests alongside story implementation.',
    });
  }

  if (repoUnderstanding.apis.existingEndpoints.length > 0) {
    risks.push({
      description: 'Public or internal API endpoints may require backwards-compatible schema adjustments.',
      severity: 'medium',
      mitigation: 'Verify route contracts and add API endpoint integration tests.',
    });
  }

  const assumptions: Assumption[] = [
    {
      description: `Implementation follows existing coding patterns in \`${directComponents[0]?.filePath || 'src/'}\`.`,
      basis: 'Repository architecture analysis',
      needsValidation: false,
    },
  ];

  return {
    featureIntent,
    repositoryUnderstanding: repoUnderstanding,
    affectedAreas,
    currentBehavior,
    proposedBehavior,
    dependencies: [
      ...repoUnderstanding.dependencies.direct,
      ...repoUnderstanding.dependencies.external,
    ],
    risks,
    assumptions,
    openQuestions: repoUnderstanding.unresolvedQuestions,
    evidence: repoUnderstanding.evidence,
    approvalStatus: 'draft',
  };
}

/**
 * Build a Story Intelligence Context for story generation.
 */
export function buildStoryIntelligenceContext(
  graph: KnowledgeGraph,
  discovery: DiscoveryContext,
): StoryIntelligenceContext {
  const componentMap = discovery.repositoryUnderstanding.components.existing;
  const apiMap = discovery.repositoryUnderstanding.apis.existingEndpoints;
  const testMap = discovery.repositoryUnderstanding.tests.existingCoverage;

  // Generate seed prompts / templates for ACs
  const acceptanceCriteriaInputs: string[] = [
    `Verify capability "${discovery.featureIntent}" operates as expected under standard input.`,
    `Verify error handling and validation for invalid payloads or missing arguments.`,
  ];

  if (apiMap.length > 0) {
    acceptanceCriteriaInputs.push(
      `Ensure API routes (${apiMap.map((a) => `${a.method} ${a.path}`).join(', ')}) adhere to schema contracts and return appropriate HTTP status codes.`,
    );
  }

  // Generate QA scenario inputs (positive, negative, boundary, edge-case)
  const qaScenarioInputs: string[] = [
    'Positive path: Standard execution with valid configuration parameters.',
    'Negative path: Request with invalid or unauthenticated credentials/parameters.',
    'Boundary path: Extreme ranges, timeouts, and empty dataset conditions.',
    'Regression check: Existing dependent endpoints and workflows remain functional.',
  ];

  return {
    discovery,
    componentMap,
    apiMap,
    testMap,
    acceptanceCriteriaInputs,
    qaScenarioInputs,
  };
}

/**
 * Build an 11-Stage Capability Reasoning Chain.
 *
 * Traverses from Feature Intent -> Capability -> UI -> Component -> API -> Controller -> Service -> Lib -> Data -> Tests -> Workflows.
 */
export function buildCapabilityChain(
  graph: KnowledgeGraph,
  featureIntent: string,
  keywords: string[],
): CapabilityChain {
  const concepts = findRelevantConcepts(graph, keywords);
  const seedIds = concepts.map((c) => c.nodeId);
  const subgraph = extractFeatureSubgraph(graph, seedIds, { maxDepth: 4 });

  const stages: CapabilityStage[] = [];

  // Stage 1: Feature Request
  stages.push({
    stageNumber: 1,
    stage: 'feature-request',
    label: 'Feature Request',
    description: featureIntent,
    evidence: [],
    confidence: 1.0,
  });

  // Stage 2: Relevant Capability (Concept)
  const primaryConcept = concepts[0];
  stages.push({
    stageNumber: 2,
    stage: 'relevant-capability',
    label: 'Domain Capability',
    entityName: primaryConcept?.concept ?? featureIntent,
    entityId: primaryConcept?.nodeId,
    description: primaryConcept ? `Matched domain concept: ${primaryConcept.concept}` : 'Inferred domain capability',
    evidence: primaryConcept?.evidence ?? [],
    confidence: primaryConcept?.relevanceScore ?? 0.7,
  });

  // Stage 3: Existing UI
  const uiNode = subgraph.nodes.find((n) => {
    const data = n.data as { filePath?: string; layer?: string };
    return data.layer === 'presentation' || data.filePath?.includes('/ui/') || data.filePath?.includes('/pages/');
  });
  if (uiNode) {
    const data = uiNode.data as { filePath?: string };
    stages.push({
      stageNumber: 3,
      stage: 'existing-ui',
      label: 'Existing UI Page/View',
      entityName: uiNode.name,
      entityId: uiNode.id,
      filePath: data.filePath,
      description: `UI Page at ${data.filePath}`,
      evidence: [{
        type: 'structural-proximity',
        source: data.filePath || uiNode.name,
        description: `UI component defined in ${data.filePath}`,
        resolution: 'confirmed',
        confidence: 0.9,
      }],
      confidence: 0.9,
    });
  } else {
    stages.push({
      stageNumber: 3,
      stage: 'existing-ui',
      label: 'Existing UI Page/View',
      description: 'No dedicated UI page identified (backend or headless feature)',
      evidence: [],
      confidence: 0.5,
    });
  }

  // Stage 4: Frontend Component
  const feCompNode = subgraph.nodes.find((n) => {
    const data = n.data as { filePath?: string; architecturalRole?: string };
    return data.architecturalRole === 'component' || data.architecturalRole === 'store' || data.architecturalRole === 'hook';
  });
  if (feCompNode) {
    const data = feCompNode.data as { filePath?: string };
    stages.push({
      stageNumber: 4,
      stage: 'frontend-component',
      label: 'Frontend Component',
      entityName: feCompNode.name,
      entityId: feCompNode.id,
      filePath: data.filePath,
      description: `Component at ${data.filePath}`,
      evidence: [{
        type: 'naming-convention',
        source: feCompNode.qualifiedName,
        description: `Component ${feCompNode.name}`,
        resolution: 'confirmed',
        confidence: 0.9,
      }],
      confidence: 0.9,
    });
  } else {
    stages.push({
      stageNumber: 4,
      stage: 'frontend-component',
      label: 'Frontend Component',
      description: 'No frontend state component matched',
      evidence: [],
      confidence: 0.5,
    });
  }

  // Stage 5: API Endpoint
  const apiNode = subgraph.nodes.find((n) => n.type === 'api-endpoint');
  if (apiNode) {
    const data = apiNode.data as { method?: string; path?: string; filePath?: string };
    stages.push({
      stageNumber: 5,
      stage: 'api-endpoint',
      label: 'API Endpoint',
      entityName: `${data.method || 'GET'} ${data.path || ''}`,
      entityId: apiNode.id,
      filePath: data.filePath,
      description: `Route ${data.method} ${data.path}`,
      evidence: [{
        type: 'api-route',
        source: data.filePath || apiNode.name,
        description: `Route binding ${data.method} ${data.path}`,
        resolution: 'confirmed',
        confidence: 0.9,
      }],
      confidence: 0.9,
    });
  } else {
    stages.push({
      stageNumber: 5,
      stage: 'api-endpoint',
      label: 'API Endpoint',
      description: 'No direct HTTP route identified for this capability',
      evidence: [],
      confidence: 0.5,
    });
  }

  // Stage 6: Backend Controller
  const controllerNode = subgraph.nodes.find((n) => {
    const data = n.data as { architecturalRole?: string };
    return data.architecturalRole === 'controller' || data.architecturalRole === 'handler';
  });
  if (controllerNode) {
    const data = controllerNode.data as { filePath?: string };
    stages.push({
      stageNumber: 6,
      stage: 'backend-controller',
      label: 'Backend Controller / Handler',
      entityName: controllerNode.name,
      entityId: controllerNode.id,
      filePath: data.filePath,
      description: `Controller at ${data.filePath}`,
      evidence: [{
        type: 'naming-convention',
        source: controllerNode.qualifiedName,
        description: `Controller ${controllerNode.name}`,
        resolution: 'confirmed',
        confidence: 0.85,
      }],
      confidence: 0.85,
    });
  } else {
    stages.push({
      stageNumber: 6,
      stage: 'backend-controller',
      label: 'Backend Controller / Handler',
      description: 'No controller / handler matched',
      evidence: [],
      confidence: 0.5,
    });
  }

  // Stage 7: Service Layer
  const serviceNode = subgraph.nodes.find((n) => {
    const data = n.data as { architecturalRole?: string };
    return data.architecturalRole === 'service';
  });
  if (serviceNode) {
    const data = serviceNode.data as { filePath?: string };
    stages.push({
      stageNumber: 7,
      stage: 'service-layer',
      label: 'Service Layer (Business Logic)',
      entityName: serviceNode.name,
      entityId: serviceNode.id,
      filePath: data.filePath,
      description: `Service at ${data.filePath}`,
      evidence: [{
        type: 'naming-convention',
        source: serviceNode.qualifiedName,
        description: `Service ${serviceNode.name}`,
        resolution: 'confirmed',
        confidence: 0.85,
      }],
      confidence: 0.85,
    });
  } else {
    stages.push({
      stageNumber: 7,
      stage: 'service-layer',
      label: 'Service Layer (Business Logic)',
      description: 'No business logic service matched',
      evidence: [],
      confidence: 0.5,
    });
  }

  // Stage 8: Shared Library / Utility
  const utilNode = subgraph.nodes.find((n) => {
    const data = n.data as { architecturalRole?: string };
    return data.architecturalRole === 'utility' || data.architecturalRole === 'shared';
  });
  if (utilNode) {
    const data = utilNode.data as { filePath?: string };
    stages.push({
      stageNumber: 8,
      stage: 'shared-library',
      label: 'Shared Library / Utility',
      entityName: utilNode.name,
      entityId: utilNode.id,
      filePath: data.filePath,
      description: `Utility at ${data.filePath}`,
      evidence: [{
        type: 'structural-proximity',
        source: utilNode.qualifiedName,
        description: `Shared helper ${utilNode.name}`,
        resolution: 'resolved',
        confidence: 0.75,
      }],
      confidence: 0.75,
    });
  } else {
    stages.push({
      stageNumber: 8,
      stage: 'shared-library',
      label: 'Shared Library / Utility',
      description: 'No shared utility dependency mapped',
      evidence: [],
      confidence: 0.5,
    });
  }

  // Stage 9: Data & Configuration
  const dataNode = subgraph.nodes.find((n) => {
    const data = n.data as { architecturalRole?: string; layer?: string };
    return (
      data.architecturalRole === 'model' ||
      data.architecturalRole === 'repository' ||
      data.architecturalRole === 'configuration' ||
      data.layer === 'data-access'
    );
  });
  if (dataNode) {
    const data = dataNode.data as { filePath?: string };
    stages.push({
      stageNumber: 9,
      stage: 'data-configuration',
      label: 'Data & Configuration Layer',
      entityName: dataNode.name,
      entityId: dataNode.id,
      filePath: data.filePath,
      description: `Data entity/config in ${data.filePath}`,
      evidence: [{
        type: 'naming-convention',
        source: dataNode.qualifiedName,
        description: `Data component ${dataNode.name}`,
        resolution: 'confirmed',
        confidence: 0.85,
      }],
      confidence: 0.85,
    });
  } else {
    stages.push({
      stageNumber: 9,
      stage: 'data-configuration',
      label: 'Data & Configuration Layer',
      description: 'No data entity or config file mapped',
      evidence: [],
      confidence: 0.5,
    });
  }

  // Stage 10: Existing Tests
  const testNode = subgraph.nodes.find((n) => n.type === 'test-suite');
  if (testNode) {
    const data = testNode.data as { filePath?: string };
    stages.push({
      stageNumber: 10,
      stage: 'existing-tests',
      label: 'Existing Test Suites',
      entityName: testNode.name,
      entityId: testNode.id,
      filePath: data.filePath,
      description: `Test suite at ${data.filePath}`,
      evidence: [{
        type: 'structural-proximity',
        source: data.filePath || testNode.name,
        description: `Test suite ${testNode.name}`,
        resolution: 'confirmed',
        confidence: 0.95,
      }],
      confidence: 0.95,
    });
  } else {
    stages.push({
      stageNumber: 10,
      stage: 'existing-tests',
      label: 'Existing Test Suites',
      description: 'No test suite covers this capability area',
      evidence: [],
      confidence: 0.5,
    });
  }

  // Stage 11: Related Workflows
  stages.push({
    stageNumber: 11,
    stage: 'related-workflows',
    label: 'Related Workflows & Execution Pipelines',
    description: `Workflows orchestrating ${primaryConcept?.concept || featureIntent}`,
    evidence: [],
    confidence: 0.7,
  });

  const components = extractComponents(subgraph.nodes);
  const apis = extractApis(subgraph.nodes);
  const tests = extractTests(subgraph.nodes);
  const gaps = identifyGaps(featureIntent, components, apis, tests);

  const stageConfidences = stages.map((s) => s.confidence);
  const overallConfidence =
    stageConfidences.reduce((a, b) => a + b, 0) / Math.max(1, stageConfidences.length);

  return {
    featureIntent,
    stages,
    gaps,
    overallConfidence,
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function findRelevantConcepts(
  graph: KnowledgeGraph,
  keywords: string[],
): ConceptMatch[] {
  const matches: ConceptMatch[] = [];
  const seen = new Set<string>();

  for (const keyword of keywords) {
    const nodes = graph.searchNodes(keyword);

    for (const node of nodes) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);

      // Score relevance based on match quality
      const nameMatch = node.name.toLowerCase().includes(keyword.toLowerCase());
      const exactMatch = node.name.toLowerCase() === keyword.toLowerCase();
      const relevanceScore = exactMatch ? 1.0 : nameMatch ? 0.8 : 0.5;

      matches.push({
        concept: node.name,
        nodeId: node.id,
        relevanceScore,
        evidence: [{
          type: 'naming-convention',
          source: node.qualifiedName,
          description: `Node "${node.name}" matches keyword "${keyword}"`,
          resolution: exactMatch ? 'confirmed' : 'heuristic',
          confidence: relevanceScore,
        }],
      });
    }
  }

  // Sort by relevance
  return matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function extractComponents(nodes: GraphNode[]): ComponentSummary[] {
  return nodes
    .filter((n) => n.type === 'component' || n.type === 'symbol')
    .map((n) => {
      const data = n.data as { filePath?: string; architecturalRole?: string };
      return {
        id: n.id,
        name: n.name,
        filePath: data.filePath || '',
        role: (data.architecturalRole as ComponentSummary['role']) || 'unknown',
        relevance: 0.7,
        evidence: [],
      };
    });
}

function extractApis(nodes: GraphNode[]): ApiSummary[] {
  return nodes
    .filter((n) => n.type === 'api-endpoint')
    .map((n) => {
      const data = n.data as { method?: string; path?: string; filePath?: string };
      return {
        method: data.method || 'GET',
        path: data.path || '',
        handlerFile: data.filePath || '',
        relevance: 0.8,
      };
    });
}

function extractTests(nodes: GraphNode[]): TestSummary[] {
  return nodes
    .filter((n) => n.type === 'test-suite')
    .map((n) => {
      const data = n.data as { filePath?: string; testCount?: number; testFramework?: string };
      return {
        name: n.name,
        filePath: data.filePath || '',
        testCount: data.testCount,
        framework: data.testFramework,
      };
    });
}

function extractLayers(nodes: GraphNode[]): LayerSummary[] {
  const layerMap = new Map<ArchitecturalLayer, GraphNode[]>();

  for (const node of nodes) {
    const data = node.data as { layer?: ArchitecturalLayer };
    const layer = data.layer || 'unknown';
    if (!layerMap.has(layer)) layerMap.set(layer, []);
    layerMap.get(layer)!.push(node);
  }

  return Array.from(layerMap.entries()).map(([layer, layerNodes]) => ({
    layer,
    nodeCount: layerNodes.length,
    relevantNodes: layerNodes.slice(0, 10).map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
    })),
  }));
}

function extractModules(nodes: GraphNode[]): ModuleSummary[] {
  return nodes
    .filter((n) => n.type === 'module')
    .map((n) => {
      const data = n.data as { path?: string };
      return {
        name: n.name,
        path: data.path || '',
        fileCount: 0,
        relevance: 0.6,
      };
    });
}

function extractDependencies(
  graph: KnowledgeGraph,
  nodeIds: string[],
): DependencySummary[] {
  const deps: DependencySummary[] = [];
  const seen = new Set<string>();

  for (const nodeId of nodeIds) {
    const nodeDeps = graph.getDependencies(nodeId);
    for (const dep of nodeDeps) {
      if (seen.has(dep.id)) continue;
      seen.add(dep.id);

      deps.push({
        name: dep.name,
        type: dep.type === 'external-dependency' ? 'external' : 'internal',
        path: (dep.data as { path?: string }).path,
        reason: `Dependency of ${graph.getNode(nodeId)?.name ?? nodeId}`,
      });
    }
  }

  return deps;
}

/**
 * Identify gaps — what DOESN'T exist that we might expect.
 * This is the "absence and uncertainty" detection.
 */
function identifyGaps(
  featureIntent: string,
  components: ComponentSummary[],
  apis: ApiSummary[],
  tests: TestSummary[],
): IdentifiedGap[] {
  const gaps: IdentifiedGap[] = [];

  // If we found components but no tests, that's a gap
  if (components.length > 0 && tests.length === 0) {
    gaps.push({
      description: 'No test coverage identified for the matched components.',
      expectedIn: 'test directory alongside the matched components',
      confidence: 0.7,
    });
  }

  // If we found API endpoints but no related service layer
  const hasControllers = components.some((c) => c.role === 'controller');
  const hasServices = components.some((c) => c.role === 'service');
  if (hasControllers && !hasServices) {
    gaps.push({
      description: 'Controller(s) found without corresponding service layer.',
      expectedIn: 'service directory',
      confidence: 0.6,
    });
  }

  // If no components matched at all
  if (components.length === 0 && apis.length === 0) {
    gaps.push({
      description: 'No existing implementation matching this capability was confidently identified.',
      expectedIn: 'repository',
      confidence: 0.9,
    });
  }

  return gaps;
}

/**
 * Identify questions that need user input.
 */
function identifyUnresolvedQuestions(
  featureIntent: string,
  concepts: ConceptMatch[],
  components: ComponentSummary[],
  gaps: IdentifiedGap[],
): UnresolvedQuestion[] {
  const questions: UnresolvedQuestion[] = [];

  // If we found multiple possible matches, ask which one
  const highRelevanceConcepts = concepts.filter((c) => c.relevanceScore >= 0.6);
  if (highRelevanceConcepts.length > 1) {
    questions.push({
      question: `Multiple components appear relevant to "${featureIntent}". Which area should be the primary focus?`,
      context: `Found: ${highRelevanceConcepts.map((c) => c.concept).join(', ')}`,
      importance: 'important',
    });
  }

  // If there are gaps, ask about them
  for (const gap of gaps) {
    if (gap.confidence < 0.8) {
      questions.push({
        question: gap.description,
        context: `Expected in: ${gap.expectedIn}`,
        suggestedResolution: 'Verify with the user whether this is expected or indicates missing implementation.',
        importance: 'important',
      });
    }
  }

  return questions;
}
