import React, { useEffect, useState } from 'react';
import type {
  QualityReportDto,
  ComplexityItemDto,
  HotSpotDto,
  CircularDepDto,
  DocHealthDto,
} from '../../../src/shared/protocol';
import { vscode } from '../vscode';

// ─── Grade Badge ──────────────────────────────────────────────────────────────

function GradeBadge({ grade, score }: { grade: string; score: number }): React.JSX.Element {
  const colors: Record<string, string> = {
    A: '#4caf50', B: '#8bc34a', C: '#ff9800', D: '#f44336', F: '#b71c1c',
  };
  const color = colors[grade] ?? '#888';
  return (
    <div className="grade-badge" style={{ borderColor: color }}>
      <span className="grade-letter" style={{ color }}>{grade}</span>
      <span className="grade-score">{score}/100</span>
    </div>
  );
}

// ─── Complexity Bar ───────────────────────────────────────────────────────────

function ComplexityBar({ value, max }: { value: number; max: number }): React.JSX.Element {
  const pct = Math.min(100, (value / Math.max(max, 1)) * 100);
  const color = value <= 5 ? '#4caf50' : value <= 10 ? '#ff9800' : value <= 20 ? '#f44336' : '#b71c1c';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--vscode-input-background, #333)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ minWidth: 24, fontSize: 12, textAlign: 'right', color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, children, badge }: { title: string; children: React.ReactNode; badge?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="quality-section-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CodeQualityView(): React.JSX.Element {
  const [report, setReport] = useState<QualityReportDto | null>(null);
  const [docHealth, setDocHealth] = useState<DocHealthDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'intelligence/quality-metrics-response') {
        setReport(event.data.report);
        setLoading(false);
      }
      if (event.data.type === 'intelligence/doc-health-response') {
        setDocHealth(event.data.report);
      }
    };
    window.addEventListener('message', handler);

    // Auto-load on mount
    setLoading(true);
    vscode.postMessage({ type: 'intelligence/quality-metrics' });
    vscode.postMessage({ type: 'intelligence/doc-health' });

    return () => window.removeEventListener('message', handler);
  }, []);

  if (loading && !report) {
    return (
      <section className="quality-view">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Code Health</span>
            <h2>Quality Dashboard</h2>
          </div>
        </div>
        <div className="progress-card" aria-live="polite">
          <progress className="progress-track" aria-label="Computing quality metrics…" />
          <small>Computing cyclomatic complexity, coupling metrics, and circular dependency analysis…</small>
        </div>
      </section>
    );
  }

  if (!report) return <></>;

  const maxCC = report.topComplexSymbols[0]?.cyclomaticComplexity ?? 20;

  return (
    <section className="quality-view">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Code Health</span>
          <h2>Quality Dashboard</h2>
          <p>Cyclomatic complexity, coupling metrics, circular dependencies, and maintainability analysis.</p>
        </div>
      </div>

      {/* ── Hero Score Row ── */}
      <div className="quality-hero-row">
        <div className="quality-hero-score">
          <GradeBadge grade={report.maintainabilityGrade} score={report.maintainabilityScore} />
          <div>
            <div className="eyebrow">Maintainability Index</div>
            <div style={{ fontSize: 13, marginTop: 4, opacity: 0.8 }}>{report.summary}</div>
          </div>
        </div>

        <div className="quality-stat-grid">
          <div className="quality-stat">
            <strong>{report.avgCyclomaticComplexity.toFixed(1)}</strong>
            <span>Avg Complexity</span>
          </div>
          <div className="quality-stat">
            <strong>{report.p90CyclomaticComplexity}</strong>
            <span>P90 Complexity</span>
          </div>
          <div className="quality-stat">
            <strong style={{ color: report.circularDependencyCount > 0 ? '#f44336' : '#4caf50' }}>
              {report.circularDependencyCount}
            </strong>
            <span>Circular Deps</span>
          </div>
          <div className="quality-stat">
            <strong style={{ color: report.hotSpots.length > 5 ? '#ff9800' : '#4caf50' }}>
              {report.hotSpots.length}
            </strong>
            <span>Hot Spots</span>
          </div>
        </div>
      </div>

      {/* ── Top Issues ── */}
      {report.topIssues.length > 0 && (
        <div className="stale-card" style={{ borderColor: '#ff9800' }}>
          <strong>⚠ Top Quality Issues</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {report.topIssues.map((issue, i) => <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>{issue}</li>)}
          </ul>
        </div>
      )}

      <div className="quality-panels">
        {/* ── Complexity ── */}
        <SectionCard
          title="Most Complex Functions"
          badge={<span className="status-label draft">CC Score</span>}
        >
          {report.topComplexSymbols.length === 0 ? (
            <div className="empty-state"><p>No complexity data available yet.</p></div>
          ) : (
            <div className="quality-complexity-list">
              {report.topComplexSymbols.slice(0, 10).map((sym, i) => (
                <div key={sym.nodeId} className="quality-complexity-row">
                  <span className="quality-rank">#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <strong style={{ fontSize: 13 }}>{sym.name}</strong>
                      <span className={`status-label ${sym.rating === 'very-high' ? 'rejected' : sym.rating === 'high' ? 'draft' : 'accepted'}`}>
                        {sym.rating}
                      </span>
                    </div>
                    <ComplexityBar value={sym.cyclomaticComplexity} max={maxCC} />
                    <span
                      className="link-button"
                      style={{ fontSize: 11 }}
                      onClick={() => vscode.postMessage({ type: 'evidence/open', path: sym.filePath, line: 1 })}
                    >
                      {sym.filePath.split('/').pop()} ↗
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── Circular Dependencies ── */}
        <SectionCard
          title="Circular Dependencies"
          badge={
            report.circularDependencyCount === 0
              ? <span className="status-label accepted">✓ None</span>
              : <span className="status-label rejected">{report.circularDependencyCount} cycles</span>
          }
        >
          {report.circularDeps.length === 0 ? (
            <div className="empty-state">
              <p style={{ color: 'var(--vscode-charts-green, #4caf50)' }}>✓ No circular dependencies detected. Clean import graph.</p>
            </div>
          ) : (
            <div className="circular-dep-list">
              {report.circularDeps.slice(0, 8).map((dep, i) => (
                <div key={i} className={`circular-dep-item circular-dep-${dep.severity}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span className={`status-label ${dep.severity === 'severe' ? 'rejected' : dep.severity === 'moderate' ? 'draft' : ''}`}>
                      {dep.severity} · {dep.length} nodes
                    </span>
                  </div>
                  <div className="circular-dep-chain">
                    {dep.cycleNames.map((name, j) => (
                      <React.Fragment key={j}>
                        <span className="circular-dep-node">{name}</span>
                        {j < dep.cycleNames.length - 1 && <span className="circular-dep-arrow">→</span>}
                      </React.Fragment>
                    ))}
                    <span className="circular-dep-arrow">↩</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── Hot Spots ── */}
        <SectionCard
          title="Hot Spots"
          badge={<span className="status-label draft">High risk zones</span>}
        >
          {report.hotSpots.length === 0 ? (
            <div className="empty-state">
              <p style={{ color: 'var(--vscode-charts-green, #4caf50)' }}>✓ No hot spots detected.</p>
            </div>
          ) : (
            <div className="hotspot-list">
              {report.hotSpots.slice(0, 8).map((spot, i) => (
                <div key={i} className="hotspot-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>{spot.name}</strong>
                    <div className="hotspot-score" style={{
                      background: spot.score >= 70 ? '#ef535020' : '#ff980020',
                      color: spot.score >= 70 ? '#ef5350' : '#ff9800',
                    }}>
                      {spot.score}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, marginBottom: 4 }}>
                    <span>CC: <strong>{spot.complexity}</strong></span>
                    <span>Coupling: <strong>{spot.coupling}</strong></span>
                  </div>
                  <div className="hotspot-reasons">
                    {spot.reasons.map((r, j) => <span key={j} className="hotspot-reason">{r}</span>)}
                  </div>
                  <span
                    className="link-button"
                    style={{ fontSize: 11 }}
                    onClick={() => vscode.postMessage({ type: 'evidence/open', path: spot.filePath, line: 1 })}
                  >
                    {spot.filePath.split('/').pop()} ↗
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── Documentation Health ── */}
        {docHealth && (
          <SectionCard
            title="Documentation Health"
            badge={<GradeBadge grade={docHealth.grade} score={docHealth.coveragePercent} />}
          >
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <div className="quality-stat">
                <strong>{docHealth.coveragePercent}%</strong>
                <span>Doc Coverage</span>
              </div>
              <div className="quality-stat">
                <strong style={{ color: docHealth.criticalCount > 0 ? '#f44336' : '#4caf50' }}>
                  {docHealth.criticalCount}
                </strong>
                <span>Critical Gaps</span>
              </div>
              <div className="quality-stat">
                <strong>{docHealth.warningCount}</strong>
                <span>Warnings</span>
              </div>
            </div>

            {/* Coverage bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span>Documented</span>
                <span>{docHealth.documentedCount} / {docHealth.totalAudited}</span>
              </div>
              <div style={{ height: 8, background: 'var(--vscode-input-background, #333)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${docHealth.coveragePercent}%`,
                  height: '100%',
                  background: docHealth.coveragePercent >= 75 ? '#4caf50' : docHealth.coveragePercent >= 50 ? '#ff9800' : '#f44336',
                  borderRadius: 4,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>

            {/* Top critical gaps */}
            {docHealth.gaps.filter(g => g.severity === 'critical').slice(0, 5).map((gap, i) => (
              <div key={i} className="doc-gap-row">
                <span className="status-label rejected" style={{ fontSize: 10 }}>public</span>
                <span style={{ fontSize: 12, flex: 1 }}>{gap.entityName}</span>
                <span
                  className="link-button"
                  style={{ fontSize: 11 }}
                  onClick={() => vscode.postMessage({ type: 'evidence/open', path: gap.filePath, line: 1 })}
                >
                  {gap.filePath.split('/').pop()} ↗
                </span>
              </div>
            ))}
          </SectionCard>
        )}
      </div>
    </section>
  );
}
