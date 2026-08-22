import React, { useState } from 'react';
import type { CapabilityStageDto } from '../../../src/shared/protocol';
import { vscode } from '../vscode';

export function CapabilityFlowVisualizer({
  stages = [],
  featureTitle = 'Workspace Core Capability',
}: {
  stages?: CapabilityStageDto[];
  featureTitle?: string;
}): React.JSX.Element {
  const [selectedStageIndex, setSelectedStageIndex] = useState<number>(0);

  if (stages.length === 0) {
    return (
      <div className="capability-flow-card">
        <div className="flow-header">
          <div>
            <span className="eyebrow">11-Stage Capability Reasoning</span>
            <h3>End-to-End Architectural Grounding Pipeline</h3>
            <p>Traces the feature execution path across all 11 architectural tiers with exact line-level evidence grounding.</p>
          </div>
        </div>
        <div className="empty-state">
          <p>Scan workspace or select a feature in Feature Discovery to project an 11-stage capability reasoning flow.</p>
        </div>
      </div>
    );
  }

  const current = stages[selectedStageIndex] || stages[0];

  return (
    <div className="capability-flow-card">
      <div className="flow-header">
        <div>
          <span className="eyebrow">11-Stage Capability Reasoning</span>
          <h3>End-to-End Architectural Grounding Pipeline</h3>
          <p>Traces the feature execution path across all 11 architectural tiers with exact line-level evidence grounding.</p>
        </div>
        <div className="flow-feature-badge">
          <span>Feature: <b>{featureTitle}</b></span>
        </div>
      </div>

      {/* Pipeline Stepper */}
      <div className="pipeline-stepper">
        {stages.map((st, idx) => (
          <button
            key={st.stage}
            className={`step-node ${selectedStageIndex === idx ? 'active' : ''} ${st.status}`}
            onClick={() => setSelectedStageIndex(idx)}
            title={`${st.stage}: ${st.component}`}
          >
            <span className="step-number">{idx + 1}</span>
            <span className="step-title">{st.label}</span>
          </button>
        ))}
      </div>

      {/* Selected Stage Detail Pane */}
      <div className="stage-detail-pane">
        <div className="stage-main-info">
          <div className="stage-badge-row">
            <span className="stage-badge">{current.stage.toUpperCase()}</span>
            <span className={`status-badge ${current.status}`}>
              {current.status === 'confirmed' ? '✓ Confirmed Evidence' : current.status === 'heuristic' ? '⚡ Heuristic' : '⚠ Gap'}
            </span>
            <span className="confidence-badge">
              Confidence: {Math.round(current.confidence * 100)}%
            </span>
          </div>

          <h4>{current.component}</h4>
          <p className="stage-notes">{current.notes}</p>

          {current.filePath ? (
            <div className="evidence-location-box">
              <div className="file-info">
                <span className="file-icon">📄</span>
                <code>{current.filePath}:{current.line || 1}</code>
              </div>
              <button
                className="primary"
                onClick={() => vscode.postMessage({ type: 'evidence/open', path: current.filePath, line: current.line || 1 })}
              >
                Open in Editor ↗
              </button>
            </div>
          ) : (
            <div className="evidence-location-box">
              <span className="muted">No direct file location resolved for this tier.</span>
            </div>
          )}
        </div>

        <div className="stage-qa-box">
          <h5>Seed Acceptance & QA Grounding</h5>
          {current.seedAcceptanceCriteria && current.seedAcceptanceCriteria.length > 0 ? (
            <ul className="qa-list">
              {current.seedAcceptanceCriteria.map((ac, i) => (
                <li key={i}>{ac}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">Automated criteria will be generated upon Feature Discovery approval.</p>
          )}
        </div>
      </div>
    </div>
  );
}
