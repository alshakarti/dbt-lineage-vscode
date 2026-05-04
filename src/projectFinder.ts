import * as path from 'path';
import * as vscode from 'vscode';
import type { LineageGraph } from './types';

/**
 * Find the nearest dbt project root in the workspace by locating dbt_project.yml.
 * Prefers the workspace folder root; falls back to a recursive search.
 */
export async function findDbtProjectRoot(): Promise<vscode.Uri | undefined> {
  const overridePath = vscode.workspace
    .getConfiguration('dbtLineage')
    .get<string>('manifestPath');

  if (overridePath) {
    // User specified a manifest path directly; derive project root from its parent
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (workspaceRoot) {
      const absManifest = path.isAbsolute(overridePath)
        ? vscode.Uri.file(overridePath)
        : vscode.Uri.joinPath(workspaceRoot, overridePath);
      return vscode.Uri.joinPath(absManifest, '..', '..');
    }
  }

  // Search for dbt_project.yml files, excluding common non-project directories
  const candidates = await vscode.workspace.findFiles(
    '**/dbt_project.yml',
    '**/{node_modules,.venv,venv,.git}/**',
    5,
  );

  if (!candidates.length) return undefined;

  // Sort by path depth (fewer segments = closer to root = preferred)
  candidates.sort((a, b) => {
    const depthA = a.path.split('/').length;
    const depthB = b.path.split('/').length;
    return depthA - depthB;
  });

  // Return directory containing the nearest dbt_project.yml
  return vscode.Uri.joinPath(candidates[0], '..');
}

/**
 * Locate manifest.json relative to a dbt project root.
 * Checks target/manifest.json by default, or the configured manifestPath.
 */
export async function findManifest(
  projectRoot: vscode.Uri,
): Promise<vscode.Uri | undefined> {
  const overridePath = vscode.workspace
    .getConfiguration('dbtLineage')
    .get<string>('manifestPath');

  let manifestUri: vscode.Uri;

  if (overridePath) {
    manifestUri = path.isAbsolute(overridePath)
      ? vscode.Uri.file(overridePath)
      : vscode.Uri.joinPath(projectRoot, overridePath);
  } else {
    manifestUri = vscode.Uri.joinPath(projectRoot, 'target', 'manifest.json');
  }

  try {
    await vscode.workspace.fs.stat(manifestUri);
    return manifestUri;
  } catch {
    return undefined;
  }
}

/**
 * Map an open .sql file URI to its corresponding node ID in the lineage graph.
 * Tries an exact path match first, then a filename-only fallback.
 */
export function fileUriToNodeId(
  fileUri: vscode.Uri,
  projectRoot: vscode.Uri,
  graph: LineageGraph,
): string | undefined {
  // Compute the relative path from the project root
  const absPath = fileUri.fsPath;
  const rootPath = projectRoot.fsPath;

  let relativePath = absPath.startsWith(rootPath)
    ? absPath.slice(rootPath.length).replace(/^[/\\]/, '')
    : absPath;

  // Normalize to forward slashes for cross-platform matching
  relativePath = relativePath.replace(/\\/g, '/');

  // Exact match on original_file_path
  for (const node of Object.values(graph.nodes)) {
    if (node.path && node.path.replace(/\\/g, '/') === relativePath) {
      return node.id;
    }
  }

  // Fallback: match by filename stem (e.g. stg_users.sql → stg_users)
  const stem = path.basename(absPath, '.sql');
  for (const node of Object.values(graph.nodes)) {
    if (node.resourceType !== 'source' && node.name === stem) {
      return node.id;
    }
  }

  return undefined;
}
