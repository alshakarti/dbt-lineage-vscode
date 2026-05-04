import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import React, { useCallback, useEffect, useMemo } from 'react';
import type { LineageGraph as LineageGraphData } from '../../types';
import { useLayout } from '../hooks/useLayout';
import { toFlowElements } from '../utils/graphBuilder';
import { ModelNode } from './ModelNode';
import { SourceNode } from './SourceNode';

const nodeTypes: NodeTypes = {
  modelNode: ModelNode,
  sourceNode: SourceNode,
};

interface LineageGraphProps {
  graph: LineageGraphData;
  focusedNodeId: string | null;
  onOpenFile: (path: string) => void;
}

// Inner component — must be inside ReactFlowProvider to use useReactFlow
function LineageGraphInner({ graph, focusedNodeId, onOpenFile }: LineageGraphProps) {
  const { fitView } = useReactFlow();

  const { rfNodes: rawNodes, rfEdges } = useMemo(
    () => toFlowElements(graph, focusedNodeId),
    [graph, focusedNodeId],
  );

  // Inject onOpen callback into node data
  const rfNodes = useMemo(
    () =>
      rawNodes.map((n) => ({
        ...n,
        data: { ...n.data, onOpen: onOpenFile },
      })),
    [rawNodes, onOpenFile],
  );

  const { nodes: layoutedNodes, edges: layoutedEdges, isLayouting } = useLayout(rfNodes, rfEdges);

  // Center on the focused node whenever focus or layout changes
  useEffect(() => {
    if (!focusedNodeId || isLayouting) return;
    // Small delay to let React Flow finish rendering the positioned nodes
    const timer = setTimeout(() => {
      fitView({
        nodes: [{ id: focusedNodeId }],
        duration: 150,
        padding: 0.35,
        maxZoom: 1.2,
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [focusedNodeId, isLayouting, fitView]);

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      const lineageNode = graph.nodes[node.id];
      if (lineageNode?.path) onOpenFile(lineageNode.path);
    },
    [graph.nodes, onOpenFile],
  );

  if (isLayouting && !layoutedNodes.length) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--vscode-descriptionForeground)',
          fontSize: 12,
        }}
      >
        Laying out graph…
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ReactFlow
        nodes={layoutedNodes}
        edges={layoutedEdges}
        nodeTypes={nodeTypes}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        fitViewOptions={{ padding: 1.5 }}
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--vscode-panel-background, var(--vscode-editor-background))' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="#c8c8c8"
        />
        <Controls
          showInteractive={false}
          style={{
            background: 'var(--vscode-panel-background, var(--vscode-editor-background))',
            border: '1px solid var(--vscode-panel-border, #3c3c3c)',
            borderRadius: 4,
          }}
        />
      </ReactFlow>
    </div>
  );
}

export function LineageGraph(props: LineageGraphProps) {
  return <LineageGraphInner {...props} />;
}
