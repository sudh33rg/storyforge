import React, { useEffect, useState } from 'react';
import type { QueryMode, QueryResultDto } from '../../../src/shared/protocol';
import { vscode } from '../vscode';
import { FlowResultView } from './FlowResultView';

const queryModes: Array<{ mode: QueryMode; label: string; placeholder: string; example: string }> = [
  { mode: 'definition', label: 'Definition', placeholder: 'Find definition of class/function/route...', example: 'UserController' },
  { mode: 'callers', label: 'Callers', placeholder: 'Find what calls this component...', example: 'executeTask' },
  { mode: 'callees', label: 'Callees', placeholder: 'Find what this component calls...', example: 'SchedulerService' },
  { mode: 'implementations', label: 'Implementations', placeholder: 'Find implementations / subclasses...', example: 'TaskRunner' },
  { mode: 'usages', label: 'Usages', placeholder: 'Find all references / usages...', example: 'AuthToken' },
  { mode: 'tests', label: 'Tests', placeholder: 'Find test suites covering component...', example: 'UserService' },
  { mode: 'flow', label: 'Trace Flow', placeholder: 'Trace execution: "Start -> End" or "EntryPoint"', example: 'api/login -> UserStore' },
  { mode: 'ai', label: 'AI Query', placeholder: 'Ask in natural language (e.g., Where are passwords hashed?)', example: 'How does authentication work?' },
  { mode: 'structural', label: 'Structural', placeholder: 'Cypher-like structural search (e.g., (n:api-endpoint))', example: '(n:service)' },
];

export function QuerySurface({
  queryResult,
  loading,
  activeMode,
  queryText,
  suggestions,
  onModeChange,
  onTextChange,
  onExecuteQuery,
}: {
  queryResult: QueryResultDto | null;
  loading: boolean;
  activeMode: QueryMode;
  queryText: string;
  suggestions: Array<{ label: string; value: string; kind: string }>;
  onModeChange: (mode: QueryMode) => void;
  onTextChange: (text: string) => void;
  onExecuteQuery: (mode: QueryMode, text: string) => void;
}): React.JSX.Element {
  useEffect(() => {
    vscode.postMessage({ type: 'graph/suggestions' });
  }, []);

  const currentModeInfo = queryModes.find((m) => m.mode === activeMode) ?? queryModes[0];

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!queryText.trim()) return;
    onExecuteQuery(activeMode, queryText.trim());
  };

  const handleSuggestionClick = (value: string): void => {
    onTextChange(value);
    onExecuteQuery(activeMode, value);
  };

  return (
    <div className="query-surface">
      <div className="query-mode-tabs">
        {queryModes.map((m) => (
          <button
            key={m.mode}
            className={`query-tab ${activeMode === m.mode ? 'active' : ''}`}
            onClick={() => {
              onModeChange(m.mode);
              if (queryText.trim()) onExecuteQuery(m.mode, queryText.trim());
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="query-input-row" id="query-surface">
        <input
          type="text"
          list="query-suggestions-list"
          value={queryText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={currentModeInfo.placeholder}
          aria-label="Knowledge graph query"
        />
        <datalist id="query-suggestions-list">
          {suggestions.map((s, i) => (
            <option key={i} value={s.value}>{s.label} ({s.kind})</option>
          ))}
        </datalist>
        <button type="submit" className="primary" disabled={loading || !queryText.trim()}>
          {loading ? 'Querying…' : 'Query'}
        </button>
      </form>

      <div className="query-examples">
        <small className="muted">Example: </small>
        <button
          type="button"
          className="link-button"
          onClick={() => handleSuggestionClick(currentModeInfo.example)}
        >
          {currentModeInfo.example}
        </button>
      </div>

      {/* Query Results */}
      {queryResult && (
        <div className="query-results" aria-live="polite">
          <div className="query-summary">
            <strong>{queryResult.summary}</strong>
          </div>

          {queryResult.flow && <FlowResultView flow={queryResult.flow} />}

          {!queryResult.flow && queryResult.results.length > 0 && (
            <div className="query-item-list">
              {queryResult.results.map((item) => (
                <div key={item.id} className="query-item-card">
                  <div className="query-item-header">
                    <span className="query-item-kind">{item.kind}</span>
                    {item.role && <span className="query-item-role">{item.role}</span>}
                    <strong>{item.name}</strong>
                  </div>
                  <div className="query-item-details">
                    <code>{item.qualifiedName}</code>
                    {item.path && (
                      <span
                        className="link-button"
                        onClick={() => vscode.postMessage({ type: 'evidence/open', path: item.path, line: item.line })}
                      >
                        {item.path}:{item.line} ↗
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!queryResult.flow && queryResult.results.length === 0 && (
            <div className="empty-state">
              <p>No results found matching your query.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
