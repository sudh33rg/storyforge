import React, { useCallback, useMemo, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type {
  GraphMode,
  GraphFilters,
  GraphNodeDto,
  GraphEdgeDto,
  GraphResponseDto,
  QueryMode,
} from '../../../src/shared/protocol';
import { vscode } from '../vscode';


const modeLabels: Record<GraphMode, string> = {
  architecture: 'Architecture',
  dependencies: 'Dependencies',
  calls: 'Calls',
  flows: 'Routes & Flows',
  'tests-impact': 'Tests & Impact',
};

function nodeTone(kind: string): string {
  if (['repository', 'project', 'application'].includes(kind)) return 'container';
  if (['service', 'api-endpoint', 'module'].includes(kind)) return 'boundary';
  if (['test-suite'].includes(kind)) return 'test';
  if (['external-dependency'].includes(kind)) return 'external';
  return 'symbol';
}

function nodeCanvasObject(node: any, ctx: CanvasRenderingContext2D, globalScale: number) {
  const label = node.label || node.id;
  const fontSize = 12;
  ctx.font = `${fontSize}px Sans-Serif`;
  
  const textWidth = ctx.measureText(label).width;
  const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 1.2) as [number, number];
  node.__bckgDimensions = bckgDimensions;
  
  const kind = node.kind;
  let color = '#4a8faa'; // default
  if (['repository', 'project', 'application'].includes(kind)) color = '#2e5a70';
  if (['service', 'api-endpoint', 'module'].includes(kind)) color = '#62c0ca';
  if (['test-suite'].includes(kind)) color = '#8fb87a';
  if (['external-dependency'].includes(kind)) color = '#c4a05c';
  
  ctx.fillStyle = node.selected ? '#1a3040' : color;
  
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(
      node.x - bckgDimensions[0] / 2,
      node.y - bckgDimensions[1] / 2,
      bckgDimensions[0],
      bckgDimensions[1],
      bckgDimensions[1] / 3
    );
  } else {
    ctx.rect(
      node.x - bckgDimensions[0] / 2,
      node.y - bckgDimensions[1] / 2,
      bckgDimensions[0],
      bckgDimensions[1]
    );
  }
  ctx.fill();
  
  if (node.selected) {
    ctx.strokeStyle = '#62c0ca';
    ctx.lineWidth = Math.max(1, 2 / globalScale);
    ctx.stroke();
  }
  
  if (globalScale > 0.6) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = node.selected ? '#e8f4f8' : '#0a1520';
    ctx.fillText(label, node.x, node.y);
  }
}

function nodePointerAreaPaint(node: any, color: string, ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = color;
  const bckgDimensions = node.__bckgDimensions;
  if (bckgDimensions) {
    ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
  } else {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI, false);
    ctx.fill();
  }
}

export function GraphExplorer({
  graphData,
  loading,
  onModeChange,
  onFilterChange,
  onExpandNode,
  onQueryRequest,
}: {
  graphData: GraphResponseDto | null;
  loading: boolean;
  onModeChange: (mode: GraphMode) => void;
  onFilterChange: (filters: GraphFilters) => void;
  onExpandNode: (nodeId: string) => void;
  onQueryRequest?: (mode: QueryMode, text: string) => void;
}): React.JSX.Element {
  const [activeMode, setActiveMode] = useState<GraphMode>('architecture');
  const [searchText, setSearchText] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNodeDto | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'data'>('graph');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 440 });

  React.useEffect(() => {
    if (isFullscreen) {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
      const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    } else {
      setDimensions({ width: 800, height: 440 });
    }
  }, [isFullscreen]);

  const forceNodes = useMemo(() => {
    if (!graphData?.nodes) return [];
    return graphData.nodes.map(n => ({
      ...n,
      selected: selectedNode?.id === n.id,
    }));
  }, [graphData?.nodes, selectedNode]);

  const forceLinks = useMemo(() => {
    if (!graphData?.edges || !graphData?.nodes) return [];
    const nodeIds = new Set(graphData.nodes.map((n) => n.id));
    return graphData.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map(e => ({
        ...e,
        source: e.source,
        target: e.target,
      }));
  }, [graphData?.edges, graphData?.nodes]);

  const handleModeClick = (mode: GraphMode): void => {
    setActiveMode(mode);
    onModeChange(mode);
  };

  const handleSearchSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    onFilterChange({ search: searchText.trim() });
  };

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node);
  }, []);

  return (
    <div className={`graph-explorer ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Top controls: Modes & Filter */}
      <div className="graph-controls-bar">
        <div className="graph-mode-tabs">
          {(Object.keys(modeLabels) as GraphMode[]).map((mode) => (
            <button
              key={mode}
              className={`graph-tab ${activeMode === mode ? 'active' : ''}`}
              onClick={() => handleModeClick(mode)}
            >
              {modeLabels[mode]}
            </button>
          ))}
        </div>

        <div className="graph-search-form">
          <button onClick={() => setViewMode(viewMode === 'graph' ? 'data' : 'graph')} className="graph-tab" style={{ marginRight: 8 }}>
            {viewMode === 'graph' ? 'View Data' : 'View Graph'}
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="graph-tab" style={{ marginRight: 8 }}>
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Filter graph nodes…"
              aria-label="Filter graph"
            />
            <button type="submit">Filter</button>
          </form>
        </div>
      </div>

      {/* Canvas / Data Area */}
      {viewMode === 'graph' ? (
        <div className="graph-canvas-container" style={{ height: dimensions.height }}>
          {loading && <div className="graph-loading-overlay">Loading graph projection…</div>}
          {!loading && graphData && (
            <ForceGraph2D
              graphData={{ nodes: forceNodes, links: forceLinks }}
              nodeLabel="label"
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={nodePointerAreaPaint}
              onNodeClick={handleNodeClick}
              linkColor={(link: any) => link.unresolved ? '#b8757d' : '#2e5a70'}
              linkWidth={1.5}
              linkDirectionalArrowLength={3.5}
              linkDirectionalArrowRelPos={1}
              d3Force="charge"
              warmupTicks={50}
              cooldownTicks={100}
              width={dimensions.width}
              height={dimensions.height}
            />
          )}
        </div>
      ) : (
        <div className="data-view-container">
          <table className="data-view-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Name</th>
                <th>Qualified Name</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {forceNodes.map((n) => (
                <tr key={n.id}>
                  <td><span className="query-item-kind">{n.kind}</span></td>
                  <td><strong>{n.label}</strong></td>
                  <td><code>{n.qualifiedName}</code></td>
                  <td>{n.path ? `${n.path}:${n.line}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <div className="graph-node-drawer">
          <div className="drawer-header">
            <div>
              <span className="eyebrow">{selectedNode.kind}</span>
              <h4>{selectedNode.label}</h4>
              <code>{selectedNode.qualifiedName}</code>
            </div>
            <button className="link-button" onClick={() => setSelectedNode(null)}>✕</button>
          </div>
          <div className="drawer-actions">
            {selectedNode.path && (
              <button
                className="primary"
                onClick={() => vscode.postMessage({ type: 'evidence/open', path: selectedNode.path!, line: selectedNode.line ?? 1 })}
              >
                Open Source ↗
              </button>
            )}
            <button onClick={() => onExpandNode(selectedNode.id)}>Expand Neighbors</button>
            <button onClick={() => {
              if (onQueryRequest) onQueryRequest('callers', selectedNode.qualifiedName);
              else vscode.postMessage({ type: 'graph/query', mode: 'callers', text: selectedNode.qualifiedName });
            }}>Find Callers</button>
            <button onClick={() => {
              if (onQueryRequest) onQueryRequest('callees', selectedNode.qualifiedName);
              else vscode.postMessage({ type: 'graph/query', mode: 'callees', text: selectedNode.qualifiedName });
            }}>Find Callees</button>
          </div>
        </div>
      )}
    </div>
  );
}
