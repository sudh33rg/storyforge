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

// @ts-expect-error acquireVsCodeApi is injected by the VS Code webview host
export const vscode: VsCodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : {
  postMessage: (msg: WebviewRequest) => console.log('[mock] postMessage', msg),
  getState: () => null,
  setState: () => {},
};
