import React, { useState, useCallback } from 'react';
import type { ImpactAnalysisResponseDto, ImpactNodeDto } from '../../../src/shared/protocol';
import { vscode } from '../vscode';

interface ImpactBlastRadiusViewProps {
  onSearchNode?: (nodeId: string) => void;
}

function RiskBadge({ level }: { level: ImpactAnalysisResponseDto['riskLevel'] }): React.JSX.Element {
  const styles: Record<string, React.CSSProperties> = {
    low: { background: 'var(--vscode-charts-green, #4caf50)', color: '#fff' },
    medium: { background: 'var(--vscode-charts-yellow, #ff9800)', color: '#000' },
    high: { background: 'var(--vscode-charts-orange, #f44336)', color: '#fff' },
    critical: { background: 'var(--vscode-charts-red, #b71c1c)', color: '#fff' },
  };
  return (
    <span style={{ ...styles[level], padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
      {level} risk
    </span>
  );
}

function ImpactRing({
  label,
  nodes,
  color,
  ring,
}: {
  label: string;
  nodes: ImpactNodeDto[];
  color: string;
  ring: number;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(ring === 1);

  if (nodes.length === 0) {
    return (
      <div className="impact-ring impact-ring--empty">
        <div className="impact-ring-header">
          <span className="impact-ring-dot" style={{ background: color, opacity: 0.3 }} />
          <span className="impact-ring-label" style={{ opacity: 0.5 }}>{label}</span>
          <span className="impact-ring-count" style={{ opacity: 0.4 }}>None</span>
        </div>
      </div>
    );
  }

  return (
    <div className="impact-ring" style={{ borderColor: `${color}30` }}>
      <button
        className="impact-ring-header"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span className="impact-ring-dot" style={{ background: color }} />
        <span className="impact-ring-label">{label}</span>
        <span className="impact-ring-count" style={{ background: `${color}20`, color }}>
          {nodes.length}
        </span>
        <span className="impact-ring-chevron">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div className="impact-ring-nodes">
          {nodes.slice(0, 12).map(node => (
            <div key={node.id} className="impact-node-card">
              <span className="impact-node-type" style={{ color }}>{node.type}</span>
              <span className="impact-node-name">{node.name}</span>
              {node.filePath && (
                <span
                  className="link-button"
                  title={node.filePath}
                  onClick={() => vscode.postMessage({ type: 'evidence/open', path: node.filePath!, line: 1 })}
                >
                  {node.filePath.split('/').pop()}↗
                </span>
              )}
              <span className="impact-node-confidence" title="Confidence">
                {Math.round(node.confidence * 100)}%
              </span>
            </div>
          ))}
          {nodes.length > 12 && (
            <div className="muted" style={{ padding: '4px 8px', fontSize: 12 }}>
              …and {nodes.length - 12} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ImpactBlastRadiusView({ onSearchNode }: ImpactBlastRadiusViewProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImpactAnalysisResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Listen for impact response
  React.useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data.type === 'graph/impact-response') {
        setResult(event.data.result);
        setLoading(false);
        setError(null);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    // Send nodeId — user types a symbol name and we pass it directly
    // The extension will search for the node by name if not a full ID
    vscode.postMessage({ type: 'graph/impact', nodeId: query.trim() });
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const totalImpacted = result ? result.totalImpacted : 0;

  return (
    <section className="impact-blast-view">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Change Analysis</span>
          <h2>Impact Blast Radius</h2>
          <p>Enter a symbol, file, or component name to see the ripple effect of changing it through the codebase.</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="impact-search-row">
        <input
          id="impact-node-search"
          type="text"
          className="query-input"
          placeholder="Symbol, class, or file name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search node for impact analysis"
        />
        <button
          className="primary"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          aria-busy={loading}
        >
          {loading ? 'Analyzing…' : 'Analyze Impact'}
        </button>
      </div>

      {error && (
        <div className="error-card">
          <strong>Analysis failed</strong>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="impact-results">
          {/* Target node hero */}
          <div className="impact-target-card">
            <div className="impact-target-info">
              <span className="eyebrow">{result.targetType}</span>
              <h3>{result.targetName}</h3>
              {result.targetPath && (
                <span
                  className="link-button"
                  onClick={() => vscode.postMessage({ type: 'evidence/open', path: result.targetPath!, line: 1 })}
                >
                  {result.targetPath} ↗
                </span>
              )}
            </div>
            <div className="impact-target-meta">
              <RiskBadge level={result.riskLevel} />
              <div className="impact-total">
                <strong>{totalImpacted}</strong>
                <span>entities impacted</span>
              </div>
            </div>
          </div>

          {/* Blast rings */}
          <div className="impact-rings">
            <ImpactRing
              label="Direct Impact"
              nodes={result.directImpact}
              color="#ef5350"
              ring={1}
            />
            <ImpactRing
              label="Transitive Impact"
              nodes={result.transitiveImpact}
              color="#ff9800"
              ring={2}
            />
            <ImpactRing
              label="Affected Tests"
              nodes={result.affectedTests}
              color="#9c27b0"
              ring={3}
            />
            <ImpactRing
              label="Affected API Endpoints"
              nodes={result.affectedApis}
              color="#2196f3"
              ring={4}
            />
          </div>

          {/* Risk guidance */}
          {result.riskLevel === 'critical' && (
            <div className="stale-card" style={{ borderColor: '#ef5350' }}>
              <strong>⚠ Critical change impact detected</strong>
              <p>This change propagates through {totalImpacted} entities. Ensure comprehensive test coverage and staged rollout.</p>
            </div>
          )}
        </div>
      )}

      {!result && !loading && !error && (
        <div className="empty-state">
          <p>Enter a symbol or file name above to visualize its blast radius across the codebase.</p>
        </div>
      )}
    </section>
  );
}
