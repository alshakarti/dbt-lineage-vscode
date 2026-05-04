import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import { useEffect, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';

const elk = new ELK();

const ELK_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.spacing.nodeNode': '30',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 64;

export function useLayout(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[]; isLayouting: boolean } {
  const [layouted, setLayouted] = useState<{ nodes: Node[]; edges: Edge[] }>({
    nodes,
    edges,
  });
  const [isLayouting, setIsLayouting] = useState(false);

  // Only re-run layout when the graph topology changes (node/edge count or IDs)
  const nodeIds = nodes.map((n) => n.id).join(',');
  const edgeIds = edges.map((e) => e.id).join(',');

  useEffect(() => {
    if (!nodes.length) {
      setLayouted({ nodes: [], edges: [] });
      return;
    }

    setIsLayouting(true);

    const elkGraph: ElkNode = {
      id: 'root',
      layoutOptions: ELK_OPTIONS,
      children: nodes.map((n) => ({
        id: n.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
    };

    elk
      .layout(elkGraph)
      .then((result) => {
        const positionedNodes: Node[] = nodes.map((n) => {
          const elkNode = result.children?.find((c) => c.id === n.id);
          return {
            ...n,
            position: {
              x: elkNode?.x ?? 0,
              y: elkNode?.y ?? 0,
            },
          };
        });
        setLayouted({ nodes: positionedNodes, edges });
        setIsLayouting(false);
      })
      .catch(() => {
        // ELK failed (e.g. disconnected graph edge) — fall back to current positions
        setLayouted({ nodes, edges });
        setIsLayouting(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeIds, edgeIds]);

  return { ...layouted, isLayouting };
}
