// Type declaration for the VS Code webview API injected at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
