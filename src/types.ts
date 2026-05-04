// Shared types between extension host and webview.
// Must NOT import any VS Code APIs.

export type ResourceType = 'model' | 'source' | 'seed';

// Well-known layers get dedicated colours; any other string is a custom layer
// that falls back to the default grey colour.
export type KnownLayer = 'source' | 'staging' | 'intermediate' | 'mart' | 'dimension';
export type Layer = KnownLayer | string;

export interface LineageNode {
  id: string;              // manifest unique_id e.g. model.my_project.stg_users
  name: string;
  resourceType: ResourceType;
  layer: Layer;
  materialization: string; // table | view | incremental | ephemeral | materialized_view | ''
  folderPath: string;      // e.g. "mart/user" from fqn (excludes project name + model name)
  description: string;
  path: string;            // original_file_path relative to project root
  tags: string[];
  nodeColor?: string;      // from config.docs.node_color if set in dbt project
}

export interface LineageGraph {
  nodes: Record<string, LineageNode>;
  parentMap: Record<string, string[]>;  // id → direct parent ids (upstream)
  childMap: Record<string, string[]>;   // id → direct child ids (downstream)
  source: 'manifest' | 'live';          // which parser produced this graph
  projectName: string;
}

// ── Extension → Webview ────────────────────────────────────────────────────

export type ExtToWebviewMessage =
  | { type: 'init'; graph: LineageGraph; focusedNodeId: string | null; depth: number }
  | { type: 'focus'; nodeId: string }
  | { type: 'graphUpdated'; graph: LineageGraph }
  | { type: 'depthChanged'; depth: number }
  | { type: 'error'; message: string }
  | { type: 'loading' };

// ── Webview → Extension ────────────────────────────────────────────────────

export type WebviewToExtMessage =
  | { type: 'ready' }
  | { type: 'openFile'; path: string }        // click node → open .sql in editor
  | { type: 'requestFocus' };                  // focus button clicked in webview
