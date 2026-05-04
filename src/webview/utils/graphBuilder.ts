import type { LineageGraph } from '../../types';

/**
 * Extract a subgraph centered on a given node, including all ancestors and
 * descendants up to `depth` hops. Uses BFS in both directions.
 */
export function buildSubgraph(
  graph: LineageGraph,
  centerNodeId: string,
  depth: number,
): LineageGraph {
  if (!graph.nodes[centerNodeId]) return graph;

  const included = new Set<string>([centerNodeId]);

  // BFS upstream (follow parentMap)
  let frontier = [centerNodeId];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const parent of graph.parentMap[id] ?? []) {
        if (!included.has(parent)) {
          included.add(parent);
          next.push(parent);
        }
      }
    }
    frontier = next;
  }

  // BFS downstream (follow childMap)
  frontier = [centerNodeId];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of graph.childMap[id] ?? []) {
        if (!included.has(child)) {
          included.add(child);
          next.push(child);
        }
      }
    }
    frontier = next;
  }

  // Only keep IDs that have actual node data — dangling IDs produce ghost edges
  const realIncluded = new Set([...included].filter((id) => graph.nodes[id]));

  const nodes = Object.fromEntries(
    [...realIncluded].map((id) => [id, graph.nodes[id]]),
  );

  const parentMap = Object.fromEntries(
    [...realIncluded].map((id) => [
      id,
      (graph.parentMap[id] ?? []).filter((p) => realIncluded.has(p)),
    ]),
  );

  const childMap = Object.fromEntries(
    [...realIncluded].map((id) => [
      id,
      (graph.childMap[id] ?? []).filter((c) => realIncluded.has(c)),
    ]),
  );

  return { nodes, parentMap, childMap, source: graph.source, projectName: graph.projectName };
}

/**
 * Convert a LineageGraph to React Flow nodes and edges.
 */
import type { Edge, Node } from '@xyflow/react';

export function toFlowElements(
  graph: LineageGraph,
  focusedNodeId: string | null,
): { rfNodes: Node[]; rfEdges: Edge[] } {
  const rfNodes: Node[] = Object.values(graph.nodes).map((n) => ({
    id: n.id,
    type: n.resourceType === 'source' ? 'sourceNode' : 'modelNode',
    data: { node: n, isFocused: n.id === focusedNodeId },
    position: { x: 0, y: 0 }, // overwritten by ELK layout
  }));

  const rfEdges: Edge[] = [];
  for (const [childId, parents] of Object.entries(graph.parentMap)) {
    if (!graph.nodes[childId]) continue;
    for (const parentId of parents) {
      if (!graph.nodes[parentId]) continue;
      rfEdges.push({
        id: `${parentId}→${childId}`,
        source: parentId,
        target: childId,
        type: 'smoothstep',
        style: { stroke: 'var(--vscode-editorLineNumber-foreground)', strokeWidth: 1.5 },
      });
    }
  }

  return { rfNodes, rfEdges };
}
