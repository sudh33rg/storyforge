/**
 * VS Code Webview API bridge.
 *
 * acquireVsCodeApi() is injected by the VS Code webview host.
 * This module wraps it for type-safe messaging.
 */

import type { WebviewRequest } from '../../src/shared/protocol';

interface VsCodeApi {
  postMessage(message: WebviewRequest): void;
  getState(): unknown;
  setState(state: unknown): void;
}

// Global declaration for VS Code Webview host injection
declare function acquireVsCodeApi(): VsCodeApi;

function getVsCodeApi(): VsCodeApi {
  try {
    if (typeof acquireVsCodeApi === 'function') {
      return acquireVsCodeApi();
    }
  } catch {}

  try {
    if (typeof window !== 'undefined' && typeof (window as any).acquireVsCodeApi === 'function') {
      return (window as any).acquireVsCodeApi();
    }
  } catch {}

  return {
    postMessage: (msg: WebviewRequest) => console.log('[mock] postMessage', msg),
    getState: () => null,
    setState: () => {},
  };
}

export const vscode: VsCodeApi = getVsCodeApi();

