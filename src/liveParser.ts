import * as path from 'path';
import * as vscode from 'vscode';
import type { LineageGraph, LineageNode } from './types';

// Matches {{ ref('model') }} and {{ ref("model") }}
const REF_RE = /\{\{[\s-]*ref\s*\(\s*['"]([^'"]+)['"]\s*\)[\s-]*\}\}/g;

// Matches {{ source('source_name', 'table_name') }}
const SOURCE_RE =
  /\{\{[\s-]*source\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)[\s-]*\}\}/g;

// Matches materialized = 'value' or materialized="value" inside {{ config(...) }}
const CONFIG_MAT_RE = /materialized\s*=\s*['"]([^'"]+)['"]/;

interface ParsedFile {
  nodeId: string;
  folderPath: string;       // e.g. "mart/dimentions" derived from the file URI
  materialization: string;  // from {{ config() }} or dbt_project.yml default
  refs: string[];
  sources: string[];
}

/**
 * LiveParser scans .sql files in the workspace to build a lineage graph
 * from ref() and source() calls, without needing a dbt manifest.
 */
export class LiveParser {
  private fileIndex: Map<string, ParsedFile> = new Map();
  private projectName: string;
  private folderMaterializations: Map<string, string> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private onUpdateCallback: ((graph: LineageGraph) => void) | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly projectRoot: vscode.Uri) {
    this.projectName = path.basename(projectRoot.fsPath);
  }

  async initialize(): Promise<LineageGraph> {
    // Load dbt_project.yml first so per-folder materialization defaults are available
    await this.loadDbtProjectYml();

    const sqlFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.projectRoot, 'models/**/*.sql'),
      '**/{target,compiled,run}/**',
      5000,
    );

    await Promise.all(sqlFiles.map((f) => this.parseFile(f)));
    return this.buildGraph();
  }

  startWatching(onUpdate: (graph: LineageGraph) => void): void {
    this.onUpdateCallback = onUpdate;

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.projectRoot, 'models/**/*.sql'),
    );

    const handleChange = (uri: vscode.Uri) => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(async () => {
        await this.parseFile(uri);
        this.onUpdateCallback?.(this.buildGraph());
      }, 200);
    };

    const handleDelete = (uri: vscode.Uri) => {
      const nodeId = this.uriToNodeId(uri);
      this.fileIndex.delete(nodeId);
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.onUpdateCallback?.(this.buildGraph());
      }, 200);
    };

    // Also re-parse when dbt_project.yml changes (materialization defaults may change)
    const yamlWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.projectRoot, 'dbt_project.yml'),
    );
    const reloadAll = async () => {
      await this.loadDbtProjectYml();
      // Re-parse all files so materialization defaults are re-applied
      const files = [...this.fileIndex.values()].map((f) => {
        const absPath = path.join(this.projectRoot.fsPath, 'models', f.folderPath, `${f.nodeId.split('.').pop()}.sql`);
        return vscode.Uri.file(absPath);
      });
      await Promise.all(files.map((f) => this.parseFile(f)));
      this.onUpdateCallback?.(this.buildGraph());
    };

    watcher.onDidChange(handleChange, undefined, this.disposables);
    watcher.onDidCreate(handleChange, undefined, this.disposables);
    watcher.onDidDelete(handleDelete, undefined, this.disposables);
    yamlWatcher.onDidChange(reloadAll, undefined, this.disposables);
    this.disposables.push(watcher, yamlWatcher);
  }

  dispose(): void {
    clearTimeout(this.debounceTimer);
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  mergeInto(manifestGraph: LineageGraph): LineageGraph {
    const live = this.buildGraph();
    const merged = structuredClone(manifestGraph);

    for (const [uid, liveNode] of Object.entries(live.nodes)) {
      if (!merged.nodes[uid]) {
        merged.nodes[uid] = liveNode;
      } else {
        // Enrich manifest node with live-derived folder path and materialization
        // if the manifest didn't have them
        if (!merged.nodes[uid].folderPath && liveNode.folderPath) {
          merged.nodes[uid] = { ...merged.nodes[uid], folderPath: liveNode.folderPath };
        }
        if (!merged.nodes[uid].materialization && liveNode.materialization) {
          merged.nodes[uid] = { ...merged.nodes[uid], materialization: liveNode.materialization };
        }
      }
      merged.parentMap[uid] = live.parentMap[uid] ?? [];
      merged.childMap[uid] = live.childMap[uid] ?? [];
    }

    // Rebuild child map
    for (const uid of Object.keys(merged.nodes)) {
      if (!merged.childMap[uid]) merged.childMap[uid] = [];
    }
    for (const [uid, parents] of Object.entries(merged.parentMap)) {
      for (const parentId of parents) {
        if (!merged.childMap[parentId]) merged.childMap[parentId] = [];
        if (!merged.childMap[parentId].includes(uid)) {
          merged.childMap[parentId].push(uid);
        }
      }
    }

    merged.source = 'live';
    return merged;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async loadDbtProjectYml(): Promise<void> {
    try {
      const uri = vscode.Uri.joinPath(this.projectRoot, 'dbt_project.yml');
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf8');
      this.folderMaterializations = parseDbtProjectYml(content);
      // Extract project name from yaml if possible
      const nameMatch = content.match(/^name:\s*['"]?([^'"\n]+)['"]?/m);
      if (nameMatch) this.projectName = nameMatch[1].trim();
    } catch {
      // dbt_project.yml not found or unreadable — continue without defaults
    }
  }

  private async parseFile(uri: vscode.Uri): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf8');
      const nodeId = this.uriToNodeId(uri);
      const folderPath = this.uriFolderPath(uri);

      // Materialization: file-level config block wins, then folder default
      const configMatch = CONFIG_MAT_RE.exec(content);
      const materialization = configMatch
        ? configMatch[1]
        : this.folderDefault(folderPath);

      const refs: string[] = [];
      const sources: string[] = [];

      let m: RegExpExecArray | null;
      REF_RE.lastIndex = 0;
      while ((m = REF_RE.exec(content)) !== null) refs.push(m[1]);
      SOURCE_RE.lastIndex = 0;
      while ((m = SOURCE_RE.exec(content)) !== null) sources.push(`${m[1]}.${m[2]}`);

      this.fileIndex.set(nodeId, { nodeId, folderPath, materialization, refs, sources });
    } catch {
      // File deleted between scan and read — ignore
    }
  }

  /** Derive folder path relative to models/ e.g. "mart/dimentions" */
  private uriFolderPath(uri: vscode.Uri): string {
    const abs = uri.fsPath.replace(/\\/g, '/');
    const root = this.projectRoot.fsPath.replace(/\\/g, '/');
    const rel = abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
    // rel = "models/mart/dimentions/dim_city.sql"
    const parts = rel.split('/');
    // strip "models" prefix and filename → ["mart", "dimentions"]
    const modelsIdx = parts.indexOf('models');
    if (modelsIdx === -1) return '';
    return parts.slice(modelsIdx + 1, -1).join('/');
  }

  private uriToNodeId(uri: vscode.Uri): string {
    const stem = path.basename(uri.fsPath, '.sql');
    return `model.${this.projectName}.${stem}`;
  }

  /** Walk up the folder path to find the closest materialization default */
  private folderDefault(folderPath: string): string {
    const parts = folderPath.split('/').filter(Boolean);
    for (let i = parts.length; i >= 0; i--) {
      const key = parts.slice(0, i).join('/');
      const mat = this.folderMaterializations.get(key);
      if (mat) return mat;
    }
    return 'view'; // dbt's built-in default
  }

  private buildGraph(): LineageGraph {
    const nodes: Record<string, LineageNode> = {};
    const parentMap: Record<string, string[]> = {};
    const childMap: Record<string, string[]> = {};

    for (const { nodeId, folderPath, materialization } of this.fileIndex.values()) {
      const name = nodeId.split('.').pop() ?? nodeId;
      // Derive layer from top-level folder for colour-free layer label
      const topFolder = folderPath.split('/')[0] ?? '';
      nodes[nodeId] = {
        id: nodeId,
        name,
        resourceType: 'model',
        layer: topFolder || 'unknown',
        materialization,
        folderPath,
        description: '',
        path: folderPath ? `models/${folderPath}/${name}.sql` : '',
        tags: [],
      };
      parentMap[nodeId] = [];
      childMap[nodeId] = [];
    }

    for (const { nodeId, refs, sources } of this.fileIndex.values()) {
      const parents: string[] = [];

      for (const refModel of refs) {
        const parentId = `model.${this.projectName}.${refModel}`;
        if (!nodes[parentId]) {
          nodes[parentId] = {
            id: parentId,
            name: refModel,
            resourceType: 'model',
            layer: 'unknown',
            materialization: '',
            folderPath: '',
            description: '',
            path: '',
            tags: [],
          };
          parentMap[parentId] = [];
          childMap[parentId] = [];
        }
        parents.push(parentId);
        if (!childMap[parentId].includes(nodeId)) childMap[parentId].push(nodeId);
      }

      for (const sourceRef of sources) {
        const [sourceName, tableName] = sourceRef.split('.');
        const sourceId = `source.${this.projectName}.${sourceName}.${tableName}`;
        if (!nodes[sourceId]) {
          nodes[sourceId] = {
            id: sourceId,
            name: sourceRef,
            resourceType: 'source',
            layer: 'source',
            materialization: '',
            folderPath: '',
            description: '',
            path: '',
            tags: [],
          };
          parentMap[sourceId] = [];
          childMap[sourceId] = [];
        }
        parents.push(sourceId);
        if (!childMap[sourceId].includes(nodeId)) childMap[sourceId].push(nodeId);
      }

      parentMap[nodeId] = parents;
    }

    return { nodes, parentMap, childMap, source: 'live', projectName: this.projectName };
  }
}

/**
 * Parse dbt_project.yml to extract folder-level materialization defaults.
 * Returns a map of folder path → materialization, e.g.:
 *   "" → "view"  (project-wide default)
 *   "staging" → "view"
 *   "mart" → "table"
 *   "mart/user" → "incremental"
 */
function parseDbtProjectYml(content: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = content.split('\n');

  let inModels = false;
  // Stack entries: { indent, name } — name is '' for the project root entry
  const stack: Array<{ indent: number; name: string }> = [];

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;

    const indent = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();

    if (trimmed === 'models:') {
      inModels = true;
      stack.length = 0;
      continue;
    }
    if (!inModels) continue;

    // If we've stepped back in indentation, pop the stack
    while (stack.length && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (trimmed.startsWith('+materialized:')) {
      const mat = trimmed.split(':')[1]?.trim().replace(/['"]/g, '').split('#')[0].trim();
      if (mat) {
        // Build folder path from stack — skip the first entry (project name)
        const folderPath = stack.slice(1).map((s) => s.name).join('/');
        result.set(folderPath, mat);
      }
    } else if (!trimmed.startsWith('+') && trimmed.includes(':')) {
      const name = trimmed.split(':')[0].trim();
      if (name) stack.push({ indent, name });
    }
  }

  return result;
}
