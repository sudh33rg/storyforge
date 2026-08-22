import React from 'react';
import type { DiscoverySnapshot, StoryGenerationSnapshot } from '../../../src/shared/protocol';
import { vscode } from '../vscode';

export function TraceabilityView({
  discovery,
  stories,
}: {
  discovery: DiscoverySnapshot | null;
  stories: StoryGenerationSnapshot | null;
}): React.JSX.Element {
  if (!discovery || !stories) {
    return (
      <div className="empty-state">
        <p>Complete Discovery and Story Generation to view the Traceability Matrix.</p>
      </div>
    );
  }

  return (
    <div className="traceability-matrix">
      <div className="workbench-heading">
        <div>
          <span className="eyebrow">End-to-End Traceability</span>
          <h2>Provenance & Grounding Matrix</h2>
          <p>
            Deterministic chain linking Feature Intent → Discovery Evidence → User Stories → QA Scenarios.
          </p>
        </div>
      </div>

      <div className="matrix-table-container">
        <table className="matrix-table">
          <thead>
            <tr>
              <th>Feature Intent</th>
              <th>Repository Evidence</th>
              <th>User Story & Gherkin ACs</th>
              <th>QA Story & Test Scenarios</th>
            </tr>
          </thead>
          <tbody>
            {stories.userStories.map((us, idx) => {
              const matchingQa = stories.qaStories.find(
                (q) => q.parentUserStoryId === us.id || idx === 0,
              );
              return (
                <tr key={us.id}>
                  <td className="matrix-cell">
                    <strong>{discovery.feature.title}</strong>
                    <small>{discovery.feature.description}</small>
                  </td>

                  <td className="matrix-cell">
                    {us.affectedComponents.map((comp) => (
                      <div key={comp} className="matrix-evidence-item">
                        <code>{comp}</code>
                        <span
                          className="link-button"
                          onClick={() => vscode.postMessage({ type: 'evidence/open', path: comp, line: 1 })}
                        >
                          ↗
                        </span>
                      </div>
                    ))}
                    {us.affectedComponents.length === 0 && <span className="muted">No direct path</span>}
                  </td>

                  <td className="matrix-cell">
                    <strong>[{us.id}] {us.title}</strong>
                    <p className="matrix-outcome">{us.outcome}</p>
                    <ul className="matrix-ac-list">
                      {us.acceptanceCriteria.map((ac, acIdx) => (
                        <li key={acIdx}><code>{ac}</code></li>
                      ))}
                    </ul>
                  </td>

                  <td className="matrix-cell">
                    {matchingQa ? (
                      <>
                        <strong>[{matchingQa.id}] {matchingQa.title}</strong>
                        <ul className="matrix-sc-list">
                          {matchingQa.scenarios.map((sc, scIdx) => (
                            <li key={scIdx}><b>SC:</b> {sc}</li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <span className="muted">No linked QA story</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
