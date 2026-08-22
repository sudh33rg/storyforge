import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraph } from '../../src/intelligence/graph/knowledgeGraph.js';
import { createGraphNode } from '../../src/intelligence/graph/graphNode.js';
import { auditStoriesStaleness } from '../../src/intelligence/stalenessAuditor.js';
import type { UserStory, QaStory } from '../../src/core/workflow/workflowTypes.js';

describe('Generational Staleness Auditor', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();
    graph.incrementGeneration(); // Gen 1
  });

  it('should report no staleness when no referenced files have changed', () => {
    const stories: UserStory[] = [
      {
        id: 'US-101',
        title: 'Schedule Load Test Execution',
        description: 'Allow users to schedule tests',
        asA: 'User',
        iWant: 'Scheduling',
        soThat: 'tests run automatically',
        acceptanceCriteria: [],
        storyPoints: 3,
        affectedComponents: ['src/services/SchedulerService.ts'],
        evidence: [{
          type: 'naming-convention',
          source: 'src/services/SchedulerService.ts',
          description: 'SchedulerService class',
          resolution: 'confirmed',
          confidence: 0.95,
        }],
        status: 'approved',
      },
    ];

    const qaStories: QaStory[] = [
      {
        id: 'QA-201',
        title: 'Validate Load Test Cron Scheduling',
        description: 'QA verification',
        relatedUserStoryId: 'US-101',
        testType: 'functional',
        scenarios: [],
        preconditions: [],
        status: 'approved',
      },
    ];

    const report = auditStoriesStaleness(
      stories,
      qaStories,
      ['src/unrelated/OtherFile.ts'],
      graph,
    );

    expect(report.isStale).toBe(false);
    expect(report.staleCount).toBe(0);
    expect(report.staleItems.length).toBe(0);
  });

  it('should flag user stories and dependent QA stories when affected components change', () => {
    graph.incrementGeneration(); // Gen 2

    const stories: UserStory[] = [
      {
        id: 'US-101',
        title: 'Schedule Load Test Execution',
        description: 'Allow users to schedule tests',
        asA: 'User',
        iWant: 'Scheduling',
        soThat: 'tests run automatically',
        acceptanceCriteria: [],
        storyPoints: 3,
        affectedComponents: ['src/services/SchedulerService.ts'],
        evidence: [{
          type: 'naming-convention',
          source: 'src/services/SchedulerService.ts',
          description: 'SchedulerService class',
          resolution: 'confirmed',
          confidence: 0.95,
        }],
        status: 'approved',
      },
    ];

    const qaStories: QaStory[] = [
      {
        id: 'QA-201',
        title: 'Validate Load Test Cron Scheduling',
        description: 'QA verification',
        relatedUserStoryId: 'US-101',
        testType: 'functional',
        scenarios: [],
        preconditions: [],
        status: 'approved',
      },
    ];

    const report = auditStoriesStaleness(
      stories,
      qaStories,
      ['src/services/SchedulerService.ts'],
      graph,
    );

    expect(report.isStale).toBe(true);
    expect(report.staleCount).toBe(2); // US-101 + QA-201
    expect(report.staleItems[0].storyId).toBe('US-101');
    expect(report.staleItems[1].storyId).toBe('QA-201');
  });
});
