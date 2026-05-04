import { ReactFlowProvider } from '@xyflow/react';
import React, { useCallback, useMemo, useState } from 'react';
import type { ExtToWebviewMessage, LineageGraph } from '../types';
import { Controls } from './components/Controls';
import { LineageGraph as LineageGraphView } from './components/LineageGraph';
import { useVscodeMessages } from './hooks/useVscodeMessages';
import { buildSubgraph } from './utils/graphBuilder';

type AppState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; graph: LineageGraph; focusedNodeId: string | null };

export function App() {
  const [appState, setAppState] = useState<AppState>({ status: 'loading' });
  const [viewMode, setViewMode] = useState<'focused' | 'full'>('focused');
  const [depth, setDepth] = useState(3);

  const handleMessage = useCallback((msg: ExtToWebviewMessage) => {
    switch (msg.type) {
      case 'loading':
        setAppState({ status: 'loading' });
        break;

      case 'error':
        setAppState({ status: 'error', message: msg.message });
        break;

      case 'init':
        setDepth(msg.depth);
        setAppState({ status: 'ready', graph: msg.graph, focusedNodeId: msg.focusedNodeId });
        if (msg.focusedNodeId) setViewMode('focused');
        break;

      case 'graphUpdated':
        setAppState((prev) => ({
          status: 'ready',
          graph: msg.graph,
          focusedNodeId: prev.status === 'ready' ? prev.focusedNodeId : null,
        }));
        break;

      case 'focus':
        setAppState((prev) =>
          prev.status === 'ready' ? { ...prev, focusedNodeId: msg.nodeId } : prev,
        );
        setViewMode('focused');
        break;

      case 'depthChanged':
        setDepth(msg.depth);
        break;
    }
    // handleMessage is recreated on every render deliberately — it uses closures
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { send } = useVscodeMessages(handleMessage);

  const handleOpenFile = useCallback(
    (path: string) => send({ type: 'openFile', path }),
    [send],
  );

  const visibleGraph = useMemo<LineageGraph | null>(() => {
    if (appState.status !== 'ready') return null;
    const { graph, focusedNodeId } = appState;
    if (viewMode === 'full') return graph;
    if (focusedNodeId && graph.nodes[focusedNodeId]) {
      return buildSubgraph(graph, focusedNodeId, depth);
    }
    return graph;
  }, [appState, viewMode, depth]);

  // ── Render states ─────────────────────────────────────────────────────────

  if (appState.status === 'loading') {
    return (
      <div style={centerStyle}>
        <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)' }}>
          Loading dbt project…
        </div>
      </div>
    );
  }

  if (appState.status === 'error') {
    return (
      <div style={{ ...centerStyle, flexDirection: 'column', gap: 8, padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--vscode-errorForeground)' }}>
          {appState.message}
        </div>
        <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>
          Run <code>dbt parse</code> or <code>dbt run</code> to generate a manifest.
        </div>
      </div>
    );
  }

  const { focusedNodeId } = appState;

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Controls
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {visibleGraph && (
        <ReactFlowProvider>
          <LineageGraphView
            graph={visibleGraph}
            focusedNodeId={focusedNodeId}
            onOpenFile={handleOpenFile}
          />
        </ReactFlowProvider>
      )}
    </div>
  );
}

const centerStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
