/**
 * StoryForge VS Code Extension — Entry Point
 *
 * Activates the intelligence engine, registers commands, views,
 * and the @storyforge Copilot Chat participant.
 *
 * Architecture principle: the extension is a CONSUMER of Intelligence.
 * It does not contain intelligence. It exposes it.
 */

import * as vscode from 'vscode';
import { IntelligenceEngine } from '../intelligence/engine.js';
import { configureLogger } from '../shared/logger.js';
import { registerCommands } from './commands.js';
import { registerCopilotParticipant } from './copilotParticipant.js';
import { IntelligenceTreeProvider, WorkflowTreeProvider } from './treeViews.js';
import { VscLspBridge } from './vscLspBridge.js';
import { VscLlmProvider } from './vscLlmProvider.js';
import { WorkflowEngine } from '../core/workflow/workflowEngine.js';
import { WebviewController } from './webviewController.js';

let engine: IntelligenceEngine | undefined;
let workflowEngine: WorkflowEngine | undefined;
let webviewController: WebviewController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Set up logging
  const outputChannel = vscode.window.createOutputChannel('StoryForge', { log: true });
  configureLogger(outputChannel, 'info');
  outputChannel.appendLine('StoryForge activating...');

  // Get workspace root
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    outputChannel.appendLine('No workspace folder found. StoryForge requires an open workspace.');
    return;
  }

  // Read configuration
  const config = vscode.workspace.getConfiguration('storyforge');
  const autoScan = config.get<boolean>('intelligence.autoScan', true);
  const excludePatterns = config.get<string[]>('intelligence.excludePatterns', [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/vendor/**',
    '**/target/**',
    '**/__pycache__/**',
    '**/.storyforge/**',
  ]);
  const maxFileSize = config.get<number>('intelligence.maxFileSize', 524288);

  // Create LSP and LLM Bridges
  const lspBridge = new VscLspBridge();
  const llmProvider = new VscLlmProvider();

  // Create the intelligence engine
  engine = new IntelligenceEngine({
    workspaceRoot: workspaceFolder.uri.fsPath,
    workspaceName: workspaceFolder.name,
    excludePatterns,
    maxFileSize,
    autoScan,
    lspBridge,
  });

  // Create Workflow Engine
  workflowEngine = new WorkflowEngine(engine, llmProvider);

  // Create Webview Controller
  webviewController = new WebviewController(context, engine, workflowEngine);

  // Register tree view providers
  const intelligenceTree = new IntelligenceTreeProvider(engine);
  const workflowTree = new WorkflowTreeProvider(workflowEngine);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('storyforge.intelligence', intelligenceTree),
    vscode.window.registerTreeDataProvider('storyforge.workflow', workflowTree),
  );

  // Register commands
  registerCommands(context, engine, intelligenceTree, webviewController);

  // Register Copilot Chat participant
  registerCopilotParticipant(context, engine, workflowEngine);

  // Set up multi-language file watcher for incremental updates & staleness auditing
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx,java,cs,py,go,rs,cpp,hpp,sql,yaml,yml,json,md,dockerfile}');

  fileWatcher.onDidChange(async (uri) => {
    await engine?.handleFileChange(uri.fsPath);
    workflowEngine?.auditWorkflows([uri.fsPath]);
    intelligenceTree.refresh();
    workflowTree.refresh();
  });

  fileWatcher.onDidCreate(async (uri) => {
    await engine?.handleFileChange(uri.fsPath);
    intelligenceTree.refresh();
    workflowTree.refresh();
  });

  fileWatcher.onDidDelete(async (uri) => {
    await engine?.handleFileDeletion(uri.fsPath);
    workflowEngine?.auditWorkflows([uri.fsPath]);
    intelligenceTree.refresh();
    workflowTree.refresh();
  });

  context.subscriptions.push(fileWatcher);

  // Live in-memory keystroke streaming (debounced at 300ms)
  let liveChangeTimer: NodeJS.Timeout | undefined;
  const docWatcher = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.scheme !== 'file') return;
    if (liveChangeTimer) clearTimeout(liveChangeTimer);

    liveChangeTimer = setTimeout(() => {
      engine?.handleDocumentChange(event.document.uri.fsPath, event.document.getText());
    }, 300);
  });
  context.subscriptions.push(docWatcher);

  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = '$(beaker) StoryForge';
  statusBar.tooltip = 'StoryForge Intelligence';
  statusBar.command = 'storyforge.showStatus';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Update status bar and webview based on engine state
  engine.onEvent(({ type, data }) => {
    const status = engine!.getStatus();
    switch (status.state) {
      case 'scanning':
        statusBar.text = '$(sync~spin) StoryForge: Scanning...';
        break;
      case 'analyzing':
        statusBar.text = '$(sync~spin) StoryForge: Analyzing...';
        break;
      case 'ready':
        statusBar.text = `$(beaker) StoryForge: Gen ${status.generation}`;
        statusBar.tooltip = `StoryForge Intelligence — Generation ${status.generation}\n${status.graphStats.nodeCount} nodes, ${status.graphStats.edgeCount} edges`;
        break;
      case 'updating':
        statusBar.text = '$(sync~spin) StoryForge: Updating...';
        break;
      case 'error':
        statusBar.text = '$(error) StoryForge: Error';
        break;
      default:
        statusBar.text = '$(beaker) StoryForge';
    }
    intelligenceTree.refresh();
    workflowTree.refresh();
    // Push snapshot update to webview if visible
    if (webviewController?.isVisible) {
      webviewController.postSnapshot();
    }
  });

  // Initialize the engine (will auto-scan if configured)
  outputChannel.appendLine('Initializing intelligence engine...');
  try {
    await engine.initialize();
    outputChannel.appendLine(`Intelligence ready. Generation: ${engine.getStatus().generation}`);
  } catch (err) {
    outputChannel.appendLine(`Intelligence initialization failed: ${err}`);
    vscode.window.showErrorMessage(`StoryForge intelligence initialization failed: ${err}`);
  }

  outputChannel.appendLine('StoryForge activated.');
}

export function deactivate(): void {
  // Save intelligence on deactivation
  engine?.save().catch(() => {
    // Best-effort save
  });
}
