/**
 * StoryForge Workflow Engine
 *
 * Coordinates the full feature lifecycle:
 * Feature Input → Discovery Context → User Approval → User Stories & QA Stories
 *
 * Implements the intelligence-first reasoning loop and generational staleness checking.
 */

import { createLogger } from '../../shared/logger.js';
import type { IntelligenceEngine } from '../../intelligence/engine.js';
import type {
  WorkflowState,
  WorkflowPhase,
  FeatureInput,
  UserStory,
  QaStory,
  AcceptanceCriterion,
  QaScenario,
} from './workflowTypes.js';
import type { DiscoveryContext, StoryIntelligenceContext } from '../../intelligence/context/contextTypes.js';
import { auditStoriesStaleness, type StalenessAuditReport } from '../../intelligence/stalenessAuditor.js';
import type { LlmProvider } from '../llm/copilotLlm.js';
import { parseAndRepairJson } from '../../shared/jsonRepair.js';

const log = createLogger('core:workflow:engine');

export class WorkflowEngine {
  private readonly workflows = new Map<string, WorkflowState>();
  private activeWorkflowId?: string;

  constructor(
    private readonly intelligence: IntelligenceEngine,
    private readonly llmProvider?: LlmProvider,
  ) {}

  /**
   * Start a new feature discovery workflow.
   */
  async startDiscovery(
    title: string,
    description: string,
    keywords: string[],
    source: 'chat' | 'webview' | 'alm' = 'chat',
  ): Promise<WorkflowState> {
    const id = `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();

    const featureInput: FeatureInput = {
      title,
      description,
      keywords,
      source,
    };

    log.info('Starting feature discovery workflow', { id, title, keywords });

    // Build Discovery Context using Intelligence Engine
    const discoveryContext = this.intelligence.buildDiscoveryContext(
      `${title}: ${description}`,
      keywords,
    );

    const state: WorkflowState = {
      id,
      phase: 'discovery-review',
      featureInput,
      featureContext: discoveryContext.repositoryUnderstanding,
      discoveryContext,
      conversationHistory: [
        {
          role: 'user',
          content: `Feature Request: ${title}\nDescription: ${description}`,
          timestamp: now,
          phase: 'feature-input',
        },
        {
          role: 'storyforge',
          content: `Discovery context built at Generation ${discoveryContext.repositoryUnderstanding.generation}.`,
          timestamp: now,
          phase: 'discovery-review',
          evidence: discoveryContext.evidence,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    this.workflows.set(id, state);
    this.activeWorkflowId = id;

    return state;
  }

  /**
   * Approve the feature discovery context for story generation.
   */
  async approveDiscovery(workflowId: string): Promise<WorkflowState> {
    const state = this.workflows.get(workflowId);
    if (!state || !state.discoveryContext) {
      throw new Error(`Workflow ${workflowId} not found or has no discovery context.`);
    }

    const updatedDiscovery: DiscoveryContext = {
      ...state.discoveryContext,
      approvalStatus: 'approved',
    };

    const updatedState: WorkflowState = {
      ...state,
      phase: 'story-generation',
      discoveryContext: updatedDiscovery,
      updatedAt: Date.now(),
    };

    this.workflows.set(workflowId, updatedState);
    log.info('Discovery approved for workflow', { workflowId });
    return updatedState;
  }

  /**
   * Generate User Stories and QA Stories from approved discovery context.
   */
  async generateStories(
    workflowId: string,
    overrideLlm?: LlmProvider,
  ): Promise<{ stories: UserStory[]; qaStories: QaStory[]; state: WorkflowState }> {
    const state = this.workflows.get(workflowId);
    if (!state || !state.discoveryContext) {
      throw new Error(`Workflow ${workflowId} not found or missing discovery context.`);
    }

    const discovery = state.discoveryContext;
    const storyContext = this.intelligence.buildStoryIntelligenceContext(discovery);
    const llm = overrideLlm ?? this.llmProvider;

    let generatedStories: UserStory[] = [];
    let generatedQaStories: QaStory[] = [];

    const isLlmAvailable = llm ? await llm.isAvailable().catch(() => false) : false;

    if (isLlmAvailable && llm) {
      try {
        log.info('Generating stories with Copilot LLM', { workflowId });
        const { stories, qaStories } = await this.generateWithLlm(llm, storyContext);
        generatedStories = stories;
        generatedQaStories = qaStories;
      } catch (err) {
        log.warn('LLM generation encountered error, falling back to deterministic template generator', { error: String(err) });
        const fallback = this.generateDeterministicStories(storyContext);
        generatedStories = fallback.stories;
        generatedQaStories = fallback.qaStories;
      }
    } else {
      log.info('Copilot LLM unavailable, generating grounded deterministic stories', { workflowId });
      const fallback = this.generateDeterministicStories(storyContext);
      generatedStories = fallback.stories;
      generatedQaStories = fallback.qaStories;
    }

    const updatedState: WorkflowState = {
      ...state,
      phase: 'story-review',
      storyContext,
      stories: generatedStories,
      qaStories: generatedQaStories,
      updatedAt: Date.now(),
    };

    this.workflows.set(workflowId, updatedState);
    return { stories: generatedStories, qaStories: generatedQaStories, state: updatedState };
  }

  /**
   * Refine and iterate feature discovery context with user guidance.
   */
  async iterateDiscovery(workflowId: string, guidance: string): Promise<WorkflowState> {
    const state = this.workflows.get(workflowId);
    if (!state || !state.discoveryContext || !state.featureInput) {
      throw new Error(`Workflow ${workflowId} not found or missing discovery context.`);
    }

    log.info('Iterating feature discovery', { workflowId, guidance });

    const currentDiscovery = state.discoveryContext;
    const additionalKeywords = guidance.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const combinedKeywords = [...new Set([...state.featureInput.keywords, ...additionalKeywords])];

    // Rebuild discovery context with added guidance
    const refined = this.intelligence.buildDiscoveryContext(
      `${state.featureInput.title}: ${state.featureInput.description}\nGuidance: ${guidance}`,
      combinedKeywords,
    );

    const now = Date.now();
    const updatedState: WorkflowState = {
      ...state,
      discoveryContext: refined,
      conversationHistory: [
        ...state.conversationHistory,
        { role: 'user', content: `Refine Discovery: ${guidance}`, timestamp: now, phase: 'discovery-review' },
        { role: 'storyforge', content: `Discovery refined with guidance. Generation ${refined.repositoryUnderstanding.generation}.`, timestamp: now, phase: 'discovery-review', evidence: refined.evidence },
      ],
      updatedAt: now,
    };

    this.workflows.set(workflowId, updatedState);
    return updatedState;
  }

  /**
   * Answer an unresolved question in the discovery context.
   */
  answerQuestion(workflowId: string, questionId: string, answer: string): WorkflowState {
    const state = this.workflows.get(workflowId);
    if (!state || !state.discoveryContext) {
      throw new Error(`Workflow ${workflowId} not found.`);
    }

    const discovery = state.discoveryContext;
    const questions = discovery.repositoryUnderstanding.unresolvedQuestions.map((q) => {
      if (q.question.includes(questionId) || q.context.includes(questionId)) {
        return { ...q, context: `${q.context} (Answered: ${answer})` };
      }
      return q;
    });

    const updatedState: WorkflowState = {
      ...state,
      discoveryContext: {
        ...discovery,
        repositoryUnderstanding: {
          ...discovery.repositoryUnderstanding,
          unresolvedQuestions: questions,
        },
      },
      updatedAt: Date.now(),
    };

    this.workflows.set(workflowId, updatedState);
    return updatedState;
  }

  /**
   * Add a manual user story or QA story to the workflow.
   */
  addManualStory(
    workflowId: string,
    kind: 'user' | 'qa',
    title: string,
    description: string,
  ): WorkflowState {
    const state = this.workflows.get(workflowId);
    if (!state) throw new Error(`Workflow ${workflowId} not found.`);

    if (kind === 'user') {
      const newStory: UserStory = {
        id: `US-${Date.now().toString(36).slice(-4).toUpperCase()}`,
        title,
        description,
        asA: 'User',
        iWant: title,
        soThat: description,
        acceptanceCriteria: [
          {
            id: 'AC-1',
            given: 'The system is in a normal state',
            when: `The user executes ${title}`,
            then: 'The expected outcome is achieved successfully',
          },
        ],
        storyPoints: 3,
        priority: 'medium',
        affectedComponents: [],
        evidence: [],
        status: 'approved',
      };

      const updatedStories = [...(state.stories || []), newStory];
      const updatedState = { ...state, stories: updatedStories, updatedAt: Date.now() };
      this.workflows.set(workflowId, updatedState);
      return updatedState;
    } else {
      const newQaStory: QaStory = {
        id: `QA-${Date.now().toString(36).slice(-4).toUpperCase()}`,
        title,
        description,
        relatedUserStoryId: state.stories?.[0]?.id || 'US-101',
        testType: 'functional',
        scenarios: [
          {
            id: 'SC-1',
            name: `Validate ${title}`,
            steps: ['Initialize test fixture', `Execute ${title}`, 'Verify results'],
            expectedResult: 'Operation succeeds without error.',
            testType: 'positive',
          },
        ],
        preconditions: ['Environment configured'],
        priority: 'medium',
        status: 'approved',
      };

      const updatedQaStories = [...(state.qaStories || []), newQaStory];
      const updatedState = { ...state, qaStories: updatedQaStories, updatedAt: Date.now() };
      this.workflows.set(workflowId, updatedState);
      return updatedState;
    }
  }

  /**
   * Update status of stories (approve or reject).
   */
  updateStoryStatus(
    workflowId: string,
    storyIds: string[],
    status: 'approved' | 'rejected',
  ): WorkflowState {
    const state = this.workflows.get(workflowId);
    if (!state) throw new Error(`Workflow ${workflowId} not found.`);

    const idSet = new Set(storyIds);
    const updatedStories = (state.stories || []).map((s) => (idSet.has(s.id) ? { ...s, status } : s));
    const updatedQaStories = (state.qaStories || []).map((q) => (idSet.has(q.id) ? { ...q, status } : q));

    const updatedState: WorkflowState = {
      ...state,
      stories: updatedStories,
      qaStories: updatedQaStories,
      updatedAt: Date.now(),
    };

    this.workflows.set(workflowId, updatedState);
    return updatedState;
  }

  /**
   * Audit all active stories in workflows for staleness against modified files.
   */
  auditWorkflows(changedFiles: string[]): StalenessAuditReport {
    const allStories: UserStory[] = [];
    const allQaStories: QaStory[] = [];

    for (const wf of this.workflows.values()) {
      if (wf.stories) allStories.push(...wf.stories);
      if (wf.qaStories) allQaStories.push(...wf.qaStories);
    }

    return auditStoriesStaleness(
      allStories,
      allQaStories,
      changedFiles,
      this.intelligence.getGraph(),
    );
  }

  /**
   * Get active workflow state.
   */
  getActiveWorkflow(): WorkflowState | undefined {
    return this.activeWorkflowId ? this.workflows.get(this.activeWorkflowId) : undefined;
  }

  /**
   * Get workflow by ID.
   */
  getWorkflow(id: string): WorkflowState | undefined {
    return this.workflows.get(id);
  }

  /**
   * Get all tracked workflows.
   */
  getAllWorkflows(): WorkflowState[] {
    return Array.from(this.workflows.values());
  }

  // ─── Private Generation Helpers ──────────────────────────────────────────

  private async generateWithLlm(
    llm: LlmProvider,
    storyContext: StoryIntelligenceContext,
  ): Promise<{ stories: UserStory[]; qaStories: QaStory[] }> {
    const discovery = storyContext.discovery;
    const systemPrompt = `You are StoryForge Intelligence, an expert software specification and QA architect.
You turn verified repository intelligence into clear User Stories (with Gherkin Acceptance Criteria) and QA Stories.
Always ground stories in the provided components, routes, and evidence.
Output MUST be valid JSON adhering to the following schema:
{
  "stories": [
    {
      "id": "US-101",
      "title": "Short title",
      "description": "Story overview",
      "asA": "user role",
      "iWant": "feature capability",
      "soThat": "business value",
      "acceptanceCriteria": [
        { "id": "AC-1", "given": "...", "when": "...", "then": "..." }
      ],
      "storyPoints": 3,
      "priority": "high",
      "technicalNotes": "technical details",
      "affectedComponents": ["path/to/component.ts"],
      "status": "approved"
    }
  ],
  "qaStories": [
    {
      "id": "QA-201",
      "title": "QA title",
      "description": "Test objective",
      "relatedUserStoryId": "US-101",
      "testType": "functional",
      "scenarios": [
        {
          "id": "SC-1",
          "name": "Scenario name",
          "steps": ["Step 1", "Step 2"],
          "expectedResult": "Expected outcome",
          "testType": "positive"
        }
      ],
      "preconditions": ["Prerequisite 1"],
      "priority": "high",
      "status": "approved"
    }
  ]
}`;

    const userPrompt = `Feature: "${discovery.featureIntent}"
Direct Components: ${discovery.affectedAreas.flatMap((a) => a.components.map((c) => `${c.name} (${c.filePath})`)).join(', ')}
API Routes: ${storyContext.apiMap.map((a) => `${a.method} ${a.path} (${a.handlerFile})`).join(', ')}
Existing Tests: ${storyContext.testMap.map((t) => t.filePath).join(', ')}
Identified Gaps: ${discovery.repositoryUnderstanding.components.potentialGaps.map((g) => g.description).join(', ')}
Generate 1-3 User Stories and corresponding QA Stories.`;

    const response = await llm.sendPrompt(systemPrompt, userPrompt);
    const parsed = parseAndRepairJson<{ stories?: any[]; qaStories?: any[] }>(response.content);

    const stories: UserStory[] = (parsed.stories || []).map((s: any, idx: number) => ({
      id: s.id || `US-${101 + idx}`,
      title: s.title || `Implement ${discovery.featureIntent}`,
      description: s.description || '',
      asA: s.asA || 'Developer',
      iWant: s.iWant || discovery.featureIntent,
      soThat: s.soThat || 'the capability is available',
      acceptanceCriteria: s.acceptanceCriteria || [],
      storyPoints: typeof s.storyPoints === 'number' ? s.storyPoints : 3,
      priority: s.priority || 'high',
      technicalNotes: s.technicalNotes,
      affectedComponents: s.affectedComponents || storyContext.componentMap.map((c) => c.filePath),
      evidence: discovery.evidence,
      status: 'approved',
    }));

    const qaStories: QaStory[] = (parsed.qaStories || []).map((q: any, idx: number) => ({
      id: q.id || `QA-${201 + idx}`,
      title: q.title || `Validate ${discovery.featureIntent}`,
      description: q.description || '',
      relatedUserStoryId: q.relatedUserStoryId || stories[0]?.id || 'US-101',
      testType: q.testType || 'functional',
      scenarios: q.scenarios || [],
      preconditions: q.preconditions || [],
      priority: q.priority || 'high',
      status: 'approved',
    }));

    return { stories, qaStories };
  }

  private generateDeterministicStories(
    storyContext: StoryIntelligenceContext,
  ): { stories: UserStory[]; qaStories: QaStory[] } {
    const discovery = storyContext.discovery;
    const title = discovery.featureIntent;
    const components = storyContext.componentMap;
    const apis = storyContext.apiMap;
    const affectedPaths = components.map((c) => c.filePath);

    // 1. User Story
    const acs: AcceptanceCriterion[] = [
      {
        id: 'AC-1',
        given: 'A valid execution environment and configuration parameters',
        when: `The user triggers or accesses "${title}"`,
        then: 'The requested capability completes successfully with expected output',
      },
      {
        id: 'AC-2',
        given: 'Invalid input parameters or missing authorization',
        when: `The feature "${title}" is requested`,
        then: 'A deterministic error code and actionable validation message are returned',
      },
    ];

    if (apis.length > 0) {
      acs.push({
        id: 'AC-3',
        given: `API route ${apis[0].method} ${apis[0].path}`,
        when: 'A request payload is transmitted',
        then: 'The handler validates the schema and persists changes accordingly',
      });
    }

    const userStory: UserStory = {
      id: 'US-101',
      title: `Implement ${title}`,
      description: `Grounds the implementation of ${title} across repository components.`,
      asA: 'Product User / API Consumer',
      iWant: title,
      soThat: 'the system provides the requested capability seamlessly',
      acceptanceCriteria: acs,
      storyPoints: Math.max(3, components.length * 2),
      priority: 'high',
      technicalNotes: `Affects components: ${components.map((c) => c.name).join(', ') || 'root'}.`,
      affectedComponents: affectedPaths.length > 0 ? affectedPaths : ['src/'],
      evidence: discovery.evidence,
      status: 'approved',
    };

    // 2. QA Story
    const scenarios: QaScenario[] = [
      {
        id: 'SC-1',
        name: 'Positive: Valid End-to-End Execution',
        steps: [
          'Initialize capability with standard valid configuration',
          'Execute the primary workflow',
          'Inspect output and database/state mutations',
        ],
        expectedResult: 'Operation succeeds without error and matches expected data contracts.',
        testType: 'positive',
      },
      {
        id: 'SC-2',
        name: 'Negative: Invalid Parameters & Boundary Check',
        steps: [
          'Pass malformed or empty payloads',
          'Verify error handling logic',
        ],
        expectedResult: 'System returns appropriate error and preserves data integrity.',
        testType: 'negative',
      },
      {
        id: 'SC-3',
        name: 'Regression: Existing Downstream Handlers',
        steps: [
          'Run full test suite against dependent modules',
          'Verify no regression in existing workflows',
        ],
        expectedResult: 'All existing test suites pass.',
        testType: 'boundary',
      },
    ];

    const qaStory: QaStory = {
      id: 'QA-201',
      title: `Validate ${title}`,
      description: `Comprehensive functional and boundary test scenarios for US-101 (${title}).`,
      relatedUserStoryId: 'US-101',
      testType: 'functional',
      scenarios,
      preconditions: ['Repository workspace is built', 'Test runner is configured'],
      priority: 'high',
      status: 'approved',
    };

    return {
      stories: [userStory],
      qaStories: [qaStory],
    };
  }
}
