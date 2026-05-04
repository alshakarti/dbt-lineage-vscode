import * as vscode from 'vscode';
import { LineagePanel } from './lineagePanel';
import { disposeLogger, log } from './logger';

export function activate(context: vscode.ExtensionContext): void {
  log('dbt Lineage extension activating...');
  const panel = new LineagePanel(context.extensionUri, context);

  // Register the sidebar webview view provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('dbtLineage.view', panel, {
      // Keep the webview alive when the sidebar is hidden — avoids losing
      // React state and re-parsing the graph on every sidebar open.
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Initialize: find the dbt project, load manifest, set up watchers
  panel.initialize();

  // Track active editor changes to auto-focus the lineage view
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.uri.path.endsWith('.sql')) {
        panel.setFocusedFile(editor.document.uri);
      }
    }),
  );

  // Apply focus for the file that's already open when the extension activates
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document.uri.path.endsWith('.sql')) {
    panel.setFocusedFile(activeEditor.document.uri);
  }

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('dbtLineage.focusCurrent', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor?.document.uri.path.endsWith('.sql')) {
        panel.setFocusedFile(editor.document.uri);
        // Bring the lineage sidebar into view
        vscode.commands.executeCommand('dbtLineage.view.focus');
      } else {
        vscode.window.showInformationMessage(
          'dbt Lineage: Open a dbt model .sql file to focus the lineage view.',
        );
      }
    }),

    vscode.commands.registerCommand('dbtLineage.showFullProject', () => {
      panel.showFullProject();
      vscode.commands.executeCommand('dbtLineage.view.focus');
    }),

    vscode.commands.registerCommand('dbtLineage.refresh', () => {
      panel.refresh();
    }),
  );

  context.subscriptions.push({ dispose: () => panel.dispose() });
  context.subscriptions.push({ dispose: () => disposeLogger() });
  log('dbt Lineage extension activated');
}

export function deactivate(): void {}
