import type { Layer, LineageGraph, LineageNode, ResourceType } from './types';

// Maps manifest resource_type strings to our ResourceType union
const SUPPORTED_NODE_TYPES: ResourceType[] = ['model', 'seed'];

// Maps dbt fqn subfolder names to Layer values
const LAYER_MAP: Record<string, Layer> = {
  staging: 'staging',
  stg: 'staging',
  intermediate: 'intermediate',
  int: 'intermediate',
  mart: 'mart',
  marts: 'mart',
  core: 'mart',
  // accommodate common typos / project conventions
  dimentions: 'dimension',
  dimensions: 'dimension',
  dimension: 'dimension',
  dim: 'dimension',
};

function inferLayer(node: ManifestRawNode): Layer {
  // fqn[1] is the immediate subfolder under the project root (e.g. "staging", "reporting")
  const subfolder = (node.fqn?.[1] ?? '').toLowerCase();
  // Return a normalised known layer if we recognise the folder name,
  // otherwise return the raw subfolder name so the node displays it as-is.
  return LAYER_MAP[subfolder] ?? (subfolder || 'unknown');
}

// Raw shapes from manifest.json — only the fields we need
interface ManifestRawNode {
  resource_type: string;
  name: string;
  fqn?: string[];
  config?: {
    materialized?: string;
    docs?: { node_color?: string | null };
  };
  description?: string;
  original_file_path?: string;
  tags?: string[];
}

interface ManifestRawSource {
  name: string;
  source_name?: string;
  description?: string;
  original_file_path?: string;
}

interface RawManifest {
  metadata?: { generated_at?: string; dbt_schema_version?: string };
  nodes?: Record<string, ManifestRawNode>;
  sources?: Record<string, ManifestRawSource>;
  parent_map?: Record<string, string[]>;
  child_map?: Record<string, string[]>;
}

export class ManifestParser {
  static parse(rawJson: string): LineageGraph {
    const manifest = JSON.parse(rawJson) as RawManifest;
    const nodes: Record<string, LineageNode> = {};

    // Derive project name from the first node's unique_id
    let projectName = 'unknown';

    // ── Process model/seed nodes ──────────────────────────────────────────
    for (const [uid, raw] of Object.entries(manifest.nodes ?? {})) {
      if (!(SUPPORTED_NODE_TYPES as string[]).includes(raw.resource_type)) continue;

      if (projectName === 'unknown') {
        // uid format: resource_type.project_name.model_name
        const parts = uid.split('.');
        if (parts.length >= 2) projectName = parts[1];
      }

      // fqn = [project, ...folders, model_name] → folders = fqn[1..-2]
      const folderPath = raw.fqn ? raw.fqn.slice(1, -1).join('/') : '';

      nodes[uid] = {
        id: uid,
        name: raw.name,
        resourceType: raw.resource_type as ResourceType,
        layer: inferLayer(raw),
        materialization: raw.config?.materialized ?? '',
        folderPath,
        description: raw.description ?? '',
        path: raw.original_file_path ?? '',
        tags: raw.tags ?? [],
        nodeColor: raw.config?.docs?.node_color ?? undefined,
      };
    }

    // ── Process sources ───────────────────────────────────────────────────
    for (const [uid, src] of Object.entries(manifest.sources ?? {})) {
      if (projectName === 'unknown') {
        const parts = uid.split('.');
        if (parts.length >= 2) projectName = parts[1];
      }

      nodes[uid] = {
        id: uid,
        name: src.source_name ? `${src.source_name}.${src.name}` : src.name,
        resourceType: 'source',
        layer: 'source',
        materialization: '',
        folderPath: '',
        description: src.description ?? '',
        path: src.original_file_path ?? '',
        tags: [],
      };
    }

    // ── Build parent/child maps filtered to known nodes ───────────────────
    const parentMap: Record<string, string[]> = {};
    const childMap: Record<string, string[]> = {};

    for (const [uid, parents] of Object.entries(manifest.parent_map ?? {})) {
      if (!nodes[uid]) continue;
      parentMap[uid] = parents.filter((p) => nodes[p]);
    }

    for (const [uid, children] of Object.entries(manifest.child_map ?? {})) {
      if (!nodes[uid]) continue;
      childMap[uid] = children.filter((c) => nodes[c]);
    }

    // Ensure every node has an entry in both maps (even if empty)
    for (const uid of Object.keys(nodes)) {
      if (!parentMap[uid]) parentMap[uid] = [];
      if (!childMap[uid]) childMap[uid] = [];
    }

    return { nodes, parentMap, childMap, source: 'manifest', projectName };
  }
}
