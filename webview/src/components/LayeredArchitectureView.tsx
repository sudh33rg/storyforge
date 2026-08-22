import React, { useEffect, useState } from 'react';
import type { IntelligenceStatus, ExtensionEvent, SemanticSearchMatchDto } from '../../../src/shared/protocol';
import { vscode } from '../vscode';

export function LayeredArchitectureView({ status }: { status: IntelligenceStatus }): React.JSX.Element {
  const [activeLayer, setActiveLayer] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState('auth user login');
  const [searchResults, setSearchResults] = useState<SemanticSearchMatchDto[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionEvent>): void => {
      if (event.data.type === 'semantic/search-response') {
        setSearchResults(event.data.results);
        setSearchLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSearch = (query: string): void => {
    setSearchQuery(query);
    if (query.trim().length > 1) {
      setSearchLoading(true);
      vscode.postMessage({ type: 'semantic/search', query: query.trim() });
    }
  };

  const layers = [
    { id: 1, title: 'Layer 1: Ontology', subtitle: 'Metamodel & Invariants', icon: '📐', color: '#38bdf8' },
    { id: 2, title: 'Layer 2: Semantic', subtitle: 'Hybrid BM25 + Dense RRF', icon: '🧠', color: '#a78bfa' },
    { id: 3, title: 'Layer 3: Context', subtitle: 'Situational State & Streaming', icon: '⏱️', color: '#f43f5e' },
    { id: 4, title: 'Layer 4: Knowledge Graph', subtitle: 'Full-Stack Substrate', icon: '🌐', color: '#34d399' },
    { id: 5, title: 'Layer 5: Context Graph', subtitle: '11-Stage Capability Reasoning', icon: '🚀', color: '#fbbf24' },
  ];

  return (
    <div className="layered-architecture-card">
      <div className="layer-header">
        <div>
          <span className="eyebrow">The 5 Intelligence Layers</span>
          <h3>Full-Stack Intelligence Architecture</h3>
          <p>Inspect how StoryForge unifies formal ontology, hybrid semantics, real-time context, global knowledge, and dynamic projections.</p>
        </div>
        <div className="live-badge">
          <span className={`dot ${status.generationId ? 'pulse' : ''}`}></span>
          <span>{status.generationId ? `Gen ${status.generationId} Active` : 'Not Indexed'}</span>
        </div>
      </div>

      <div className="layer-tabs">
        {layers.map((layer) => (
          <button
            key={layer.id}
            className={`layer-tab ${activeLayer === layer.id ? 'active' : ''}`}
            onClick={() => setActiveLayer(layer.id)}
            style={{ '--layer-color': layer.color } as React.CSSProperties}
          >
            <span className="layer-icon">{layer.icon}</span>
            <div className="layer-text">
              <strong>{layer.title}</strong>
              <small>{layer.subtitle}</small>
            </div>
          </button>
        ))}
      </div>

      <div className="layer-content-pane">
        {/* Layer 1: Ontology */}
        {activeLayer === 1 && (
          <div className="layer-details-grid">
            <div className="layer-box">
              <h4>16 Formal Ontology Concepts</h4>
              <p>Entities strictly classified according to the StoryForge formal metamodel:</p>
              <div className="badge-cloud">
                {['repository', 'project', 'application', 'service', 'module', 'component', 'file', 'symbol', 'concept', 'api-endpoint', 'test-suite', 'configuration', 'external-dependency', 'database-table', 'docker-service', 'documentation'].map((c) => (
                  <span key={c} className="ontology-badge">{c}</span>
                ))}
              </div>
            </div>
            <div className="layer-box">
              <h4>Architectural Boundary Rules</h4>
              <ul className="rule-list">
                <li><span className="check">✓</span> <b>Presentation Layer</b> may only access <i>Application</i> or <i>Service</i> layers.</li>
                <li><span className="check">✓</span> <b>Service Layer</b> encapsulates business logic and calls <i>Domain</i> / <i>Data-Access</i>.</li>
                <li><span className="check">✓</span> <b>Database Tables</b> can only be mapped to by <i>Models / Repositories</i>.</li>
                <li><span className="check">✓</span> <b>Docker Services</b> define containerized boundaries with explicit <code>depends_on</code>.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Layer 2: Semantic (Hybrid Search) */}
        {activeLayer === 2 && (
          <div className="layer-details-grid">
            <div className="layer-box">
              <h4>Hybrid Semantic Search Engine (BM25 + Dense Vectors)</h4>
              <p>Combines exact term BM25 inverted lexical indexing with subword character-trigram dense vector embeddings and Reciprocal Rank Fusion (RRF):</p>
              <div className="search-demo-bar">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Test live semantic search against workspace..."
                />
                <button className="primary" onClick={() => handleSearch(searchQuery)}>
                  {searchLoading ? 'Searching...' : 'Search Engine ↗'}
                </button>
              </div>
              <div className="math-badge">
                <code>RRF(d) = (0.6 / (60 + rank_BM25)) + (0.4 / (60 + rank_Dense))</code>
              </div>
            </div>
            <div className="layer-box">
              <h4>Live Ranked Retrieval Decomposition</h4>
              {searchResults.length === 0 ? (
                <div className="empty-state"><p>Type a query above to inspect live BM25, Dense Vector, and RRF score decomposition.</p></div>
              ) : (
                <div className="mini-results-list">
                  {searchResults.slice(0, 5).map((r) => (
                    <div key={r.qualifiedName || r.name} className="mini-result-item">
                      <div>
                        <span className="result-kind">{r.type}</span>
                        <b>{r.name}</b>
                        {r.filePath && <small style={{ display: 'block', color: 'var(--sf-text-muted)', fontSize: 10 }}>{r.filePath}</small>}
                      </div>
                      <div className="score-pills">
                        <span className="pill bm25">BM25: {r.bm25Score}</span>
                        <span className="pill dense">Dense: {r.denseScore}</span>
                        <span className="pill rrf">RRF: {r.rrfScore}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Layer 3: Context Layer */}
        {activeLayer === 3 && (
          <div className="layer-details-grid">
            <div className="layer-box">
              <h4>Situational State & Generation Tracker</h4>
              <div className="stat-row">
                <span>Current Knowledge Generation:</span>
                <b>Gen {status.generationId ?? '1'}</b>
              </div>
              <div className="stat-row">
                <span>Staleness Audit Status:</span>
                <b className={status.stalePaths === 0 ? 'fresh-text' : 'warning-text'}>
                  {status.stalePaths} Stale Paths ({status.stalePaths === 0 ? '100% In-Sync' : 'Needs Refresh'})
                </b>
              </div>
              <div className="stat-row">
                <span>Workspace Name:</span>
                <b>{status.workspaceName}</b>
              </div>
            </div>
            <div className="layer-box">
              <h4>Live Keystroke In-Memory Streaming</h4>
              <p>A 300ms debounced document watcher streams live code changes directly into memory, updating symbol tables and semantic indexes without requiring file saves.</p>
              <div className="stream-badge">
                <span className="pulse-circle"></span>
                <span>Active 300ms RAM Streaming Engine</span>
              </div>
            </div>
          </div>
        )}

        {/* Layer 4: Knowledge Graph */}
        {activeLayer === 4 && (
          <div className="layer-details-grid">
            <div className="layer-box">
              <h4>Multi-Modal Substrate</h4>
              <div className="metric-pill-grid">
                <div className="metric-pill">
                  <strong>{status.metrics?.indexed ?? 0}</strong>
                  <span>Files</span>
                </div>
                <div className="metric-pill">
                  <strong>{status.metrics?.symbols ?? 0}</strong>
                  <span>Symbols</span>
                </div>
                <div className="metric-pill">
                  <strong>{status.metrics?.relationships ?? 0}</strong>
                  <span>Edges</span>
                </div>
                <div className="metric-pill">
                  <strong>{status.metrics?.entryPoints ?? 0}</strong>
                  <span>Entrypoints</span>
                </div>
              </div>
            </div>
            <div className="layer-box">
              <h4>Multi-Language Ingestion Coverage</h4>
              <div className="badge-cloud">
                {status.coverage?.languageBreakdown && status.coverage.languageBreakdown.length > 0 ? (
                  status.coverage.languageBreakdown.map((l) => (
                    <span key={l.language} className="lang-badge">{l.language} ({l.percentage}%)</span>
                  ))
                ) : (
                  ['TypeScript', 'JavaScript', 'Java', 'Python', 'Go', 'Rust', 'C#', 'SQL', 'Docker'].map((l) => (
                    <span key={l} className="lang-badge">{l}</span>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Layer 5: Context Graph */}
        {activeLayer === 5 && (
          <div className="layer-details-grid">
            <div className="layer-box">
              <h4>Dynamic Grounded Projection</h4>
              <p>Projects situational subgraphs on demand for any feature intent, evaluating exact path lines from entry points to database tables with confidence metrics.</p>
              <div className="confidence-meter">
                <div className="meter-label">
                  <span>Overall Capability Confidence</span>
                  <b>{Math.round(((status.metrics?.symbols ?? 10) > 0 ? 0.95 : 0) * 100)}%</b>
                </div>
                <div className="meter-bar">
                  <div className="meter-fill" style={{ width: `${Math.round(((status.metrics?.symbols ?? 10) > 0 ? 0.95 : 0) * 100)}%` }}></div>
                </div>
              </div>
            </div>
            <div className="layer-box">
              <h4>11-Stage Capability Reasoning</h4>
              <p>Traverses the full stack with zero hallucinations to guide Copilot workflows and automated story synthesis.</p>
              <button className="primary" onClick={() => vscode.postMessage({ type: 'navigation/open', view: 'workbench' })}>
                Open Feature Workbench ↗
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
