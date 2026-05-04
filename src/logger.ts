import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getLogger(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('dbt Lineage');
  }
  return channel;
}

export function log(msg: string): void {
  getLogger().appendLine(`[${new Date().toISOString()}] ${msg}`);
}

export function disposeLogger(): void {
  channel?.dispose();
  channel = undefined;
}
