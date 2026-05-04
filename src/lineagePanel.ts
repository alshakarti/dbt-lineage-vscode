import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { LiveParser } from './liveParser';
import { log } from './logger';
import { ManifestParser } from './manifestParser';
import { fileUriToNodeId, findDbtProjectRoot, findManifest } from './projectFinder';
import type { ExtToWebviewMessage, LineageGraph, WebviewToExtMessage } from './types';

export class LineagePanel implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private graph?: LineageGraph;
  private projectRoot?: vscode.Uri;
  private currentNodeId?: string;
  private manifestWatcher?: vscode.FileSystemWatcher;
  private liveParser?: LiveParser;
  private manifestDebounce?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {}

  // ── WebviewViewProvider ──────────────────────────────────────────────────

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    log('Webview view resolved — panel is visible');
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (msg: WebviewToExtMessage) => this.handleWebviewMessage(msg),
      undefined,
      this.context.subscriptions,
    );
  }

  // ── Public API (called from extension.ts) ────────────────────────────────

  async initialize(): Promise<void> {
    log('Initializing — searching for dbt_project.yml...');
    this.projectRoot = await findDbtProjectRoot();

    if (!this.projectRoot) {
      log('ERROR: No dbt project found — dbt_project.yml not located in workspace');
      this.post({ type: 'error', message: 'No dbt project found (dbt_project.yml not located).' });
      return;
    }

    log(`Found dbt project root: ${this.projectRoot.fsPath}`);
    await this.loadManifest();
    this.setupManifestWatcher();
    this.setupLiveParserIfEnabled();

    // Push depth setting changes to the webview in real-time
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('dbtLineage.defaultDepth')) {
        this.post({ type: 'depthChanged', depth: this.getDepthSetting() });
      }
    }, undefined, this.context.subscriptions);
  }

  setFocusedFile(fileUri: vscode.Uri): void {
    if (!this.graph || !this.projectRoot) return;
    const nodeId = fileUriToNodeId(fileUri, this.projectRoot, this.graph);
    if (nodeId && nodeId !== this.currentNodeId) {
      this.currentNodeId = nodeId;
      this.post({ type: 'focus', nodeId });
    }
  }

  async refresh(): Promise<void> {
    await this.loadManifest();
  }

  showFullProject(): void {
    // Relay to webview to switch view mode
    if (this.graph) {
      this.post({ type: 'graphUpdated', graph: this.graph });
    }
  }

  dispose(): void {
    clearTimeout(this.manifestDebounce);
    this.manifestWatcher?.dispose();
    this.liveParser?.dispose();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async handleWebviewMessage(msg: WebviewToExtMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        log('Webview ready — sending current state');
        this.sendCurrentState();
        break;

      case 'openFile':
        this.openInEditor(msg.path);
        break;

      case 'requestFocus': {
        const editor = vscode.window.activeTextEditor;
        if (editor) this.setFocusedFile(editor.document.uri);
        break;
      }
    }
  }

  private getDepthSetting(): number {
    return vscode.workspace
      .getConfiguration('dbtLineage')
      .get<number>('defaultDepth', 3);
  }

  private sendCurrentState(): void {
    if (this.graph) {
      this.post({
        type: 'init',
        graph: this.graph,
        focusedNodeId: this.currentNodeId ?? null,
        depth: this.getDepthSetting(),
      });
    } else {
      this.post({ type: 'loading' });
    }
  }

  private async loadManifest(): Promise<void> {
    if (!this.projectRoot) return;

    const manifestUri = await findManifest(this.projectRoot);

    if (!manifestUri) {
      log('ERROR: No manifest.json found in target/. Run dbt parse or dbt run first.');
      this.post({
        type: 'error',
        message:
          "No manifest.json found in target/. Run `dbt parse` or `dbt run` to generate it.",
      });
      return;
    }

    log(`Loading manifest: ${manifestUri.fsPath}`);
    try {
      this.post({ type: 'loading' });
      const bytes = await vscode.workspace.fs.readFile(manifestUri);
      const raw = Buffer.from(bytes).toString('utf8');
      let graph = ManifestParser.parse(raw);

      log(`Parsed graph: ${Object.keys(graph.nodes).length} nodes (project: ${graph.projectName})`);

      // If live parser is running, merge its edges on top
      if (this.liveParser) {
        graph = this.liveParser.mergeInto(graph);
        log('Merged live parser edges into manifest graph');
      }

      this.graph = graph;
      this.post({ type: 'graphUpdated', graph });

      // Re-apply focus if an editor is open
      const editor = vscode.window.activeTextEditor;
      if (editor?.document.uri.path.endsWith('.sql')) {
        this.setFocusedFile(editor.document.uri);
      }
    } catch (err) {
      log(`ERROR parsing manifest: ${String(err)}`);
      this.post({
        type: 'error',
        message: `Failed to parse manifest.json: ${String(err)}`,
      });
    }
  }

  private setupManifestWatcher(): void {
    if (!this.projectRoot) return;

    this.manifestWatcher?.dispose();

    const pattern = new vscode.RelativePattern(
      this.projectRoot,
      'target/manifest.json',
    );

    this.manifestWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    const reload = () => {
      clearTimeout(this.manifestDebounce);
      this.manifestDebounce = setTimeout(() => this.loadManifest(), 300);
    };

    this.manifestWatcher.onDidChange(reload, undefined, this.context.subscriptions);
    this.manifestWatcher.onDidCreate(reload, undefined, this.context.subscriptions);
    this.context.subscriptions.push(this.manifestWatcher);
  }

  private setupLiveParserIfEnabled(): void {
    const enabled = vscode.workspace
      .getConfiguration('dbtLineage')
      .get<boolean>('enableLiveParser', false);

    if (!enabled || !this.projectRoot) return;

    this.liveParser?.dispose();
    this.liveParser = new LiveParser(this.projectRoot);

    const applyLive = () => {
      if (this.graph && this.liveParser) {
        const merged = this.liveParser.mergeInto(this.graph);
        this.graph = merged;
        this.post({ type: 'graphUpdated', graph: merged });
      }
    };

    // Initial scan: push results to the webview as soon as all files are parsed
    this.liveParser.initialize().then(applyLive).catch(() => {/* silently ignore */});

    // Subsequent saves: re-merge on every file change
    this.liveParser.startWatching(applyLive);

    // Re-init live parser when setting changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('dbtLineage.enableLiveParser')) {
        this.liveParser?.dispose();
        this.liveParser = undefined;
        this.setupLiveParserIfEnabled();
      }
    }, undefined, this.context.subscriptions);
  }

  private openInEditor(relativePath: string): void {
    if (!this.projectRoot) return;
    const uri = vscode.Uri.joinPath(this.projectRoot, relativePath);
    vscode.workspace.openTextDocument(uri).then(
      (doc) => vscode.window.showTextDocument(doc),
      () => {
        // Try absolute path as fallback
        vscode.workspace
          .openTextDocument(vscode.Uri.file(relativePath))
          .then((doc) => vscode.window.showTextDocument(doc));
      },
    );
  }

  private post(msg: ExtToWebviewMessage): void {
    this.view?.webview.postMessage(msg);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css'),
    );
    const nonce = crypto.randomBytes(16).toString('hex');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}';
             style-src 'unsafe-inline' ${webview.cspSource};
             img-src ${webview.cspSource} data:;
             font-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>dbt Lineage</title>
  <style>
    html, body, #root {
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
