import React, { useState } from 'react';
import type {
  AppSnapshot,
  FeatureIntent,
  DiscoverySnapshot,
  StoryGenerationSnapshot,
} from '../../../src/shared/protocol';
import { FeatureView } from './FeatureView';
import { DiscoveryView } from './DiscoveryView';
import { StoriesView } from './StoriesView';

export function WorkbenchView({
  snapshot,
  loading,
}: {
  snapshot: AppSnapshot;
  loading: boolean;
}): React.JSX.Element {
  const [activeStage, setActiveStage] = useState<'feature' | 'discovery' | 'stories'>('feature');

  const discovery = snapshot.discovery;
  const stories = snapshot.storyGeneration;

  // Auto-advance stage if discovery or stories are ready
  const currentStage = activeStage;

  return (
    <div className="workbench-view">
      {/* 3-Step Navigation Rail */}
      <div className="workbench-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={currentStage === 'feature'}
          className={currentStage === 'feature' ? 'selected' : ''}
          onClick={() => setActiveStage('feature')}
        >
          <span>1</span>
          <div>
            <b>Feature Intent</b>
            <small>Outcome & Terms</small>
          </div>
        </button>

        <button
          role="tab"
          aria-selected={currentStage === 'discovery'}
          className={currentStage === 'discovery' ? 'selected' : ''}
          onClick={() => setActiveStage('discovery')}
          disabled={!discovery}
        >
          <span>2</span>
          <div>
            <b>Discovery</b>
            <small>{discovery ? `${discovery.evidence.length} components` : 'Pending'}</small>
          </div>
        </button>

        <button
          role="tab"
          aria-selected={currentStage === 'stories'}
          className={currentStage === 'stories' ? 'selected' : ''}
          onClick={() => setActiveStage('stories')}
          disabled={!stories && !discovery?.approvedAt}
        >
          <span>3</span>
          <div>
            <b>Stories & QA</b>
            <small>{stories ? `${stories.userStories.length + stories.qaStories.length} stories` : 'Pending'}</small>
          </div>
        </button>
      </div>

      {/* Stage Views */}
      <main style={{ marginTop: 16 }}>
        {currentStage === 'feature' && (
          <FeatureView
            initialFeature={discovery?.feature}
            loading={loading}
          />
        )}

        {currentStage === 'discovery' && discovery && (
          <DiscoveryView
            discovery={discovery}
            loading={loading}
          />
        )}

        {currentStage === 'stories' && (
          <StoriesView
            discovery={discovery}
            stories={stories}
            loading={loading}
          />
        )}
      </main>
    </div>
  );
}
