import React, { useEffect, useState } from 'react';
import type { GraphDiffDto, GraphDiffNodeDto } from '../../../src/shared/protocol';
import { vscode } from '../vscode';

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }): React.JSX.Element {
  if (values.length < 2) return <></>;
  const max = Math.max(...values, 1);
  const width = 80;
  const height = 28;
  const step = width / (values.length - 1);

  const points = values.map((v, i) => `${i * step},${height - (v / max) * (height - 4)}`).join(' ');

  return (
    <div title={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Latest point */}
        {values.length > 0 && (
          <circle
            cx={(values.length - 1) * step}
            cy={height - (values[values.length - 1] / max) * (height - 4)}
            r={3}
            fill={color}
          />
        )}
      </svg>
    </div>
  );
}

// ─── Change Badge ─────────────────────────────────────────────────────────────

function ChangeBadge({ type }: { type: 'added' | 'removed' | 'modified' }): React.JSX.Element {
  const styles: Record<string, React.CSSProperties> = {
    added: { background: '#1b5e2020', color: '#4caf50', border: '1px solid #4caf5040' },
    removed: { background: '#b71c1c20', color: '#ef5350', border: '1px solid #ef535040' },
    modified: { background: '#e65100' + '20', color: '#ff9800', border: '1px solid #ff980040' },
  };
  const labels = { added: '+ added', removed: '− removed', modified: '~ modified' };
  return (
    <span style={{ ...styles[type], padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600 }}>
      {labels[type]}
    </span>
  );
}

// ─── Stat Box ─────────────────────────────────────────────────────────────────

function StatBox({ value, label, delta, color }: { value: number; label: string; delta?: number; color?: string }): React.JSX.Element {
  return (
    <div className="diff-stat-box">
      <strong style={{ fontSize: 22, color: color ?? 'var(--vscode-foreground)' }}>
        {value > 0 ? `+${value}` : value}
      </strong>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{label}</span>
      {delta !== undefined && delta !== 0 && (
        <span style={{ fontSize: 11, color: delta > 0 ? '#4caf50' : '#ef5350' }}>
          {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
        </span>
      )}
    </div>
  );
}

// ─── Change Type Breakdown ────────────────────────────────────────────────────

function ChangeTypeBreakdown({ changesByType }: { changesByType: Record<string, { added: number; removed: number; modified: number }> }): React.JSX.Element {
  const entries = Object.entries(changesByType).filter(([, v]) => v.added + v.removed + v.modified > 0);
  if (entries.length === 0) return <></>;

  return (
    <div className="diff-type-grid">
      {entries.map(([type, counts]) => (
        <div key={type} className="diff-type-card">
          <span className="diff-type-name">{type}</span>
          <div className="diff-type-counts">
            {counts.added > 0 && <span style={{ color: '#4caf50' }}>+{counts.added}</span>}
            {counts.removed > 0 && <span style={{ color: '#ef5350' }}>−{counts.removed}</span>}
            {counts.modified > 0 && <span style={{ color: '#ff9800' }}>~{counts.modified}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Significant Change Row ───────────────────────────────────────────────────

function SignificantChangeRow({ change }: { change: GraphDiffNodeDto }): React.JSX.Element {
  return (
    <div className="sig-change-row">
      <ChangeBadge type={change.changeType} />
      <span className="sig-change-type">{change.type}</span>
      <span className="sig-change-name">{change.name}</span>
      {change.path && (
        <span
          className="link-button"
          style={{ fontSize: 11, marginLeft: 'auto' }}
          onClick={() => vscode.postMessage({ type: 'evidence/open', path: change.path!, line: 1 })}
        >
          {change.path.split('/').pop()} ↗
        </span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function GraphDiffView(): React.JSX.Element {
  const [diff, setDiff] = useState<GraphDiffDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [noDiff, setNoDiff] = useState(false);

  // Synthetic trend data for sparklines (would accumulate over generations in production)
  const [nodeHistory, setNodeHistory] = useState<number[]>([]);
  const [edgeHistory, setEdgeHistory] = useState<number[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'graph/diff-response') {
        const d: GraphDiffDto | null = event.data.diff;
        if (d) {
          setDiff(d);
          // Append to history for sparklines
          setNodeHistory(h => [...h.slice(-9), d.nodesAdded]);
          setEdgeHistory(h => [...h.slice(-9), d.edgesAdded]);
        } else {
          setNoDiff(true);
        }
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);

    // Auto-load
    setLoading(true);
    vscode.postMessage({ type: 'graph/diff' });

    return () => window.removeEventListener('message', handler);
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    setNoDiff(false);
    vscode.postMessage({ type: 'graph/diff' });
  };

  return (
    <section className="diff-view">
      <div className="section-heading" style={{ marginBottom: 16 }}>
        <div>
          <span className="eyebrow">Graph History</span>
          <h2>Graph Diff Timeline</h2>
          <p>Generation-over-generation changes in your knowledge graph — nodes added, removed, modified.</p>
        </div>
        <button className="secondary" onClick={handleRefresh} disabled={loading} aria-busy={loading} style={{ alignSelf: 'center' }}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {loading && !diff && (
        <div className="progress-card" aria-live="polite">
          <progress className="progress-track" aria-label="Computing graph diff…" />
          <small>Comparing current graph with previous generation snapshot…</small>
        </div>
      )}

      {noDiff && !loading && (
        <div className="empty-state">
          <p>No previous generation snapshot available.</p>
          <p style={{ fontSize: 12, opacity: 0.6 }}>A diff will be available after StoryForge Intelligence has run at least twice in this workspace.</p>
        </div>
      )}

      {diff && (
        <>
          {/* Generation range header */}
          <div className="diff-gen-header">
            <div className="diff-gen-tag">Gen {diff.fromGeneration}</div>
            <div className="diff-gen-arrow">→</div>
            <div className="diff-gen-tag diff-gen-tag--current">Gen {diff.toGeneration}</div>
            <div className="diff-churn">
              <span>Churn rate</span>
              <strong style={{ color: diff.churnRate > 0.3 ? '#f44336' : diff.churnRate > 0.1 ? '#ff9800' : '#4caf50' }}>
                {Math.round(diff.churnRate * 100)}%
              </strong>
            </div>
          </div>

          {/* Stat boxes */}
          <div className="diff-stats-row">
            <StatBox value={diff.nodesAdded} label="Nodes Added" color="#4caf50" />
            <StatBox value={-diff.nodesRemoved} label="Nodes Removed" color="#ef5350" />
            <StatBox value={diff.nodesModified} label="Nodes Modified" color="#ff9800" />
            <StatBox value={diff.netNodeChange} label="Net Change" color={diff.netNodeChange >= 0 ? '#4caf50' : '#ef5350'} />
            <StatBox value={diff.edgesAdded} label="Edges Added" color="#2196f3" />
            <StatBox value={-diff.edgesRemoved} label="Edges Removed" color="#9c27b0" />
          </div>

          {/* Sparklines */}
          {nodeHistory.length >= 2 && (
            <div className="diff-sparkline-row">
              <div className="diff-sparkline-item">
                <Sparkline values={nodeHistory} color="#4caf50" label="Nodes added per generation" />
                <span>Nodes added trend</span>
              </div>
              <div className="diff-sparkline-item">
                <Sparkline values={edgeHistory} color="#2196f3" label="Edges added per generation" />
                <span>Edges added trend</span>
              </div>
            </div>
          )}

          {/* Type breakdown */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Changes by Node Type</h3>
            <ChangeTypeBreakdown changesByType={diff.changesByType} />
          </div>

          {/* Significant changes */}
          {diff.significantChanges.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Significant Changes</h3>
              <div className="sig-change-list">
                {diff.significantChanges.map((change, i) => (
                  <SignificantChangeRow key={i} change={change} />
                ))}
              </div>
            </div>
          )}

          {/* Zero-change state */}
          {diff.nodesAdded === 0 && diff.nodesRemoved === 0 && diff.nodesModified === 0 && (
            <div className="empty-state">
              <p style={{ color: 'var(--vscode-charts-green, #4caf50)' }}>✓ No changes detected between Gen {diff.fromGeneration} and Gen {diff.toGeneration}.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
