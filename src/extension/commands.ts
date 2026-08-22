/**
 * StoryForge Commands
 *
 * VS Code command registrations for the extension.
 */

import * as vscode from 'vscode';
import type { IntelligenceEngine } from '../intelligence/engine.js';
import type { IntelligenceTreeProvider } from './treeViews.js';
import type { WebviewController } from './webviewController.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('extension:commands');

export function registerCommands(
  context: vscode.ExtensionContext,
  engine: IntelligenceEngine,
  intelligenceTree: IntelligenceTreeProvider,
  webviewController?: WebviewController,
): void {
  // Refresh Intelligence
  context.subscriptions.push(
    vscode.commands.registerCommand('storyforge.refreshIntelligence', async () => {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'StoryForge: Scanning repository...',
            cancellable: false,
          },
          async () => {
            await engine.performFullScan();
            intelligenceTree.refresh();
          },
        );
        vscode.window.showInformationMessage(
          `StoryForge: Intelligence refreshed (Generation ${engine.getStatus().generation})`,
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `StoryForge: Scan failed — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  // Open / Show Dashboard
  context.subscriptions.push(
    vscode.commands.registerCommand('storyforge.open', () => {
      webviewController?.open();
    }),
    vscode.commands.registerCommand('storyforge.showDashboard', () => {
      webviewController?.open();
    }),
  );

  // Show Status
  context.subscriptions.push(
    vscode.commands.registerCommand('storyforge.showStatus', () => {
      const status = engine.getStatus();
      const stats = status.graphStats;

      const items = [
        `State: ${status.state}`,
        `Generation: ${status.generation}`,
        `Nodes: ${stats.nodeCount}`,
        `Edges: ${stats.edgeCount}`,
        `Files: ${status.fileCount}`,
      ];

      if (status.lastScanDuration) {
        items.push(`Last scan: ${(status.lastScanDuration / 1000).toFixed(1)}s`);
      }

      if (status.architectureReport) {
        items.push(`Architecture: ${status.architectureReport.summary}`);
      }

      vscode.window.showInformationMessage(
        `StoryForge Intelligence: ${items.join(' | ')}`,
      );
    }),
  );

  // Start Discovery
  context.subscriptions.push(
    vscode.commands.registerCommand('storyforge.startDiscovery', async () => {
      const featureRequest = await vscode.window.showInputBox({
        prompt: 'Describe the feature you want to discover',
        placeHolder: 'e.g., Add load test scheduling to the configuration page',
      });

      if (featureRequest) {
        // Open Copilot Chat with the discovery command
        await vscode.commands.executeCommand(
          'workbench.action.chat.open',
          `@storyforge /discover ${featureRequest}`,
        );
      }
    }),
  );

  // Analyze Impact
  context.subscriptions.push(
    vscode.commands.registerCommand('storyforge.analyzeImpact', async () => {
      const component = await vscode.window.showInputBox({
        prompt: 'Enter the component name to analyze',
        placeHolder: 'e.g., UserController, AuthService',
      });

      if (component) {
        await vscode.commands.executeCommand(
          'workbench.action.chat.open',
          `@storyforge /impact ${component}`,
        );
      }
    }),
  );

  log.info('Commands registered');
}
