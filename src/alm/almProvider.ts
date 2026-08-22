/**
 * ALM Provider Interface
 *
 * Vendor-agnostic interface for Application Lifecycle Management integration.
 * Supports ValueEdge, GitHub Issues/Projects, and Jira Cloud.
 */

import type { UserStory, QaStory, FeatureInput, AlmPushResult } from '../core/workflow/workflowTypes.js';
import type { DiscoveryContext } from '../intelligence/context/contextTypes.js';

/**
 * Vendor-agnostic ALM provider interface.
 */
export interface AlmProvider {
  /** Unique provider identifier */
  readonly id: string;

  /** Human-readable display name */
  readonly displayName: string;

  /**
   * Test the connection to the ALM system.
   */
  testConnection(): Promise<boolean>;

  /**
   * Fetch a feature/requirement from the ALM system.
   */
  fetchFeature(featureId: string): Promise<FeatureInput>;

  /**
   * Push approved stories to the ALM system.
   */
  pushStories(
    stories: UserStory[],
    qaStories: QaStory[],
    discovery?: DiscoveryContext,
  ): Promise<AlmPushResult>;
}

/**
 * Registry for ALM providers.
 */
export class AlmProviderRegistry {
  private readonly providers = new Map<string, AlmProvider>();

  register(provider: AlmProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AlmProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): AlmProvider[] {
    return Array.from(this.providers.values());
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }
}
