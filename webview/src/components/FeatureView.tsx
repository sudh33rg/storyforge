import React, { useState } from 'react';
import type { FeatureIntent } from '../../../src/shared/protocol';
import { vscode } from '../vscode';

export function FeatureView({
  initialFeature,
  loading,
}: {
  initialFeature?: FeatureIntent | null;
  loading: boolean;
}): React.JSX.Element {
  const [title, setTitle] = useState(initialFeature?.title || '');
  const [description, setDescription] = useState(initialFeature?.description || '');
  const [acceptanceContext, setAcceptanceContext] = useState(
    initialFeature?.acceptanceContext?.join('\n') || '',
  );
  const [domainTerms, setDomainTerms] = useState(
    initialFeature?.domainTerms?.join(', ') || '',
  );

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!title.trim()) return;

    const feature: FeatureIntent = {
      title: title.trim(),
      description: description.trim(),
      acceptanceContext: acceptanceContext
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      domainTerms: domainTerms
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      source: 'manual',
    };

    vscode.postMessage({ type: 'feature/discover', feature });
  };

  return (
    <div className="feature-view">
      <div className="workbench-heading">
        <div>
          <span className="eyebrow">Stage 1 · Intent Specification</span>
          <h2>Define Feature Intent</h2>
          <p>
            Describe the capability outcome and constraints. StoryForge will ground
            it in repository intelligence before generating stories.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="context-card">
        <label>
          <span>Feature Title *</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Add Load Test Scheduling to LoadRunner Cloud"
            required
          />
        </label>

        <label>
          <span>Outcome & Constraints Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe what the user should be able to do and any architecture constraints..."
          />
        </label>

        <label>
          <span>Key Acceptance Context (one per line)</span>
          <textarea
            value={acceptanceContext}
            onChange={(e) => setAcceptanceContext(e.target.value)}
            rows={2}
            placeholder="e.g. Schedule tests using standard cron syntax&#10;Persist schedule configuration in database"
          />
        </label>

        <label>
          <span>Domain Terms & Synonyms (comma separated)</span>
          <input
            type="text"
            value={domainTerms}
            onChange={(e) => setDomainTerms(e.target.value)}
            placeholder="e.g. cron, scheduler, periodic, execution, timer"
          />
        </label>

        <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="submit" className="primary" disabled={loading || !title.trim()}>
            {loading ? 'Discovering repository evidence…' : 'Start Feature Discovery →'}
          </button>
        </div>
      </form>
    </div>
  );
}
