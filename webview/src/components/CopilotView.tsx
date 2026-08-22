import React, { useEffect, useState } from 'react';
import type {
  CopilotArtifactDto,
  CopilotCustomizationPackDto,
  ExtensionEvent,
} from '../../../src/shared/protocol';
import { vscode } from '../vscode';

export function CopilotView(): React.JSX.Element {
  const [pack, setPack] = useState<CopilotCustomizationPackDto | null>(null);
  const [artifacts, setArtifacts] = useState<CopilotArtifactDto[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionEvent>): void => {
      if (event.data.type === 'copilot/response') {
        setPack(event.data.pack);
        setArtifacts(event.data.pack.artifacts);
        if (event.data.pack.artifacts.length > 0) {
          setSelectedArtifactId(event.data.pack.artifacts[0].id);
        }
        setLoading(false);
      }
      if (event.data.type === 'copilot/applied') {
        setAppliedNotice(`Successfully applied ${event.data.written.length} artifact(s) to .github/!`);
        setTimeout(() => setAppliedNotice(null), 5000);
      }
    };
    window.addEventListener('message', handler);
    // Auto-generate preview on open
    setLoading(true);
    vscode.postMessage({ type: 'copilot/generate' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleToggleSelect = (id: string, selected: boolean): void => {
    setArtifacts(artifacts.map((a) => (a.id === id ? { ...a, selected } : a)));
  };

  const handleContentChange = (id: string, content: string): void => {
    setArtifacts(artifacts.map((a) => (a.id === id ? { ...a, content } : a)));
  };

  const handleApply = (): void => {
    const selected = artifacts.filter((a) => a.selected);
    if (selected.length === 0) return;
    vscode.postMessage({ type: 'copilot/apply', artifacts: selected });
  };

  const currentArtifact = artifacts.find((a) => a.id === selectedArtifactId) ?? artifacts[0];

  return (
    <div className="copilot-view">
      <div className="workbench-heading">
        <div>
          <span className="eyebrow">Repository Guidance</span>
          <h2>Copilot Customization Generator</h2>
          <p>
            Generate repository-grounded instructions, language guidelines, and reusable skills
            to anchor GitHub Copilot directly in your codebase architecture.
          </p>
        </div>
        <div className="actions">
          <button
            className="primary"
            disabled={loading || artifacts.filter((a) => a.selected).length === 0}
            onClick={handleApply}
          >
            Apply {artifacts.filter((a) => a.selected).length} Selected Artifact(s) →
          </button>
        </div>
      </div>

      {appliedNotice && (
        <div className="notice" style={{ margin: '10px 0' }}>
          <span>{appliedNotice}</span>
        </div>
      )}

      {pack && (
        <div className="discovery-stats-bar" style={{ margin: '14px 0' }}>
          <div className="stat-pill">
            <span>Workspace:</span>
            <strong>{pack.workspaceName}</strong>
          </div>
          <div className="stat-pill">
            <span>Intelligence Gen:</span>
            <strong>{pack.generationId}</strong>
          </div>
          <div className="stat-pill">
            <span>Total Artifacts:</span>
            <strong>{artifacts.length}</strong>
          </div>
          <div className="stat-pill">
            <span>Total Token Weight:</span>
            <strong>~{pack.totalTokens} tokens</strong>
          </div>
        </div>
      )}

      {/* Artifact Split View: List on left, Editor on right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginTop: 16 }}>
        {/* Left Column: Artifacts list */}
        <div className="context-card" style={{ padding: 12 }}>
          <h4 style={{ marginBottom: 10 }}>Generated Artifacts</h4>
          <div style={{ display: 'grid', gap: 8 }}>
            {artifacts.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: 10,
                  borderRadius: 6,
                  border: `1px solid ${selectedArtifactId === a.id ? 'var(--sf-accent)' : 'var(--sf-border)'}`,
                  background: selectedArtifactId === a.id ? '#112838' : 'var(--sf-bg-primary)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedArtifactId(a.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={a.selected}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleToggleSelect(a.id, e.target.checked);
                    }}
                  />
                  <strong style={{ fontSize: 12 }}>{a.title}</strong>
                </div>
                <small className="muted" style={{ display: 'block' }}>{a.path}</small>
                <span className="muted" style={{ fontSize: 10 }}>~{a.estimatedTokens} tokens</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Editor & Preview */}
        {currentArtifact && (
          <div className="context-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <h4>{currentArtifact.title}</h4>
                <code style={{ fontSize: 11 }}>{currentArtifact.path}</code>
              </div>
              <span className="status-label accepted">{currentArtifact.type}</span>
            </div>
            <p className="muted" style={{ marginBottom: 12 }}>{currentArtifact.description}</p>

            <label>
              <span>Artifact Content (editable before applying)</span>
              <textarea
                value={currentArtifact.content}
                onChange={(e) => handleContentChange(currentArtifact.id, e.target.value)}
                rows={16}
                style={{ fontFamily: 'var(--sf-font-mono)', fontSize: 12 }}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
