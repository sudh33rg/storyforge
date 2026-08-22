import React, { useEffect, useState } from 'react';
import type {
  PromptTask,
  PromptRewriteLevel,
  PromptEnrichmentDto,
  ExtensionEvent,
} from '../../../src/shared/protocol';
import { vscode } from '../vscode';

const scoreLabels: Array<{ key: string; label: string }> = [
  { key: 'intentPreservation', label: 'Intent Preservation' },
  { key: 'clarity', label: 'Prompt Clarity' },
  { key: 'specificity', label: 'Repository Specificity' },
  { key: 'repositoryFit', label: 'Architectural Fit' },
  { key: 'testability', label: 'Testability' },
  { key: 'tokenEfficiency', label: 'Token Efficiency' },
];

export function PromptEnricherView(): React.JSX.Element {
  const [promptInput, setPromptInput] = useState('');
  const [task, setTask] = useState<PromptTask>('implementation');
  const [rewriteLevel, setRewriteLevel] = useState<PromptRewriteLevel>('moderate');
  const [tokenBudget, setTokenBudget] = useState(2400);
  const [guidance, setGuidance] = useState('');
  const [loading, setLoading] = useState(false);
  const [enrichment, setEnrichment] = useState<PromptEnrichmentDto | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionEvent>): void => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'prompt/response') {
        setEnrichment(event.data.enrichment);
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleEnrich = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    setLoading(true);
    vscode.postMessage({
      type: 'prompt/enrich',
      prompt: promptInput.trim(),
      task,
      rewriteLevel,
      tokenBudget,
    });
  };

  const handleIterate = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!guidance.trim() || !enrichment) return;
    setLoading(true);
    vscode.postMessage({
      type: 'prompt/iterate',
      promptId: enrichment.promptId,
      originalPrompt: enrichment.originalPrompt,
      guidance: guidance.trim(),
      task,
      tokenBudget,
    });
    setGuidance('');
  };

  const handleCopy = (): void => {
    if (!enrichment) return;
    navigator.clipboard.writeText(enrichment.enrichedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="prompt-enricher-view">
      <div className="workbench-heading">
        <div>
          <span className="eyebrow">Context-Engineered Prompts</span>
          <h2>Prompt Enricher</h2>
          <p>
            Transform raw developer prompts into repository-aware prompts with bounded
            token budgets, verified source citations, and 0% hallucinated context.
          </p>
        </div>
      </div>

      {/* Input Configuration Card */}
      <form onSubmit={handleEnrich} className="context-card">
        <label>
          <span>Raw Developer Intent / Prompt *</span>
          <textarea
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            rows={3}
            placeholder="e.g. Add caching to the user service and handle invalidation on logout"
            required
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <label>
            <span>Task Mode</span>
            <select value={task} onChange={(e) => setTask(e.target.value as PromptTask)}>
              <option value="implementation">Implementation</option>
              <option value="investigation">Investigation</option>
              <option value="testing">Testing & Verification</option>
              <option value="review">Code Review</option>
              <option value="general">General</option>
            </select>
          </label>

          <label>
            <span>Rewrite Level</span>
            <select value={rewriteLevel} onChange={(e) => setRewriteLevel(e.target.value as PromptRewriteLevel)}>
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </label>

          <label>
            <span>Token Budget ({tokenBudget.toLocaleString()} tokens)</span>
            <input
              type="range"
              min={768}
              max={12000}
              step={256}
              value={tokenBudget}
              onChange={(e) => setTokenBudget(Number(e.target.value))}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="submit" className="primary" disabled={loading || !promptInput.trim()}>
            {loading ? 'Enriching with repository context…' : 'Enrich Prompt →'}
          </button>
        </div>
      </form>

      {/* Enriched Result Display */}
      {enrichment && (
        <div className="enrichment-result-card" style={{ marginTop: 20 }}>
          <div className="workbench-heading">
            <div>
              <span className="eyebrow">Enrichment Output</span>
              <h3>Repository-Aware Prompt</h3>
              <p>{enrichment.evaluation}</p>
            </div>
            <div className="actions">
              <button className="primary" onClick={handleCopy}>
                {copied ? '✓ Copied to Clipboard!' : 'Copy Enriched Prompt'}
              </button>
            </div>
          </div>

          {/* Efficiency Metric Bar */}
          <div className="discovery-stats-bar">
            <div className="stat-pill">
              <span>Token Budget:</span>
              <strong>{enrichment.estimatedTokens} / {enrichment.tokenBudget}</strong>
            </div>
            <div className="stat-pill">
              <span>Equivalent Full Source:</span>
              <strong>{enrichment.equivalentSourceTokens.toLocaleString()} tokens</strong>
            </div>
            <div className="stat-pill">
              <span>Context Reduction:</span>
              <strong>{Math.round(enrichment.reduction * 100)}% smaller</strong>
            </div>
            <div className="stat-pill">
              <span>Evidence Cited:</span>
              <strong>{enrichment.evidence.length} records</strong>
            </div>
          </div>

          {/* Quality Score Grid */}
          {enrichment.scores && (
            <div className="context-card" style={{ margin: '14px 0' }}>
              <h4>Deterministic Prompt Quality Evaluation</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
                {scoreLabels.map(({ key, label }) => {
                  const val = enrichment.scores?.[key] ?? 4;
                  return (
                    <div key={key} style={{ padding: 8, background: 'var(--sf-bg-primary)', borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                        <span>{label}</span>
                        <b>{val}/5</b>
                      </div>
                      <div style={{ height: 4, background: '#1a3040', borderRadius: 2 }}>
                        <div style={{ width: `${val * 20}%`, height: '100%', background: 'var(--sf-accent)', borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prompt Preview Codebox */}
          <div className="context-card" style={{ margin: '14px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4>Ready-to-Send Enriched Prompt</h4>
              <span className="muted">{enrichment.estimatedTokens} estimated tokens</span>
            </div>
            <pre style={{ maxHeight: 320, overflowY: 'auto', padding: 12, background: 'var(--sf-bg-primary)', borderRadius: 6 }}>
              {enrichment.enrichedPrompt}
            </pre>
          </div>

          {/* Grounding Evidence Links */}
          {enrichment.evidence.length > 0 && (
            <div className="context-card" style={{ margin: '14px 0' }}>
              <h4>Attached Repository Evidence ({enrichment.evidence.length})</h4>
              <div className="query-item-list" style={{ marginTop: 8 }}>
                {enrichment.evidence.map((ev) => (
                  <div key={ev.id} className="query-item-card">
                    <div className="query-item-header">
                      <span className="query-item-kind">{ev.kind}</span>
                      <strong>[{ev.id}] {ev.label}</strong>
                    </div>
                    <div className="query-item-details">
                      <span className="muted">{ev.reason}</span>
                      {ev.path && (
                        <span
                          className="link-button"
                          onClick={() => vscode.postMessage({ type: 'evidence/open', path: ev.path, line: ev.startLine })}
                        >
                          {ev.path}:{ev.startLine} ↗
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Iterative Follow-Up */}
          <form onSubmit={handleIterate} className="discovery-iteration-box" style={{ marginTop: 14 }}>
            <h3>💬 Refine Prompt Context</h3>
            <p className="muted">
              Add specific instructions, exclude irrelevant areas, or increase token budget.
            </p>
            <div className="query-input-row">
              <input
                type="text"
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                placeholder="e.g. Also include error handling guidelines from ApiErrorHandler.ts..."
              />
              <button type="submit" className="primary" disabled={loading || !guidance.trim()}>
                {loading ? 'Refining…' : 'Refine Prompt'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
