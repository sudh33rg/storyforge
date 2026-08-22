import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebviewController } from '../../src/extension/webviewController.js';
import { IntelligenceEngine } from '../../src/intelligence/engine.js';
import * as vscode from 'vscode';

vi.mock('vscode');

describe('WebviewController Extension Integration', () => {
  let engine: IntelligenceEngine;
  let context: any;
  let createdPanel: any;

  beforeEach(() => {
    createdPanel = {
      reveal: vi.fn(),
      webview: {
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: vi.fn(),
        asWebviewUri: vi.fn((uri) => uri.fsPath || uri.path || 'vscode-webview://test'),
        cspSource: 'vscode-webview:',
      },
      onDidDispose: vi.fn(),
      visible: true,
    };

    (vscode.window as any).createWebviewPanel = vi.fn(() => createdPanel);
    (vscode.Uri as any).joinPath = vi.fn((base, ...paths) => ({
      fsPath: `${base.fsPath}/${paths.join('/')}`,
      path: `${base.path}/${paths.join('/')}`,
      scheme: 'vscode-resource',
    }));

    context = {
      extensionUri: { fsPath: '/test/extension', path: '/test/extension', scheme: 'file' },
      subscriptions: [],
    };

    engine = new IntelligenceEngine({
      workspaceRoot: '/test',
      workspaceName: 'test-workspace',
      autoScan: false,
    });
  });

  it('should create and open the webview panel when open() is invoked', () => {
    const controller = new WebviewController(context, engine);
    controller.open();

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      'storyforge.dashboard',
      'StoryForge',
      expect.anything(),
      expect.objectContaining({
        enableScripts: true,
        retainContextWhenHidden: true,
      }),
    );

    expect(createdPanel.webview.html).toContain('<!DOCTYPE html>');
    expect(createdPanel.webview.html).toContain('<div id="root"></div>');
    expect(createdPanel.webview.html).toContain('__STORYFORGE_INITIAL_SNAPSHOT__');
    expect(createdPanel.webview.html).toContain('webview.js');
    expect(createdPanel.webview.html).toContain('webview.css');
  });

  it('should reveal existing panel if already opened', () => {
    const controller = new WebviewController(context, engine);
    controller.open();
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);

    controller.open();
    expect(createdPanel.reveal).toHaveBeenCalledTimes(1);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
  });

  it('should post initial snapshot upon opening', () => {
    const controller = new WebviewController(context, engine);
    controller.open();

    expect(createdPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/snapshot',
        snapshot: expect.objectContaining({
          activeView: 'intelligence',
        }),
      }),
    );
  });

  it('should expose indexing state immediately when auto-scan is active', () => {
    const scanningEngine = new IntelligenceEngine({
      workspaceRoot: '/test',
      workspaceName: 'test-workspace',
      autoScan: true,
    });
    const controller = new WebviewController(context, scanningEngine);
    controller.open();

    expect(createdPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/snapshot',
        snapshot: expect.objectContaining({
          intelligence: expect.objectContaining({ state: 'indexing' }),
        }),
      }),
    );
    expect(createdPanel.webview.html).toContain('"state":"indexing"');
  });
});
