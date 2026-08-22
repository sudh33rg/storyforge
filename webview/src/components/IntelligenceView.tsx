import React, { useEffect, useState } from 'react';
import type {
  IntelligenceStatus,
  GraphResponseDto,
  GraphMode,
  GraphFilters,
  QueryResultDto,
  QueryMode,
  MetricDetailsDto,
  ExtensionEvent,
} from '../../../src/shared/protocol';
import { vscode } from '../vscode';
import { GraphExplorer } from './GraphExplorer';
import { QuerySurface } from './QuerySurface';
import { LayeredArchitectureView } from './LayeredArchitectureView';
import { CapabilityFlowVisualizer } from './CapabilityFlowVisualizer';
import { SchemaAndInfraView } from './SchemaAndInfraView';
import { ImpactBlastRadiusView } from './ImpactBlastRadiusView';
import { CodeQualityView } from './CodeQualityView';
import { GraphDiffView } from './GraphDiffView';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
  } catch {
    return iso;
  }
}

function StalePathsCard({ status }: { status: IntelligenceStatus }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const paths = status.stalePathList;
  return <div className="stale-card">
    <strong>⚠ {status.stalePaths} workspace change{status.stalePaths === 1 ? '' : 's'} pending refresh</strong>
    {paths.length > 0 && <details open={expanded} onToggle={() => setExpanded(!expanded)}>
      <summary>Show changed paths</summary>
      <ul>
        {paths.slice(0, 20).map((p) => <li key={p}><code>{p}</code></li>)}
        {paths.length > 20 && <li className="muted">…and {paths.length - 20} more</li>}
      </ul>
    </details>}
  </div>;
}

function CoverageCard({ coverage }: { coverage: NonNullable<IntelligenceStatus['coverage']> }): React.JSX.Element {
  return <div className="coverage-card">
    <div className="coverage-heading">
      <h3>Multi-Language & Framework Ingestion Coverage</h3>
      <span className={`status-label ${coverage.completeness === 'full' ? 'accepted' : coverage.completeness === 'partial' ? 'draft' : 'rejected'}`}>
        {coverage.completeness.toUpperCase()} COVERAGE
      </span>
    </div>
    {coverage.languageBreakdown.length > 0 && <div className="coverage-summary">
      {coverage.languageBreakdown.map((lang) => <div key={lang.language}>
        <b>{lang.language}</b>
        <span>{lang.fileCount} files · {lang.percentage}%</span>
      </div>)}
    </div>}
    {coverage.frameworks.length > 0 && <div className="detail-row">
      <span>Frameworks: {coverage.frameworks.join(', ')}</span>
      {coverage.patterns.length > 0 && <span>Patterns: {coverage.patterns.join(', ')}</span>}
    </div>}
  </div>;
}

function MetricButton(
  { value, label, category, selected, onSelect }: {
    value: number;
    label: string;
    category: string;
    selected: boolean;
    onSelect: (cat: string | null) => void;
  },
): React.JSX.Element {
  return <button
    className={`metric clickable${selected ? ' selected' : ''}`}
    onClick={() => onSelect(selected ? null : category)}
    aria-pressed={selected}
  >
    <strong>{value.toLocaleString()}</strong>
    <span>{label}</span>
  </button>;
}

export function IntelligenceView({ status }: { status: IntelligenceStatus }): React.JSX.Element {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [metricDetails, setMetricDetails] = useState<MetricDetailsDto | null>(null);
  const [metricDetailsLoading, setMetricDetailsLoading] = useState(false);
  const [graphData, setGraphData] = useState<GraphResponseDto | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResultDto | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryMode, setQueryMode] = useState<QueryMode>('definition');
  const [queryText, setQueryText] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ label: string; value: string; kind: string }>>([]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const active = status.state === 'indexing' || status.state === 'cancelling' || isRefreshing;
  const metrics = status.metrics;
  const progress = status.progress;
  const percent = progress?.total ? Math.round(progress.completed / progress.total * 100) : 0;

  useEffect(() => {
    if (status.state === 'fresh' || status.state === 'failed') {
      setIsRefreshing(false);
    }
  }, [status.state]);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionEvent>): void => {
      if (event.data.type === 'graph/response') {
        setGraphData(event.data.response);
        setGraphLoading(false);
      }
      if (event.data.type === 'graph/query-response') {
        setQueryResult(event.data.result);
        setQueryLoading(false);
      }
      if (event.data.type === 'intelligence/metric-details-response') {
        setMetricDetails(event.data.details);
        setMetricDetailsLoading(false);
      }
      if (event.data.type === 'graph/suggestions-response') {
        setSuggestions(event.data.suggestions);
      }
    };
    window.addEventListener('message', handler);

    // Initial graph load if intelligence ready
    if (status.state === 'fresh' || status.state === 'stale' || status.state === 'partial') {
      setGraphLoading(true);
      vscode.postMessage({ type: 'graph/overview', mode: 'architecture' });
    }

    return () => window.removeEventListener('message', handler);
  }, [status.state, status.generationId]);

  const handleCategorySelect = (category: string | null): void => {
    setSelectedCategory(category);
    if (category) {
      setMetricDetailsLoading(true);
      vscode.postMessage({ type: 'intelligence/metric-details', category });
    } else {
      setMetricDetails(null);
    }
  };

  const handleModeChange = (mode: GraphMode): void => {
    setGraphLoading(true);
    vscode.postMessage({ type: 'graph/overview', mode });
  };

  const handleFilterChange = (filters: GraphFilters): void => {
    setGraphLoading(true);
    vscode.postMessage({ type: 'graph/overview', mode: graphData?.mode ?? 'architecture', filters });
  };

  const handleExpandNode = (nodeId: string): void => {
    setGraphLoading(true);
    vscode.postMessage({ type: 'graph/expand', nodeId, mode: graphData?.mode ?? 'architecture' });
  };

  const handleExecuteQuery = (mode: QueryMode, text: string): void => {
    setQueryMode(mode);
    setQueryText(text);
    setQueryLoading(true);
    vscode.postMessage({ type: 'graph/query', mode, text });
  };

  const handleQueryRequest = (mode: QueryMode, text: string): void => {
    handleExecuteQuery(mode, text);
    setTimeout(() => {
      document.getElementById('query-surface')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const refreshLabel = status.state === 'failed'
    ? 'Retry Refresh'
    : isRefreshing || status.state === 'indexing'
      ? 'Scanning Workspace…'
      : status.generationId
        ? 'Refresh Intelligence'
        : 'Create Intelligence';

  const stateMessage = isRefreshing || status.state === 'indexing'
    ? 'Indexing workspace files, resolving dependencies, and building knowledge graph…'
    : status.state === 'unavailable'
      ? 'Create local intelligence to connect repository evidence to Feature Discovery.'
      : status.state === 'stale'
        ? `${status.stalePaths} workspace change${status.stalePaths === 1 ? '' : 's'} pending refresh.`
        : status.state === 'fresh'
          ? 'Repository evidence is ready for Feature Discovery.'
          : status.state === 'partial'
            ? 'Repository evidence is ready with some gaps.'
            : status.state === 'degraded'
              ? 'Repository intelligence is available with significant coverage gaps.'
              : status.state === 'cancelled'
                ? 'The last refresh was cancelled; the last successful revision remains available.'
                : progress?.message ?? status.error ?? 'Intelligence needs attention.';

  return <section className="intelligence-view-container">
    {/* Hero Card */}
    <div className="hero-card">
      <div>
        <span className="eyebrow">Workspace Intelligence Platform</span>
        <h2>{status.workspaceName}</h2>
        <p>{stateMessage}</p>
      </div>
      <div className="actions">
        {!active && <button
          className="primary"
          onClick={() => {
            setIsRefreshing(true);
            vscode.postMessage({ type: 'intelligence/refresh' });
          }}
        >
          {refreshLabel}
        </button>}
        {active && <button
          className="primary"
          disabled
          style={{ opacity: 0.8 }}
        >
          <span className="dot pulse" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'currentColor', marginRight: 6 }}></span>
          {refreshLabel}
        </button>}
      </div>
    </div>

    {/* Progress */}
    {progress && <div className="progress-card" aria-live="polite">
      <div>
        <strong>{progress.message}</strong>
        <span>{progress.completed} / {progress.total}</span>
      </div>
      {progress.total > 0
        ? <progress className="progress-track" value={percent} max={100} aria-label={`${percent}% complete`} />
        : <progress className="progress-track" aria-label="Progress is indeterminate" />
      }
      <small>{progress.phase} · job {progress.jobId.slice(0, 8)}</small>
    </div>}

    {/* Stale paths */}
    {status.state === 'stale' && <StalePathsCard status={status} />}

    {/* Error */}
    {status.error && <div className="error-card">
      <strong>Refresh failed</strong>
      <p>{status.error}</p>
    </div>}

    {/* Primary Metrics Grid */}
    {metrics && <>
      <div className="metric-grid primary-metrics">
        <MetricButton value={metrics.indexed} label="Files indexed" category="indexed" selected={selectedCategory === 'indexed'} onSelect={handleCategorySelect} />
        <MetricButton value={metrics.symbols} label="Symbols" category="symbols" selected={selectedCategory === 'symbols'} onSelect={handleCategorySelect} />
        <MetricButton value={metrics.relationships} label="Relationships" category="relationships" selected={selectedCategory === 'relationships'} onSelect={handleCategorySelect} />
        <MetricButton value={metrics.entryPoints} label="Entry points" category="entryPoints" selected={selectedCategory === 'entryPoints'} onSelect={handleCategorySelect} />
        <MetricButton value={metrics.tests} label="Tests" category="tests" selected={selectedCategory === 'tests'} onSelect={handleCategorySelect} />
        <MetricButton value={metrics.dependencies} label="Dependencies" category="dependencies" selected={selectedCategory === 'dependencies'} onSelect={handleCategorySelect} />
      </div>

      <details className="secondary-metrics">
        <summary>Refresh diagnostics & performance</summary>
        <div className="metric-grid">
          <MetricButton value={metrics.discovered} label="Files discovered" category="discovered" selected={selectedCategory === 'discovered'} onSelect={handleCategorySelect} />
          <MetricButton value={metrics.reused} label="Files reused" category="reused" selected={selectedCategory === 'reused'} onSelect={handleCategorySelect} />
          <MetricButton value={metrics.reparsed} label="Files reparsed" category="reparsed" selected={selectedCategory === 'reparsed'} onSelect={handleCategorySelect} />
          <MetricButton value={metrics.skipped} label="Files skipped" category="skipped" selected={selectedCategory === 'skipped'} onSelect={handleCategorySelect} />
          <MetricButton value={metrics.unsupported} label="Unsupported" category="unsupported" selected={selectedCategory === 'unsupported'} onSelect={handleCategorySelect} />
          <MetricButton value={metrics.failed} label="Failed" category="failed" selected={selectedCategory === 'failed'} onSelect={handleCategorySelect} />
        </div>
      </details>

      <div className="detail-row">
        <span>Snapshot · {formatDate(status.completedAt)}</span>
        <span>Refresh {formatDate(status.lastRefresh)} · {metrics.contentReads} reads · {(metrics.durationMs / 1000).toFixed(2)}s</span>
      </div>

      {/* Metric Details Drill-down Pane */}
      {selectedCategory && (metricDetailsLoading || metricDetails) && (
        <div className="metric-details-pane query-results" aria-live="polite">
          {metricDetailsLoading ? (
            <div className="query-summary"><strong>Loading details...</strong></div>
          ) : metricDetails ? (
            <>
              <div className="query-summary">
                <strong>{metricDetails.title}</strong>
              </div>
              {metricDetails.items.length === 0 ? (
                <div className="empty-state"><p>No items found for this metric.</p></div>
              ) : (
                <div className="query-item-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {metricDetails.items.map(item => (
                    <div key={item.id} className="query-item-card">
                      <div className="query-item-header">
                        <span className="query-item-kind">{item.kind}</span>
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
            </>
          ) : null}
        </div>
      )}
    </>}

    {/* 1. The 5 Intelligence Layers Visual Explorer */}
    <LayeredArchitectureView status={status} />

    {/* 2. 11-Stage Capability Reasoning Flow Visualizer */}
    <CapabilityFlowVisualizer stages={status.capabilityStages} />

    {/* 3. Multi-Modal Schema & Infrastructure Explorer */}
    <SchemaAndInfraView sqlTables={status.sqlTables} dockerServices={status.dockerServices} />

    {/* 4. Multi-Language Coverage Card */}
    {status.coverage && <CoverageCard coverage={status.coverage} />}

    {/* 5. Interactive Graph Explorer */}
    {(status.state === 'fresh' || status.state === 'stale' || status.state === 'partial') && (
      <>
        <div className="section-heading">
          <div>
            <span className="eyebrow">Visual modeling</span>
            <h2>Knowledge Graph Explorer</h2>
            <p>Explore repository architecture, invocation trees, dependencies, and test impact.</p>
          </div>
        </div>

        <GraphExplorer
          graphData={graphData}
          loading={graphLoading}
          onModeChange={handleModeChange}
          onFilterChange={handleFilterChange}
          onExpandNode={handleExpandNode}
          onQueryRequest={handleQueryRequest}
        />

        <div className="section-heading">
          <div>
            <span className="eyebrow">Entity intelligence</span>
            <h2>Query Surface & Flow Tracing</h2>
            <p>Query definitions, callers, callees, implementations, usages, tests, and execution flows.</p>
          </div>
        </div>

        <QuerySurface
          queryResult={queryResult}
          loading={queryLoading}
          activeMode={queryMode}
          queryText={queryText}
          suggestions={suggestions}
          onModeChange={setQueryMode}
          onTextChange={setQueryText}
          onExecuteQuery={handleExecuteQuery}
        />

        {/* 6. Impact Blast Radius — cross-file change impact visualization */}
        <ImpactBlastRadiusView />

        {/* 7. Code Quality Dashboard — complexity, coupling, circular deps, doc health */}
        <CodeQualityView />

        {/* 8. Graph Diff Timeline — generation-over-generation graph changes */}
        <GraphDiffView />
      </>
    )}
  </section>;
}
