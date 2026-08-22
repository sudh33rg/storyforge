/**
 * Generational Staleness Auditor
 *
 * Audits active user stories and QA stories against repository changes
 * across intelligence generations. Flags stale artifacts whose underlying
 * code evidence or dependencies have changed.
 */

import { createLogger } from '../shared/logger.js';
import type { UserStory, QaStory } from '../core/workflow/workflowTypes.js';
import type { KnowledgeGraph } from './graph/knowledgeGraph.js';

const log = createLogger('intelligence:staleness');

export interface StaleStoryItem {
  readonly storyId: string;
  readonly title: string;
  readonly type: 'user-story' | 'qa-story';
  readonly reason: string;
  readonly affectedFile: string;
  readonly suggestedAction: string;
}

export interface StalenessAuditReport {
  readonly generation: number;
  readonly auditedStoriesCount: number;
  readonly staleCount: number;
  readonly staleItems: StaleStoryItem[];
  readonly isStale: boolean;
  readonly summary: string;
}

/**
 * Audit active user stories and QA stories for staleness against changed files or graph state.
 */
export function auditStoriesStaleness(
  stories: UserStory[] = [],
  qaStories: QaStory[] = [],
  changedFiles: string[] = [],
  graph: KnowledgeGraph,
): StalenessAuditReport {
  const currentGen = graph.getGeneration();
  const staleItems: StaleStoryItem[] = [];
  const normalizedChangedFiles = new Set(changedFiles.map((f) => f.replace(/\\/g, '/')));

  // 1. Audit User Stories
  for (const story of stories) {
    let storyIsStale = false;

    // Check affected components
    for (const compPath of story.affectedComponents) {
      const normPath = compPath.replace(/\\/g, '/');
      const matchesChangedFile = Array.from(normalizedChangedFiles).some(
        (cf) => cf.endsWith(normPath) || normPath.endsWith(cf),
      );

      if (matchesChangedFile) {
        staleItems.push({
          storyId: story.id,
          title: story.title,
          type: 'user-story',
          reason: `Referenced component/file "${compPath}" was modified in generation ${currentGen}.`,
          affectedFile: compPath,
          suggestedAction: 'Review acceptance criteria against updated component implementation.',
        });
        storyIsStale = true;
        break;
      }
    }

    // Check evidence lines if not already flagged
    if (!storyIsStale) {
      for (const ev of story.evidence) {
        const sourcePath = typeof ev.source === 'string' ? ev.source : ev.source?.filePath;
        if (sourcePath) {
          const normSource = sourcePath.replace(/\\/g, '/');
          const matchesChangedFile = Array.from(normalizedChangedFiles).some(
            (cf) => cf.endsWith(normSource) || normSource.endsWith(cf),
          );

          if (matchesChangedFile) {
            staleItems.push({
              storyId: story.id,
              title: story.title,
              type: 'user-story',
              reason: `Evidence source "${sourcePath}" changed in generation ${currentGen}.`,
              affectedFile: sourcePath,
              suggestedAction: 'Re-verify story evidence and acceptance criteria.',
            });
            break;
          }
        }
      }
    }
  }

  // 2. Audit QA Stories
  for (const qa of qaStories) {
    // If related user story is stale, QA story is also marked
    const relatedStoryStale = staleItems.find((s) => s.storyId === qa.relatedUserStoryId);
    if (relatedStoryStale) {
      staleItems.push({
        storyId: qa.id,
        title: qa.title,
        type: 'qa-story',
        reason: `Parent user story (${qa.relatedUserStoryId}) was flagged stale due to changes in "${relatedStoryStale.affectedFile}".`,
        affectedFile: relatedStoryStale.affectedFile,
        suggestedAction: 'Update QA test scenarios to reflect latest story acceptance criteria.',
      });
    }
  }

  const totalAudited = stories.length + qaStories.length;
  const staleCount = staleItems.length;
  const isStale = staleCount > 0;

  const summary = isStale
    ? `⚠️ Staleness Audit: ${staleCount} of ${totalAudited} artifact(s) flagged stale at Gen ${currentGen}.`
    : `✅ Staleness Audit: All ${totalAudited} artifact(s) synchronized with Gen ${currentGen}.`;

  log.info('Staleness audit completed', {
    generation: currentGen,
    totalAudited,
    staleCount,
    isStale,
  });

  return {
    generation: currentGen,
    auditedStoriesCount: totalAudited,
    staleCount,
    staleItems,
    isStale,
    summary,
  };
}
