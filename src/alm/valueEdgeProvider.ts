/**
 * ValueEdge ALM Provider (Mocked)
 *
 * OpenText ValueEdge integration — currently mocked pending API access.
 */

import type { AlmProvider } from './almProvider.js';
import type { UserStory, QaStory, FeatureInput, AlmPushResult } from '../core/workflow/workflowTypes.js';
import type { DiscoveryContext } from '../intelligence/context/contextTypes.js';
import { AlmError } from '../shared/errors.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('alm:valueedge');

export class ValueEdgeProvider implements AlmProvider {
  readonly id = 'valueedge';
  readonly displayName = 'OpenText ValueEdge';

  constructor(
    private readonly config: {
      url: string;
      sharedSpace: string;
      workspace: string;
    },
  ) {}

  async testConnection(): Promise<boolean> {
    log.warn('ValueEdge connection test: mocked (API not yet available)');
    // TODO: Implement actual ValueEdge REST API connection test
    return false;
  }

  async fetchFeature(featureId: string): Promise<FeatureInput> {
    log.warn('ValueEdge fetchFeature: mocked', { featureId });
    // TODO: Implement GET /api/shared_spaces/{shared_space}/workspaces/{workspace}/features/{id}
    throw new AlmError('ValueEdge API not yet integrated', 'valueedge');
  }

  async pushStories(
    stories: UserStory[],
    qaStories: QaStory[],
    discovery?: DiscoveryContext,
  ): Promise<AlmPushResult> {
    log.warn('ValueEdge pushStories: mocked', {
      storyCount: stories.length,
      qaCount: qaStories.length,
    });
    // TODO: Implement POST /api/shared_spaces/{shared_space}/workspaces/{workspace}/user_stories
    throw new AlmError('ValueEdge API not yet integrated', 'valueedge');
  }
}
