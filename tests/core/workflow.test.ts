import { describe, it, expect, beforeEach } from 'vitest';
import { IntelligenceEngine } from '../../src/intelligence/engine.js';
import { WorkflowEngine } from '../../src/core/workflow/workflowEngine.js';
import type { LlmProvider, LlmResponse } from '../../src/core/llm/copilotLlm.js';

describe('WorkflowEngine', () => {
  let intelligence: IntelligenceEngine;
  let workflowEngine: WorkflowEngine;

  beforeEach(() => {
    intelligence = new IntelligenceEngine({
      workspaceRoot: '/test',
      workspaceName: 'test-ws',
      excludePatterns: [],
      maxFileSize: 500000,
      autoScan: false,
    });
    workflowEngine = new WorkflowEngine(intelligence);
  });

  it('should start a feature discovery workflow', async () => {
    const state = await workflowEngine.startDiscovery(
      'Schedule Load Tests',
      'Add recurring scheduling for load test execution',
      ['schedule', 'cron'],
      'chat',
    );

    expect(state.id).toBeDefined();
    expect(state.phase).toBe('discovery-review');
    expect(state.discoveryContext?.approvalStatus).toBe('draft');
    expect(workflowEngine.getActiveWorkflow()?.id).toBe(state.id);
  });

  it('should approve discovery and transition to story-generation', async () => {
    const state = await workflowEngine.startDiscovery(
      'Schedule Load Tests',
      'Add recurring scheduling',
      ['schedule'],
    );

    const approvedState = await workflowEngine.approveDiscovery(state.id);

    expect(approvedState.phase).toBe('story-generation');
    expect(approvedState.discoveryContext?.approvalStatus).toBe('approved');
  });

  it('should generate deterministic user stories and QA stories when LLM is offline', async () => {
    const state = await workflowEngine.startDiscovery(
      'Schedule Load Tests',
      'Add recurring scheduling for tests',
      ['schedule'],
    );
    await workflowEngine.approveDiscovery(state.id);

    const result = await workflowEngine.generateStories(state.id);

    expect(result.stories.length).toBeGreaterThan(0);
    expect(result.stories[0].acceptanceCriteria.length).toBeGreaterThan(0);
    expect(result.qaStories.length).toBeGreaterThan(0);
    expect(result.qaStories[0].scenarios.length).toBeGreaterThan(0);
    expect(result.state.phase).toBe('story-review');
  });

  it('should generate structured stories using custom/mock LLM provider', async () => {
    const mockLlm: LlmProvider = {
      isAvailable: async () => true,
      getModelName: () => 'mock-gpt-4o',
      sendPrompt: async (): Promise<LlmResponse> => ({
        model: 'mock-gpt-4o',
        content: JSON.stringify({
          stories: [
            {
              id: 'US-501',
              title: 'Cron Scheduler Implementation',
              description: 'Implement cron expression parsing',
              asA: 'Developer',
              iWant: 'cron parser',
              soThat: 'schedules run at desired times',
              acceptanceCriteria: [
                { id: 'AC-1', given: 'A valid cron string', when: 'Parsed', then: 'Next run time is calculated' },
              ],
              storyPoints: 5,
              priority: 'high',
              affectedComponents: ['src/services/Scheduler.ts'],
            },
          ],
          qaStories: [
            {
              id: 'QA-601',
              title: 'Validate Cron Calculation',
              description: 'Test edge cases in cron syntax',
              relatedUserStoryId: 'US-501',
              testType: 'functional',
              scenarios: [
                {
                  id: 'SC-1',
                  name: 'Standard Daily Trigger',
                  steps: ['Configure daily 00:00 schedule', 'Trigger runner'],
                  expectedResult: 'Fires once daily',
                  testType: 'positive',
                },
              ],
              preconditions: ['Scheduler service is running'],
              priority: 'high',
            },
          ],
        }),
      }),
    };

    const state = await workflowEngine.startDiscovery(
      'Cron Scheduler',
      'Add cron parsing engine',
      ['cron'],
    );
    await workflowEngine.approveDiscovery(state.id);

    const result = await workflowEngine.generateStories(state.id, mockLlm);

    expect(result.stories.length).toBe(1);
    expect(result.stories[0].id).toBe('US-501');
    expect(result.stories[0].storyPoints).toBe(5);
    expect(result.qaStories.length).toBe(1);
    expect(result.qaStories[0].id).toBe('QA-601');
  });
});
