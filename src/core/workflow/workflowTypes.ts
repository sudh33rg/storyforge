/**
 * Workflow Types
 *
 * State definitions for the Feature → Discovery → Stories → QA → ALM pipeline.
 */

import type { FeatureIntelligenceContext, DiscoveryContext, StoryIntelligenceContext } from '../../intelligence/context/contextTypes.js';
import type { Evidence } from '../../shared/types.js';

// ─── Workflow State Machine ──────────────────────────────────────────────────

export type WorkflowPhase =
  | 'feature-input'
  | 'discovery'
  | 'discovery-review'
  | 'story-generation'
  | 'story-review'
  | 'qa-generation'
  | 'qa-review'
  | 'alm-push'
  | 'completed'
  | 'cancelled';

export interface WorkflowState {
  readonly id: string;
  readonly phase: WorkflowPhase;
  readonly featureInput?: FeatureInput;
  readonly featureContext?: FeatureIntelligenceContext;
  readonly discoveryContext?: DiscoveryContext;
  readonly storyContext?: StoryIntelligenceContext;
  readonly stories?: UserStory[];
  readonly qaStories?: QaStory[];
  readonly almResult?: AlmPushResult;
  readonly conversationHistory: ConversationEntry[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ─── Feature Input ───────────────────────────────────────────────────────────

export interface FeatureInput {
  readonly title: string;
  readonly description: string;
  readonly keywords: string[];
  readonly priority?: 'critical' | 'high' | 'medium' | 'low';
  readonly labels?: string[];
  readonly source?: 'chat' | 'webview' | 'alm';
  readonly almReference?: string;
}

// ─── Conversation ────────────────────────────────────────────────────────────

export interface ConversationEntry {
  readonly role: 'user' | 'storyforge' | 'system';
  readonly content: string;
  readonly timestamp: number;
  readonly phase: WorkflowPhase;
  readonly evidence?: Evidence[];
}

// ─── User Stories ────────────────────────────────────────────────────────────

export interface UserStory {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly asA: string;
  readonly iWant: string;
  readonly soThat: string;
  readonly acceptanceCriteria: AcceptanceCriterion[];
  readonly storyPoints?: number;
  readonly priority?: 'critical' | 'high' | 'medium' | 'low';
  readonly labels?: string[];
  readonly technicalNotes?: string;
  readonly affectedComponents: string[];
  readonly evidence: Evidence[];
  readonly status: 'draft' | 'approved' | 'modified' | 'rejected';
}

export interface AcceptanceCriterion {
  readonly id: string;
  readonly given: string;
  readonly when: string;
  readonly then: string;
}

// ─── QA Stories ──────────────────────────────────────────────────────────────

export interface QaStory {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly relatedUserStoryId: string;
  readonly testType: 'functional' | 'regression' | 'integration' | 'performance' | 'security' | 'edge-case';
  readonly scenarios: QaScenario[];
  readonly preconditions: string[];
  readonly testData?: string;
  readonly priority?: 'critical' | 'high' | 'medium' | 'low';
  readonly status: 'draft' | 'approved' | 'modified' | 'rejected';
}

export interface QaScenario {
  readonly id: string;
  readonly name: string;
  readonly steps: string[];
  readonly expectedResult: string;
  readonly testType: 'positive' | 'negative' | 'boundary' | 'edge-case';
}

// ─── ALM Integration ─────────────────────────────────────────────────────────

export interface AlmPushResult {
  readonly provider: string;
  readonly success: boolean;
  readonly pushedStories: Array<{
    readonly localId: string;
    readonly remoteId: string;
    readonly url?: string;
  }>;
  readonly errors: string[];
  readonly timestamp: number;
}

// ─── Workflow Transitions ────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<WorkflowPhase, WorkflowPhase[]> = {
  'feature-input': ['discovery'],
  'discovery': ['discovery-review'],
  'discovery-review': ['discovery', 'story-generation', 'cancelled'],
  'story-generation': ['story-review'],
  'story-review': ['story-generation', 'qa-generation', 'cancelled'],
  'qa-generation': ['qa-review'],
  'qa-review': ['qa-generation', 'alm-push', 'completed', 'cancelled'],
  'alm-push': ['completed'],
  'completed': [],
  'cancelled': [],
};

/**
 * Check if a workflow transition is valid.
 */
export function isValidTransition(from: WorkflowPhase, to: WorkflowPhase): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
