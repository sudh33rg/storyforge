import React, { useState } from 'react';
import type { DiscoverySnapshot } from '../../../src/shared/protocol';
import { vscode } from '../vscode';

export function DiscoveryView({
  discovery,
  loading,
}: {
  discovery: DiscoverySnapshot;
  loading: boolean;
}): React.JSX.Element {
  const [guidance, setGuidance] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleIterate = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!guidance.trim()) return;
    vscode.postMessage({ type: 'discovery/iterate', guidance: guidance.trim() });
    setGuidance('');
  };

  const handleAnswerQuestion = (questionId: string): void => {
    const answer = answers[questionId]?.trim();
    if (!answer) return;
    vscode.postMessage({ type: 'discovery/question-answer', questionId, answer });
  };

  const handleSkipQuestion = (questionId: string): void => {
    vscode.postMessage({ type: 'discovery/question-skip', questionId, skipReason: 'Deferred by user' });
  };

  return (
    <div className="discovery-view">
      <div className="workbench-heading">
        <div>
          <span className="eyebrow">Stage 2 · Repository Discovery</span>
          <h2>Evidence-Backed Discovery Context</h2>
          <p>
            StoryForge identified repository components, API routes, and capability gaps
            for <strong>"{discovery.feature.title}"</strong>.
          </p>
        </div>
        <div className="actions">
          <button
            className="primary"
            disabled={loading}
            onClick={() => vscode.postMessage({ type: 'discovery/approve' })}
          >
            {discovery.approvedAt ? '✓ Discovery Approved' : 'Approve Discovery & Generate Stories →'}
          </button>
        </div>
      </div>

      {/* Confidence Pill & Stats */}
      <div className="discovery-stats-bar">
        <div className="stat-pill">
          <span>Overall Confidence:</span>
          <strong>{Math.round(discovery.overallConfidence * 100)}%</strong>
        </div>
        <div className="stat-pill">
          <span>Identified Evidence:</span>
          <strong>{discovery.evidence.length} components</strong>
        </div>
        <div className="stat-pill">
          <span>Pass:</span>
          <strong>#{discovery.iterationCount}</strong>
        </div>
      </div>

      {/* Identified Affected Areas / Groups */}
      <div className="discovery-groups">
        <h3>🏛️ Affected Repository Areas</h3>
        {discovery.groups.length > 0 ? (
          discovery.groups.map((group) => (
            <div key={group.id} className="discovery-group-card">
              <div className="group-header">
                <strong>{group.title}</strong>
                <span className="muted">{group.evidenceCount} component(s)</span>
              </div>
              <p>{group.description}</p>
              <div className="evidence-list">
                {discovery.evidence
                  .filter((e) => e.group === group.id || e.group === group.title)
                  .map((ev) => (
                    <div key={ev.id} className="evidence-row">
                      <input
                        type="checkbox"
                        checked={ev.selected}
                        onChange={(e) =>
                          vscode.postMessage({
                            type: 'discovery/select',
                            conceptId: ev.conceptId,
                            selected: e.target.checked,
                          })
                        }
                      />
                      <div className="evidence-info">
                        <strong>{ev.displayName}</strong>
                        <span className="evidence-kind">{ev.kind}</span>
                        <code
                          className="link-code"
                          onClick={() =>
                            vscode.postMessage({
                              type: 'evidence/open',
                              path: ev.filePath,
                              line: ev.startLine,
                            })
                          }
                        >
                          {ev.filePath}:{ev.startLine} ↗
                        </code>
                      </div>
                      <span className="confidence-tag">{Math.round(ev.confidence * 100)}%</span>
                    </div>
                  ))}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <p>No existing components found matching this capability. StoryForge will plan new components.</p>
          </div>
        )}
      </div>

      {/* Clarification Questions */}
      {discovery.questions.length > 0 && (
        <div className="discovery-questions-card">
          <h3>❓ Clarifications & Architectural Questions</h3>
          {discovery.questions.map((q) => (
            <div key={q.id} className={`question-item ${q.status}`}>
              <div className="question-header">
                <strong>{q.question}</strong>
                <span className={`status-label ${q.status}`}>{q.status}</span>
              </div>
              <p className="question-context">{q.context}</p>
              {q.status === 'open' && (
                <div className="question-action-row">
                  <input
                    type="text"
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="Provide clarification answer..."
                  />
                  <button type="button" onClick={() => handleAnswerQuestion(q.id)}>
                    Submit Answer
                  </button>
                  <button type="button" className="link-button" onClick={() => handleSkipQuestion(q.id)}>
                    Skip
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Iterative Guidance Box */}
      <form onSubmit={handleIterate} className="discovery-iteration-box">
        <h3>💬 Refine Discovery with Feedback</h3>
        <p className="muted">
          Give Copilot feedback (e.g. "Focus on the backend service layer" or "Exclude legacy reporting").
        </p>
        <div className="query-input-row">
          <input
            type="text"
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder="e.g. Include the scheduler configuration files and cron validator..."
          />
          <button type="submit" className="primary" disabled={loading || !guidance.trim()}>
            {loading ? 'Refining…' : 'Refine Discovery'}
          </button>
        </div>
      </form>
    </div>
  );
}
