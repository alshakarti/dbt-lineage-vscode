import { useCallback, useEffect } from 'react';
import type { ExtToWebviewMessage, WebviewToExtMessage } from '../../types';

// acquireVsCodeApi() can only be called once per webview session.
// Lazy-initialize here so the module can also be imported in tests
// outside of a webview context (where the global doesn't exist).
let _vscode: ReturnType<typeof acquireVsCodeApi> | undefined;

function getVscode() {
  if (!_vscode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _vscode = (window as any).acquireVsCodeApi?.();
  }
  return _vscode;
}

export function useVscodeMessages(
  onMessage: (msg: ExtToWebviewMessage) => void,
): { send: (msg: WebviewToExtMessage) => void } {
  useEffect(() => {
    const handler = (event: MessageEvent<ExtToWebviewMessage>) => {
      onMessage(event.data);
    };
    window.addEventListener('message', handler);

    // Signal to the extension host that the webview is ready to receive messages
    getVscode()?.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
    // onMessage is intentionally excluded — caller should use useCallback/stable refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((msg: WebviewToExtMessage) => {
    getVscode()?.postMessage(msg);
  }, []);

  return { send };
}
