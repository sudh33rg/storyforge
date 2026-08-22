/**
 * StoryForge Tree Views
 *
 * Sidebar tree data providers for the StoryForge activity bar:
 * - Intelligence Tree: browse the knowledge graph hierarchy
 * - Workflow Tree: track active features through the pipeline
 */

import * as vscode from 'vscode';
import type { IntelligenceEngine } from '../intelligence/engine.js';

// ─── Intelligence Tree ───────────────────────────────────────────────────────

export class IntelligenceTreeProvider implements vscode.TreeDataProvider<IntelligenceTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<IntelligenceTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly engine: IntelligenceEngine) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: IntelligenceTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: IntelligenceTreeItem): IntelligenceTreeItem[] {
    if (!element) {
      return this.getRootItems();
    }

    if (element.contextValue === 'status') {
      return this.getStatusChildren();
    }

    if (element.contextValue === 'graph') {
      return this.getGraphChildren();
    }

    if (element.contextValue === 'nodeType') {
      return this.getNodeTypeChildren(element.nodeType!);
    }

    return [];
  }

  private getRootItems(): IntelligenceTreeItem[] {
    const status = this.engine.getStatus();

    return [
      new IntelligenceTreeItem(
        `Status: ${status.state}`,
        vscode.TreeItemCollapsibleState.Expanded,
        'status',
        status.state === 'ready' ? 'check' : status.state === 'scanning' ? 'sync~spin' : 'circle-outline',
      ),
      new IntelligenceTreeItem(
        `Knowledge Graph`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'graph',
        'type-hierarchy',
      ),
    ];
  }

  private getStatusChildren(): IntelligenceTreeItem[] {
    const status = this.engine.getStatus();
    const items: IntelligenceTreeItem[] = [];

    items.push(new IntelligenceTreeItem(
      `Generation: ${status.generation}`,
      vscode.TreeItemCollapsibleState.None,
      'info',
      'versions',
    ));

    items.push(new IntelligenceTreeItem(
      `Files: ${status.fileCount}`,
      vscode.TreeItemCollapsibleState.None,
      'info',
      'file',
    ));

    items.push(new IntelligenceTreeItem(
      `Nodes: ${status.graphStats.nodeCount}`,
      vscode.TreeItemCollapsibleState.None,
      'info',
      'symbol-class',
    ));

    items.push(new IntelligenceTreeItem(
      `Edges: ${status.graphStats.edgeCount}`,
      vscode.TreeItemCollapsibleState.None,
      'info',
      'git-merge',
    ));

    if (status.lastScanDuration) {
      items.push(new IntelligenceTreeItem(
        `Last scan: ${(status.lastScanDuration / 1000).toFixed(1)}s`,
        vscode.TreeItemCollapsibleState.None,
        'info',
        'clock',
      ));
    }

    return items;
  }

  private getGraphChildren(): IntelligenceTreeItem[] {
    const stats = this.engine.getStatus().graphStats;
    const items: IntelligenceTreeItem[] = [];

    for (const [type, count] of Object.entries(stats.nodesByType)) {
      if (count > 0) {
        const item = new IntelligenceTreeItem(
          `${type} (${count})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'nodeType',
          this.getIconForNodeType(type),
        );
        item.nodeType = type;
        items.push(item);
      }
    }

    return items.sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
  }

  private getNodeTypeChildren(nodeType: string): IntelligenceTreeItem[] {
    const graph = this.engine.getGraph();
    const nodes = graph.getNodesByType(nodeType as any);

    return nodes.slice(0, 50).map((node) => {
      const data = node.data as { filePath?: string; path?: string };
      const description = data.filePath || data.path || node.qualifiedName;

      return new IntelligenceTreeItem(
        node.name,
        vscode.TreeItemCollapsibleState.None,
        'node',
        this.getIconForNodeType(nodeType),
        description,
      );
    });
  }

  private getIconForNodeType(type: string): string {
    switch (type) {
      case 'repository': return 'repo';
      case 'project': return 'project';
      case 'application': return 'window';
      case 'service': return 'server';
      case 'module': return 'package';
      case 'component': return 'symbol-class';
      case 'file': return 'file-code';
      case 'symbol': return 'symbol-method';
      case 'concept': return 'lightbulb';
      case 'api-endpoint': return 'globe';
      case 'test-suite': return 'beaker';
      case 'configuration': return 'settings-gear';
      case 'external-dependency': return 'extensions';
      default: return 'circle-outline';
    }
  }
}

class IntelligenceTreeItem extends vscode.TreeItem {
  nodeType?: string;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    iconId: string,
    description?: string,
  ) {
    super(label, collapsibleState);
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.description = description;
  }
}

// ─── Workflow Tree ───────────────────────────────────────────────────────────

import type { WorkflowEngine } from '../core/workflow/workflowEngine.js';
import type { WorkflowState, UserStory, QaStory, AcceptanceCriterion, QaScenario } from '../core/workflow/workflowTypes.js';

export class WorkflowTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly workflowEngine?: WorkflowEngine) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!this.workflowEngine) {
      return [new vscode.TreeItem('Workflow engine not initialized')];
    }

    if (!element) {
      const workflows = this.workflowEngine.getAllWorkflows();
      if (workflows.length === 0) {
        const item = new vscode.TreeItem(
          'No active workflows',
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = 'Use @storyforge /discover to start';
        item.iconPath = new vscode.ThemeIcon('info');
        return [item];
      }

      return workflows.map((wf) => {
        const title = wf.featureInput?.title || wf.id;
        const item = new vscode.TreeItem(
          title,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.description = `Phase: ${wf.phase}`;
        item.iconPath = new vscode.ThemeIcon(wf.phase === 'story-review' ? 'verified' : 'beaker');
        (item as any).workflowId = wf.id;
        (item as any).contextValue = 'workflow';
        return item;
      });
    }

    const item = element as any;

    if (item.contextValue === 'workflow') {
      const wf = this.workflowEngine.getWorkflow(item.workflowId);
      if (!wf) return [];

      const children: vscode.TreeItem[] = [];

      // Discovery node
      if (wf.discoveryContext) {
        const discItem = new vscode.TreeItem(
          `Discovery (${wf.discoveryContext.approvalStatus})`,
          vscode.TreeItemCollapsibleState.None,
        );
        discItem.description = `${wf.discoveryContext.affectedAreas.length} area(s), ${(wf.discoveryContext.repositoryUnderstanding.confidence.overall * 100).toFixed(0)}% conf`;
        discItem.iconPath = new vscode.ThemeIcon('microscope');
        children.push(discItem);
      }

      // User stories node
      if (wf.stories && wf.stories.length > 0) {
        const storiesContainer = new vscode.TreeItem(
          `User Stories (${wf.stories.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        storiesContainer.iconPath = new vscode.ThemeIcon('bookmark');
        (storiesContainer as any).workflowId = wf.id;
        (storiesContainer as any).contextValue = 'storiesContainer';
        children.push(storiesContainer);
      }

      // QA stories node
      if (wf.qaStories && wf.qaStories.length > 0) {
        const qaContainer = new vscode.TreeItem(
          `QA Stories (${wf.qaStories.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        qaContainer.iconPath = new vscode.ThemeIcon('checklist');
        (qaContainer as any).workflowId = wf.id;
        (qaContainer as any).contextValue = 'qaContainer';
        children.push(qaContainer);
      }

      return children;
    }

    if (item.contextValue === 'storiesContainer') {
      const wf = this.workflowEngine.getWorkflow(item.workflowId);
      if (!wf || !wf.stories) return [];

      return wf.stories.map((story) => {
        const storyItem = new vscode.TreeItem(
          `[${story.id}] ${story.title}`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        storyItem.description = `${story.storyPoints ?? 3} pts | ${story.status}`;
        storyItem.iconPath = new vscode.ThemeIcon('file-code');
        (storyItem as any).story = story;
        (storyItem as any).contextValue = 'storyItem';
        return storyItem;
      });
    }

    if (item.contextValue === 'storyItem') {
      const story = item.story as UserStory;
      if (!story) return [];

      return story.acceptanceCriteria.map((ac) => {
        const acItem = new vscode.TreeItem(
          `${ac.id}: Given ${ac.given.slice(0, 30)}...`,
          vscode.TreeItemCollapsibleState.None,
        );
        acItem.description = `Then ${ac.then.slice(0, 30)}...`;
        acItem.iconPath = new vscode.ThemeIcon('check');
        return acItem;
      });
    }

    if (item.contextValue === 'qaContainer') {
      const wf = this.workflowEngine.getWorkflow(item.workflowId);
      if (!wf || !wf.qaStories) return [];

      return wf.qaStories.map((qa) => {
        const qaItem = new vscode.TreeItem(
          `[${qa.id}] ${qa.title}`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        qaItem.description = `${qa.scenarios.length} scenario(s)`;
        qaItem.iconPath = new vscode.ThemeIcon('beaker');
        (qaItem as any).qaStory = qa;
        (qaItem as any).contextValue = 'qaItem';
        return qaItem;
      });
    }

    if (item.contextValue === 'qaItem') {
      const qa = item.qaStory as QaStory;
      if (!qa) return [];

      return qa.scenarios.map((sc) => {
        const scItem = new vscode.TreeItem(
          `${sc.id}: ${sc.name}`,
          vscode.TreeItemCollapsibleState.None,
        );
        scItem.description = `[${sc.testType}] Expect: ${sc.expectedResult.slice(0, 30)}...`;
        scItem.iconPath = new vscode.ThemeIcon('pass');
        return scItem;
      });
    }

    return [];
  }
}
