import type { Layer } from '../../types';

// Sources keep their own colour; all other nodes are coloured by materialization.
export const SOURCE_COLOR = '#22c55e';

export const MATERIALIZATION_COLORS: Record<string, string> = {
  table:             '#3b82f6',  // blue
  view:              '#a855f7',  // purple
  incremental:       '#f97316',  // orange
  ephemeral:         '#6b7280',  // grey
  materialized_view: '#14b8a6',  // teal
};

const FALLBACK_COLOR = '#6b7280';

export function getNodeColor(
  resourceType: string,
  materialization: string,
  nodeColor?: string,
): string {
  if (nodeColor) return nodeColor;
  if (resourceType === 'source') return SOURCE_COLOR;
  return MATERIALIZATION_COLORS[materialization?.toLowerCase()] ?? FALLBACK_COLOR;
}

// Display label: capitalise the first letter of any layer/folder string
export function getLayerLabel(layer: Layer): string {
  if (!layer || layer === 'unknown') return '';
  return layer.charAt(0).toUpperCase() + layer.slice(1);
}
