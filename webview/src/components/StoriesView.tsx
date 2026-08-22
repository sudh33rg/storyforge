import React, { useState } from 'react';
import type { DiscoverySnapshot, StoryGenerationSnapshot, UserStorySnapshot, QaStorySnapshot } from '../../../src/shared/protocol';
import { vscode } from '../vscode';
import { TraceabilityView } from './TraceabilityView';

export function StoriesView({
  discovery,
  stories,
  loading,
}: {
  discovery: DiscoverySnapshot | null;
  stories: StoryGenerationSnapshot | null;
  loading: boolean;
}): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'user' | 'qa' | 'traceability'>('user');
  const [iterationInput, setIterationInput] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualKind, setManualKind] = useState<'user' | 'qa'>('user');
  const [showManualForm, setShowManualForm] = useState(false);

  const handleIterate = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!iterationInput.trim()) return;
    vscode.postMessage({
      type: 'stories/iterate',
      followUp: iterationInput.trim(),
      scope: activeTab === 'qa' ? 'qa' : activeTab === 'user' ? 'user' : 'all',
    });
    setIterationInput('');
  };

  const handleAddManual = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    vscode.postMessage({
      type: 'stories/add-manual',
      kind: manualKind,
      title: manualTitle.trim(),
      description: manualDesc.trim(),
    });
    setManualTitle('');
    setManualDesc('');
    setShowManualForm(false);
  };

  if (!stories || (stories.userStories.length === 0 && stories.qaStories.length === 0)) {
    return (
      <div className="empty-state">
        <h3>No stories generated yet</h3>
        <p>Approve Discovery in Stage 2 or click Generate Stories to create grounded specifications.</p>
        <button
          className="primary"
          disabled={loading || !discovery}
          onClick={() => vscode.postMessage({ type: 'stories/generate' })}
        >
          {loading ? 'Generating stories…' : 'Generate Stories from Discovery'}
        </button>
      </div>
    );
  }

  return (
    <div className="stories-view">
      <div className="workbench-heading">
        <div>
          <span className="eyebrow">Stage 3 · Story Engineering</span>
          <h2>Implementation Stories & Quality Assurance</h2>
          <p>
            Grounded in approved repository context for <strong>"{discovery?.feature.title}"</strong>.
          </p>
        </div>
        <div className="actions">
          <button
            className="primary"
            onClick={() =>
              vscode.postMessage({
                type: 'stories/approve',
                storyIds: [...stories.userStories.map((s) => s.id), ...stories.qaStories.map((q) => q.id)],
              })
            }
          >
            ✓ Accept All Stories
          </button>
          <button onClick={() => setShowManualForm(!showManualForm)}>
            {showManualForm ? 'Cancel Manual Add' : '+ Add Manual Story'}
          </button>
        </div>
      </div>

      {/* Manual Story Form */}
      {showManualForm && (
        <form onSubmit={handleAddManual} className="context-card" style={{ margin: '14px 0' }}>
          <h4>Add Manual Engineering Story</h4>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ flex: 1 }}>
              <span>Story Type</span>
              <select value={manualKind} onChange={(e) => setManualKind(e.target.value as 'user' | 'qa')}>
                <option value="user">User Story</option>
                <option value="qa">QA Story</option>
              </select>
            </label>
            <label style={{ flex: 3 }}>
              <span>Title</span>
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Story title..."
                required
              />
            </label>
          </div>
          <label>
            <span>Description / Acceptance Criteria</span>
            <textarea
              value={manualDesc}
              onChange={(e) => setManualDesc(e.target.value)}
              rows={2}
              placeholder="Description..."
            />
          </label>
          <button type="submit" className="primary" style={{ alignSelf: 'flex-start' }}>
            Add Story
          </button>
        </form>
      )}

      {/* Story Subtabs */}
      <div className="story-tabs">
        <button
          className={activeTab === 'user' ? 'selected' : ''}
          onClick={() => setActiveTab('user')}
        >
          User Stories ({stories.userStories.length})
        </button>
        <button
          className={activeTab === 'qa' ? 'selected' : ''}
          onClick={() => setActiveTab('qa')}
        >
          QA Stories & Scenarios ({stories.qaStories.length})
        </button>
        <button
          className={activeTab === 'traceability' ? 'selected' : ''}
          onClick={() => setActiveTab('traceability')}
        >
          Traceability Matrix
        </button>
      </div>

      {/* Tab 1: User Stories */}
      {activeTab === 'user' && (
        <div className="story-list">
          {stories.userStories.map((story) => (
            <div key={story.id} className="story-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4>[{story.id}] {story.title}</h4>
                <span className={`status-label ${story.status}`}>{story.status}</span>
              </div>
              <p>{story.description}</p>
              {story.outcome && <p className="story-outcome"><strong>Outcome:</strong> {story.outcome}</p>}

              {story.acceptanceCriteria.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <strong style={{ fontSize: 11, color: 'var(--sf-text-accent)' }}>Acceptance Criteria (Gherkin):</strong>
                  <ul style={{ margin: '6px 0 0 16px', fontSize: 11 }}>
                    {story.acceptanceCriteria.map((ac, idx) => (
                      <li key={idx}><code>{ac}</code></li>
                    ))}
                  </ul>
                </div>
              )}

              {story.affectedComponents.length > 0 && (
                <div className="story-meta">
                  <span>Components:</span>
                  {story.affectedComponents.map((c) => (
                    <code
                      key={c}
                      className="link-code"
                      onClick={() => vscode.postMessage({ type: 'evidence/open', path: c, line: 1 })}
                    >
                      {c} ↗
                    </code>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: QA Stories */}
      {activeTab === 'qa' && (
        <div className="story-list">
          {stories.qaStories.map((qa) => (
            <div key={qa.id} className="story-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4>[{qa.id}] {qa.title}</h4>
                <span className={`status-label ${qa.status}`}>{qa.status}</span>
              </div>
              <p>{qa.testObjective}</p>

              {qa.scenarios.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <strong style={{ fontSize: 11, color: 'var(--sf-text-accent)' }}>Test Scenarios:</strong>
                  <ul style={{ margin: '6px 0 0 16px', fontSize: 11 }}>
                    {qa.scenarios.map((sc, idx) => (
                      <li key={idx}>{sc}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Traceability */}
      {activeTab === 'traceability' && (
        <TraceabilityView discovery={discovery} stories={stories} />
      )}

      {/* Iterative Follow-Up Refinement */}
      <form onSubmit={handleIterate} className="discovery-iteration-box" style={{ marginTop: 20 }}>
        <h3>💬 Enhance Stories with Copilot</h3>
        <p className="muted">
          Ask Copilot to split, tighten, add negative edge cases, or incorporate security criteria.
        </p>
        <div className="query-input-row">
          <input
            type="text"
            value={iterationInput}
            onChange={(e) => setIterationInput(e.target.value)}
            placeholder="e.g. Split Story 1 into API and UI tasks, and add negative auth test scenarios..."
          />
          <button type="submit" className="primary" disabled={loading || !iterationInput.trim()}>
            {loading ? 'Refining…' : 'Refine Stories'}
          </button>
        </div>
      </form>
    </div>
  );
}
