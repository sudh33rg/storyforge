import React, { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  Handle,
  type Edge,
  type Node,
} from '@xyflow/react';
import type { FlowPathDto } from '../../../src/shared/protocol';
import { vscode } from '../vscode';

type FlowCardData = {
  label: string;
  kind: string;
  path: string;
  line: number;
  selected: boolean;
};

type FlowNode = Node<FlowCardData, 'flow'>;
type FlowEdge = Edge<{ label: string }>;

function FlowCard({ data }: { data: FlowCardData }): React.JSX.Element {
  return (
    <div className={`flow-node-card ${data.selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <span className="flow-card-kind">{data.kind}</span>
      <strong>{data.label}</strong>
      {data.path && <small>{data.path}:{data.line}</small>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function flowLayout(path: FlowPathDto, selectedStep: number): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = path.nodes.map((node, index) => ({
    id: `flow-step:${index}`,
    type: 'flow',
    position: { x: index * 240, y: 60 },
    data: {
      label: node.name,
      kind: node.kind,
      path: node.path,
      line: node.line,
      selected: selectedStep === index,
    },
  }));

  const edges: FlowEdge[] = path.relationships.map((rel, index) => ({
    id: `flow-edge:${index}`,
    source: `flow-step:${index}`,
    target: `flow-step:${index + 1}`,
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: rel.resolution === 'unresolved' ? '#b8757d' : '#62c0ca',
    },
    label: rel.kind,
    style: {
      stroke: rel.resolution === 'heuristic' || rel.resolution === 'unresolved' ? '#c4a05c' : '#62c0ca',
      strokeDasharray: rel.resolution === 'unresolved' ? '5 4' : undefined,
    },
    labelStyle: { fill: '#8eacbc', fontSize: 10 },
    data: { label: rel.kind },
  }));

  return { nodes, edges };
}

export function FlowResultView({ flow }: { flow: FlowPathDto }): React.JSX.Element {
  const [selectedStep, setSelectedStep] = useState(0);
  const layout = useMemo(() => flowLayout(flow, selectedStep), [flow, selectedStep]);

  return (
    <div className="flow-result" aria-label="Flow execution result">
      <div className="flow-summary">
        <strong>{flow.totalDepth} execution step{flow.totalDepth === 1 ? '' : 's'}</strong>
        <span>Depth: {flow.totalDepth}</span>
        {flow.cycleDetected && <em>⚠ Cycle detected</em>}
      </div>

      <div className="flow-split">
        {/* Step list */}
        <div className="flow-steps">
          <div className="flow-view-heading">
            <span className="eyebrow">Step view</span>
            <small>Ordered execution chain</small>
          </div>
          {flow.nodes.map((node, index) => {
            const rel = flow.relationships[index - 1];
            return (
              <button
                key={`step-${index}`}
                className={`flow-step ${selectedStep === index ? 'active' : ''}`}
                onClick={() => setSelectedStep(index)}
              >
                <b>{index + 1}</b>
                <div className="flow-step-body">
                  <strong>{node.name}</strong>
                  <small>{node.kind} {node.path ? `· ${node.path}:${node.line}` : ''}</small>
                  {rel && (
                    <small className="flow-edge-meta">
                      via {rel.kind} ({rel.resolution} · {Math.round(rel.confidence * 100)}%)
                    </small>
                  )}
                  {node.path && (
                    <span
                      className="link-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        vscode.postMessage({ type: 'evidence/open', path: node.path, line: node.line });
                      }}
                    >
                      Open source ↗
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Graph canvas */}
        <div className="flow-graph">
          <div className="flow-view-heading">
            <span className="eyebrow">Graph canvas</span>
            <small>Click a node to highlight step</small>
          </div>
          <div className="flow-canvas" style={{ height: 260 }}>
            <ReactFlow
              nodes={layout.nodes}
              edges={layout.edges}
              nodeTypes={{ flow: FlowCard }}
              onNodeClick={(_, node) => setSelectedStep(Number(node.id.split(':').pop() ?? 0))}
              fitView
              minZoom={0.3}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#172c3d" gap={20} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </div>
      </div>
    </div>
  );
}
