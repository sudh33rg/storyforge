/**
 * StoryForge Webview Controller
 *
 * Manages the webview panel lifecycle, message passing between the webview
 * and the extension host, and constructs the AppSnapshot state.
 *
 * The controller is a thin consumer of Intelligence — it does not contain
 * intelligence. It translates engine state into the webview protocol.
 */

import * as vscode from 'vscode';
import type { IntelligenceEngine } from '../intelligence/engine.js';
import type { WorkflowEngine } from '../core/workflow/workflowEngine.js';
import {
  getGraphOverview,
  expandGraphNode,
  executeGraphQuery,
  getQuerySuggestions,
  getMetricDetails,
} from '../intelligence/graph/graphExplorer.js';
import { analyzeImpact } from '../intelligence/graph/graphQuery.js';
import { enrichPrompt } from '../core/promptEnricher.js';
import {
  generateCopilotCustomization,
  applyCopilotCustomization,
} from '../core/copilotCustomization.js';
import type {
  AppSnapshot,
  DiscoveryEvidenceItem,
  DiscoveryQuestion,
  DiscoverySnapshot,
  ExtensionEvent,
  FeatureIntent,
  FeatureLifecycleSnapshot,
  IntelligenceMetrics,
  IntelligenceStatus,
  QaStorySnapshot,
  StoryGenerationSnapshot,
  UserStorySnapshot,
  ViewName,
  WebviewRequest,
} from '../shared/protocol.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('extension:webview');

export class WebviewController {
  private panel: vscode.WebviewPanel | undefined;
  private activeView: ViewName = 'intelligence';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly engine: IntelligenceEngine,
    private readonly workflowEngine?: WorkflowEngine,
  ) {
    this.engine.onEvent(() => {
      this.postSnapshot();
    });
  }

  /**
   * Open or reveal the StoryForge webview panel.
   */
  open(): void {
    try {
      if (this.panel) {
        this.panel.reveal(vscode.ViewColumn.One);
        return;
      }

      this.panel = vscode.window.createWebviewPanel(
        'storyforge.dashboard',
        'StoryForge',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
          ],
        },
      );

      this.panel.webview.html = this.getHtml(this.panel.webview);

      // Handle messages from the webview
      this.panel.webview.onDidReceiveMessage(
        (msg: WebviewRequest) => this.handleMessage(msg),
        undefined,
        this.context.subscriptions,
      );

      // Clean up on dispose
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      }, undefined, this.context.subscriptions);

      // Send initial snapshot
      this.postSnapshot();
      log.info('Webview panel opened');
    } catch (err) {
      log.error('Failed to open webview panel', err);
      vscode.window.showErrorMessage(
        `StoryForge: Failed to open dashboard — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Post the current app snapshot to the webview.
   */
  postSnapshot(): void {
    try {
      this.post({ type: 'app/snapshot', snapshot: this.buildSnapshot() });
    } catch (err) {
      log.error('Failed to build/post snapshot', err);
    }
  }

  /**
   * Send a notice message to the webview.
   */
  postNotice(message: string): void {
    this.post({ type: 'app/notice', message });
  }

  /**
   * Send an error message to the webview.
   */
  postError(message: string): void {
    this.post({ type: 'app/error', message });
  }

  /**
   * Check if the webview is currently visible.
   */
  get isVisible(): boolean {
    return this.panel?.visible ?? false;
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private post(event: ExtensionEvent): void {
    this.panel?.webview.postMessage(event);
  }

  private async handleMessage(msg: WebviewRequest): Promise<void> {
    switch (msg.type) {
      case 'app/ready':
        this.postSnapshot();
        break;

      case 'navigation/open':
        this.activeView = msg.view;
        this.postSnapshot();
        break;

      case 'intelligence/refresh':
        this.handleRefresh();
        break;

      case 'intelligence/cancel':
        this.postNotice('Cancellation not yet supported in this version.');
        break;
        
      case 'intelligence/metric-details':
        this.handleMetricDetails(msg.category);
        break;

      case 'evidence/open':
        this.openSource(msg.path, msg.line);
        break;

      case 'graph/overview':
        this.handleGraphOverview(msg.mode, msg.filters);
        break;

      case 'graph/expand':
        this.handleGraphExpand(msg.nodeId, msg.mode);
        break;

      case 'graph/query':
        this.handleGraphQuery(msg.mode, msg.text);
        break;

      case 'graph/suggestions':
        this.handleGraphSuggestions();
        break;

      case 'prompt/enrich':
        this.handlePromptEnrich(msg.prompt, msg.task, msg.rewriteLevel, msg.tokenBudget);
        break;

      case 'prompt/iterate':
        this.handlePromptIterate(msg.originalPrompt, msg.guidance, msg.task, msg.tokenBudget);
        break;

      case 'copilot/generate':
        this.handleCopilotGenerate();
        break;

      case 'copilot/apply':
        await this.handleCopilotApply(msg.artifacts);
        break;

      case 'feature/discover':
        await this.handleFeatureDiscover(msg.feature);
        break;

      case 'discovery/approve':
        await this.handleDiscoveryApprove();
        break;

      case 'discovery/iterate':
        await this.handleDiscoveryIterate(msg.guidance);
        break;

      case 'discovery/question-answer':
        this.handleQuestionAnswer(msg.questionId, msg.answer);
        break;

      case 'discovery/question-skip':
        this.handleQuestionSkip(msg.questionId, msg.skipReason);
        break;

      case 'stories/generate':
        await this.handleStoriesGenerate();
        break;

      case 'stories/add-manual':
        this.handleStoriesAddManual(msg.kind, msg.title, msg.description);
        break;

      case 'stories/approve':
        this.handleStoriesApprove(msg.storyIds);
        break;

      case 'semantic/search':
        this.handleSemanticSearch(msg.query);
        break;

      case 'graph/impact':
        this.handleGraphImpact(msg.nodeId);
        break;

      case 'graph/diff':
        this.handleGraphDiff();
        break;

      case 'intelligence/quality-metrics':
        this.handleQualityMetrics();
        break;

      case 'intelligence/doc-health':
        this.handleDocHealth();
        break;

      default:
        log.info('Unhandled webview message', { type: (msg as { type: string }).type });
        break;
    }
  }

  private handleSemanticSearch(query: string): void {
    const matches = this.engine.searchSemantic(query, 20);
    const results = matches.map((m) => ({
      name: m.node.name,
      type: m.node.type,
      qualifiedName: m.node.qualifiedName,
      filePath: (m.node.data as any)?.filePath || '',
      bm25Score: Math.round(m.bm25Score * 10) / 10,
      denseScore: Math.round(m.denseScore * 100) / 100,
      rrfScore: Math.round(m.rrfScore * 1000) / 1000,
      score: Math.round(m.score * 10) / 10,
      matchedTerms: m.matchedTerms,
    }));
    this.post({ type: 'semantic/search-response', results });
  }

  private handleGraphImpact(nodeId: string): void {
    const graph = this.engine.getGraph();
    if (!graph) {
      return;
    }

    // Try to find node by ID directly, or search by name/qualified name
    let target = graph.getNode(nodeId);
    if (!target) {
      // Search by name as fallback (user typed a symbol name)
      const allNodes = graph.getAllNodes();
      target = allNodes.find(n => n.name === nodeId || n.qualifiedName === nodeId);
    }
    if (!target) {
      this.post({
        type: 'graph/impact-response',
        result: {
          targetId: nodeId,
          targetName: nodeId,
          targetType: 'unknown',
          directImpact: [],
          transitiveImpact: [],
          affectedTests: [],
          affectedApis: [],
          totalImpacted: 0,
          riskLevel: 'low',
        },
      });
      return;
    }

    const impact = analyzeImpact(graph, target.id, 4);

    const toDto = (nodes: any[], level: 'direct' | 'transitive' | 'test' | 'api') =>
      nodes.map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        filePath: (n.data as any)?.filePath,
        impactLevel: level,
        confidence: 0.9,
      }));

    const total = impact.directImpact.length + impact.transitiveImpact.length +
      impact.affectedTests.length + impact.affectedApis.length;

    const riskLevel: 'low' | 'medium' | 'high' | 'critical' =
      total >= 20 ? 'critical' : total >= 10 ? 'high' : total >= 4 ? 'medium' : 'low';

    this.post({
      type: 'graph/impact-response',
      result: {
        targetId: target.id,
        targetName: target.name,
        targetType: target.type,
        targetPath: (target.data as any)?.filePath,
        directImpact: toDto(impact.directImpact, 'direct'),
        transitiveImpact: toDto(impact.transitiveImpact, 'transitive'),
        affectedTests: toDto(impact.affectedTests, 'test'),
        affectedApis: toDto(impact.affectedApis, 'api'),
        totalImpacted: total,
        riskLevel,
      },
    });
  }

  private handleGraphDiff(): void {
    const diff = this.engine.getGraphDiff();
    if (!diff) {
      this.post({ type: 'graph/diff-response', diff: null as any });
      return;
    }

    const sigChanges = diff.significantChanges.map(c => ({
      changeType: c.changeType,
      name: c.name,
      type: c.type,
      path: c.path,
      changedFields: undefined,
    }));

    this.post({
      type: 'graph/diff-response',
      diff: {
        fromGeneration: diff.fromGeneration,
        toGeneration: diff.toGeneration,
        nodesAdded: diff.summary.nodesAdded,
        nodesRemoved: diff.summary.nodesRemoved,
        nodesModified: diff.summary.nodesModified,
        edgesAdded: diff.summary.edgesAdded,
        edgesRemoved: diff.summary.edgesRemoved,
        netNodeChange: diff.summary.netNodeChange,
        churnRate: diff.summary.churnRate,
        changesByType: diff.changesByType,
        significantChanges: sigChanges,
        summary: `Gen ${diff.fromGeneration} → Gen ${diff.toGeneration}: +${diff.summary.nodesAdded} nodes, -${diff.summary.nodesRemoved} nodes`,
      },
    });
  }

  private handleQualityMetrics(): void {
    const report = this.engine.getQualityMetrics();
    if (!report) {
      return;
    }

    this.post({
      type: 'intelligence/quality-metrics-response',
      report: {
        maintainabilityScore: report.maintainabilityScore,
        maintainabilityGrade: report.maintainabilityGrade,
        avgCyclomaticComplexity: report.avgCyclomaticComplexity,
        p90CyclomaticComplexity: report.p90CyclomaticComplexity,
        circularDependencyCount: report.circularDependencyCount,
        hotSpots: report.hotSpots.slice(0, 10).map(h => ({
          name: h.name,
          filePath: h.filePath,
          complexity: h.complexity,
          coupling: h.coupling,
          score: h.score,
          reasons: h.reasons,
        })),
        topComplexSymbols: report.symbolComplexity.slice(0, 15).map(s => ({
          nodeId: s.nodeId,
          name: s.name,
          filePath: s.filePath,
          cyclomaticComplexity: s.cyclomaticComplexity,
          rating: s.complexityRating,
        })),
        circularDeps: report.circularDependencies.slice(0, 10).map(c => ({
          cycleNames: c.cycleNames,
          length: c.length,
          severity: c.severity,
        })),
        topIssues: report.topIssues,
        summary: report.summary,
      },
    });
  }

  private handleDocHealth(): void {
    const report = this.engine.getDocumentationHealth();
    if (!report) {
      return;
    }

    this.post({
      type: 'intelligence/doc-health-response',
      report: {
        coveragePercent: report.coveragePercent,
        grade: report.grade,
        totalAudited: report.totalEntitiesAudited,
        documentedCount: report.documentedCount,
        undocumentedCount: report.undocumentedCount,
        criticalCount: report.criticalGaps.length,
        warningCount: report.warningGaps.length,
        gaps: report.gaps.slice(0, 30).map(g => ({
          kind: g.kind,
          severity: g.severity,
          entityName: g.entityName,
          entityType: g.entityType,
          filePath: g.filePath,
          remediation: g.remediation,
        })),
        summary: report.summary,
      },
    });
  }

  private async handleFeatureDiscover(feature: FeatureIntent): Promise<void> {
    if (!this.workflowEngine) {
      this.postError('Workflow Engine not initialized.');
      return;
    }

    try {
      this.postNotice(`Starting discovery for "${feature.title}"...`);
      const keywords = [...new Set([...feature.domainTerms, ...feature.title.toLowerCase().split(/\s+/).filter((w) => w.length > 2)])];
      await this.workflowEngine.startDiscovery(feature.title, feature.description, keywords, 'webview');
      this.activeView = 'workbench';
      this.postSnapshot();
      this.postNotice('Discovery context built successfully.');
    } catch (err) {
      this.postError(`Discovery failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleDiscoveryApprove(): Promise<void> {
    if (!this.workflowEngine) return;
    const active = this.workflowEngine.getActiveWorkflow();
    if (!active) return;

    try {
      await this.workflowEngine.approveDiscovery(active.id);
      this.postSnapshot();
      this.postNotice('Discovery approved. Generating user stories and QA scenarios...');
      await this.workflowEngine.generateStories(active.id);
      this.postSnapshot();
      this.postNotice('Stories generated successfully.');
    } catch (err) {
      this.postError(`Story generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleDiscoveryIterate(guidance: string): Promise<void> {
    if (!this.workflowEngine) return;
    const active = this.workflowEngine.getActiveWorkflow();
    if (!active) return;

    try {
      await this.workflowEngine.iterateDiscovery(active.id, guidance);
      this.postSnapshot();
      this.postNotice('Discovery context updated with guidance.');
    } catch (err) {
      this.postError(`Iteration failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private handleQuestionAnswer(questionId: string, answer: string): void {
    if (!this.workflowEngine) return;
    const active = this.workflowEngine.getActiveWorkflow();
    if (!active) return;

    this.workflowEngine.answerQuestion(active.id, questionId, answer);
    this.postSnapshot();
    this.postNotice('Question answered.');
  }

  private handleQuestionSkip(questionId: string, reason: string): void {
    if (!this.workflowEngine) return;
    const active = this.workflowEngine.getActiveWorkflow();
    if (!active) return;

    this.workflowEngine.answerQuestion(active.id, questionId, `Skipped: ${reason}`);
    this.postSnapshot();
  }

  private async handleStoriesGenerate(): Promise<void> {
    if (!this.workflowEngine) return;
    const active = this.workflowEngine.getActiveWorkflow();
    if (!active) return;

    try {
      this.postNotice('Generating implementation stories and QA scenarios...');
      await this.workflowEngine.generateStories(active.id);
      this.postSnapshot();
      this.postNotice('Stories generated.');
    } catch (err) {
      this.postError(`Story generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private handleStoriesAddManual(kind: 'user' | 'qa', title: string, description: string): void {
    if (!this.workflowEngine) return;
    const active = this.workflowEngine.getActiveWorkflow();
    if (!active) return;

    this.workflowEngine.addManualStory(active.id, kind, title, description);
    this.postSnapshot();
    this.postNotice(`Added manual ${kind === 'user' ? 'User Story' : 'QA Story'}.`);
  }

  private handleStoriesApprove(storyIds: string[]): void {
    if (!this.workflowEngine) return;
    const active = this.workflowEngine.getActiveWorkflow();
    if (!active) return;

    this.workflowEngine.updateStoryStatus(active.id, storyIds, 'approved');
    this.postSnapshot();
    this.postNotice(`Accepted ${storyIds.length} story/stories.`);
  }

  private handleStoriesReject(storyIds: string[]): void {
    if (!this.workflowEngine) return;
    const active = this.workflowEngine.getActiveWorkflow();
    if (!active) return;

    this.workflowEngine.updateStoryStatus(active.id, storyIds, 'rejected');
    this.postSnapshot();
  }

  private handlePromptEnrich(prompt: string, task?: any, rewriteLevel?: any, tokenBudget?: number): void {
    const graph = this.engine.getGraph();
    const enrichment = enrichPrompt(graph, prompt, { task, rewriteLevel, tokenBudget });
    this.post({ type: 'prompt/response', enrichment });
  }

  private handlePromptIterate(originalPrompt: string, guidance: string, task?: any, tokenBudget?: number): void {
    const graph = this.engine.getGraph();
    const enrichment = enrichPrompt(graph, originalPrompt, { task, tokenBudget, guidance });
    this.post({ type: 'prompt/response', enrichment });
  }

  private handleCopilotGenerate(): void {
    const graph = this.engine.getGraph();
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? 'Workspace';
    const pack = generateCopilotCustomization(graph, workspaceName);
    this.post({ type: 'copilot/response', pack });
  }

  private async handleCopilotApply(artifacts: any[]): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      this.postError('No active workspace folder found.');
      return;
    }

    try {
      const { written, failed } = await applyCopilotCustomization(workspaceRoot, artifacts);
      this.post({ type: 'copilot/applied', written, failed });
      if (written.length > 0) {
        this.postNotice(`Applied ${written.length} Copilot customization file(s) to .github/!`);
      }
    } catch (err) {
      this.postError(`Failed to apply customization: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private handleGraphOverview(mode: any, filters?: any): void {
    const graph = this.engine.getGraph();
    const response = getGraphOverview(graph, mode, filters);
    this.post({ type: 'graph/response', response });
  }

  private handleGraphExpand(nodeId: string, mode: any): void {
    const graph = this.engine.getGraph();
    const { nodes, edges } = expandGraphNode(graph, nodeId, mode);
    this.post({
      type: 'graph/response',
      response: {
        mode,
        nodes,
        edges,
        totalNodes: nodes.length,
        truncated: false,
      },
    });
  }

  private handleGraphQuery(mode: any, text: string): void {
    const graph = this.engine.getGraph();
    const result = executeGraphQuery(graph, mode, text);
    this.post({ type: 'graph/query-response', result });
  }

  private handleGraphSuggestions(): void {
    const graph = this.engine.getGraph();
    const suggestions = getQuerySuggestions(graph);
    this.post({ type: 'graph/suggestions-response', suggestions });
  }

  private handleMetricDetails(category: string): void {
    const graph = this.engine.getGraph();
    const details = getMetricDetails(graph, category);
    this.post({ type: 'intelligence/metric-details-response', details });
  }

  private async handleRefresh(): Promise<void> {
    try {
      this.postNotice('Scanning workspace repository and building knowledge graph...');
      this.postSnapshot();
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'StoryForge: Building intelligence...',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Analyzing workspace structure and relationships...' });
          await this.engine.performFullScan();
        },
      );
      this.postSnapshot();
      this.postNotice('Intelligence refreshed successfully.');
    } catch (err) {
      this.postError(`Intelligence refresh failed: ${err instanceof Error ? err.message : String(err)}`);
      this.postSnapshot();
    }
  }

  private async openSource(relativePath: string, line: number): Promise<void> {
    const workspaceRoot = this.engine.getStatus().state === 'ready'
      ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      : undefined;

    if (!workspaceRoot) return;

    try {
      const uri = vscode.Uri.file(`${workspaceRoot}/${relativePath}`);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      const position = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (err) {
      log.error('Failed to open source', err);
    }
  }

  private buildSnapshot(): AppSnapshot {
    const engineStatus = this.engine.getStatus();
    const intelligence = this.mapIntelligenceStatus(engineStatus);

    let discoverySnapshot: DiscoverySnapshot | null = null;
    let storySnapshot: StoryGenerationSnapshot | null = null;
    const featureHistory: FeatureLifecycleSnapshot[] = [];

    if (this.workflowEngine) {
      const active = this.workflowEngine.getActiveWorkflow();
      const all = this.workflowEngine.getAllWorkflows();

      for (const wf of all) {
        if (wf.featureInput) {
          featureHistory.push({
            id: wf.id,
            feature: {
              title: wf.featureInput.title,
              description: wf.featureInput.description,
              acceptanceContext: [],
              domainTerms: wf.featureInput.keywords,
              source: wf.featureInput.source === 'alm' ? 'alm' : 'manual',
            },
            phase: wf.phase,
            createdAt: new Date(wf.createdAt).toISOString(),
            updatedAt: new Date(wf.updatedAt).toISOString(),
          });
        }
      }

      if (active && active.discoveryContext && active.featureInput) {
        const disc = active.discoveryContext;
        const repo = disc.repositoryUnderstanding;

        const evidenceItems: DiscoveryEvidenceItem[] = disc.affectedAreas.flatMap((area) =>
          area.components.map((c) => ({
            id: `ev-${c.filePath}-${c.name}`,
            conceptId: c.name,
            displayName: c.name,
            kind: c.role,
            group: area.name,
            relevance: `${area.impactLevel} impact area`,
            confidence: 0.9,
            filePath: c.filePath,
            startLine: 1,
            endLine: 1,
            selected: true,
          })),
        );

        const questions: DiscoveryQuestion[] = repo.unresolvedQuestions.map((q, idx) => ({
          id: `q-${idx}`,
          question: q.question,
          context: q.context,
          category: 'Architecture',
          status: q.context.includes('Answered:') ? 'answered' : 'open',
          answer: q.context.includes('Answered:') ? q.context.split('Answered:')[1]?.trim() : undefined,
        }));

        discoverySnapshot = {
          id: active.id,
          feature: {
            title: active.featureInput.title,
            description: active.featureInput.description,
            acceptanceContext: [],
            domainTerms: active.featureInput.keywords,
            source: active.featureInput.source === 'alm' ? 'alm' : 'manual',
          },
          evidence: evidenceItems,
          questions,
          groups: disc.affectedAreas.map((a) => ({
            id: a.name,
            title: a.name,
            description: `${a.impactLevel} priority component area`,
            evidenceCount: a.components.length,
          })),
          overallConfidence: repo.confidence.overall,
          generationId: String(repo.generation),
          approvedAt: disc.approvalStatus === 'approved' ? new Date(active.updatedAt).toISOString() : null,
          createdAt: new Date(active.createdAt).toISOString(),
          iterationCount: 1,
        };
      }

      if (active && (active.stories || active.qaStories)) {
        const userStories: UserStorySnapshot[] = (active.stories || []).map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          outcome: s.soThat ? `As a ${s.asA}, I want ${s.iWant}, so that ${s.soThat}` : '',
          scope: s.affectedComponents,
          acceptanceCriteria: s.acceptanceCriteria.map((ac) => `Given ${ac.given}, When ${ac.when}, Then ${ac.then}`),
          affectedComponents: s.affectedComponents,
          status: s.status === 'approved' ? 'accepted' : s.status === 'rejected' ? 'rejected' : 'draft',
          selected: true,
        }));

        const qaStories: QaStorySnapshot[] = (active.qaStories || []).map((q) => ({
          id: q.id,
          title: q.title,
          testObjective: q.description,
          parentUserStoryId: q.relatedUserStoryId,
          scenarios: q.scenarios.map((sc) => `${sc.name}: Expected ${sc.expectedResult}`),
          positivePaths: q.scenarios.filter((sc) => sc.testType === 'positive').map((sc) => sc.name),
          negativePaths: q.scenarios.filter((sc) => sc.testType === 'negative').map((sc) => sc.name),
          boundaryCases: q.scenarios.filter((sc) => sc.testType === 'boundary').map((sc) => sc.name),
          status: q.status === 'approved' ? 'accepted' : q.status === 'rejected' ? 'rejected' : 'draft',
          selected: true,
        }));

        storySnapshot = {
          state: active.phase,
          generatedAt: new Date(active.updatedAt).toISOString(),
          userStories,
          qaStories,
          error: null,
        };
      }
    }

    return {
      activeView: this.activeView,
      intelligence,
      discovery: discoverySnapshot,
      featureHistory,
      storyGeneration: storySnapshot,
    };
  }

  private mapIntelligenceStatus(engineStatus: ReturnType<IntelligenceEngine['getStatus']>): IntelligenceStatus {
    const stateMap: Record<string, IntelligenceStatus['state']> = {
      'idle': 'unavailable',
      'scanning': 'indexing',
      'analyzing': 'indexing',
      'ready': 'fresh',
      'updating': 'indexing',
      'error': 'failed',
    };

    const graphStats = engineStatus.graphStats;
    const arch = engineStatus.architectureReport;

    const metrics: IntelligenceMetrics | null = engineStatus.state === 'ready' ? {
      discovered: engineStatus.fileCount,
      indexed: engineStatus.fileCount,
      reused: 0,
      reparsed: 0,
      skipped: 0,
      unsupported: 0,
      failed: 0,
      contentReads: engineStatus.fileCount,
      symbols: graphStats.nodesByType['symbol'] ?? 0,
      relationships: graphStats.edgeCount,
      entryPoints: (graphStats.nodesByType['api-endpoint'] ?? 0) + (graphStats.nodesByType['component'] ?? 0),
      tests: graphStats.nodesByType['test-suite'] ?? 0,
      dependencies: graphStats.nodesByType['external-dependency'] ?? 0,
      durationMs: engineStatus.lastScanDuration ?? 0,
    } : null;

    const coverage = arch ? {
      completeness: 'full' as const,
      languageBreakdown: arch.languages.map((l) => ({
        language: l.language,
        fileCount: l.fileCount,
        percentage: l.percentage,
      })),
      frameworks: arch.frameworks.map((f) => `${f.name}${f.version ? ` ${f.version}` : ''}`),
      patterns: arch.patterns as string[],
    } : null;

    // Real dynamic SQL tables extracted from Knowledge Graph
    const tableNodes = this.engine.getGraph().getNodesByType('database-table');
    const sqlTables = tableNodes.map((n) => {
      const data = n.data as any;
      const mappedEdges = this.engine.getGraph().getEdgesForNode(n.id, 'incoming').filter((e) => e.type === 'maps-to');
      const mappedModels = mappedEdges.map((e) => this.engine.getGraph().getNode(e.source)?.name).filter(Boolean) as string[];

      return {
        id: n.id,
        name: data.tableName || n.name,
        filePath: data.filePath || '',
        line: 1,
        columns: data.columns || [],
        foreignKeys: (data.foreignKeys || []).map((fk: any) => ({
          column: fk.column,
          targetTable: fk.referencesTable,
          targetColumn: fk.referencesColumn,
        })),
        mappedModels,
      };
    });

    // Real dynamic Docker services extracted from Knowledge Graph
    const dockerNodes = this.engine.getGraph().getNodesByType('docker-service');
    const dockerServices = dockerNodes.map((n) => {
      const data = n.data as any;
      return {
        id: n.id,
        name: data.serviceName || n.name,
        filePath: data.filePath || '',
        line: 1,
        image: data.image,
        ports: data.ports || [],
        dependsOn: data.dependsOn || [],
      };
    });

    // Real dynamic 11-stage capability flow for active workflow or core feature
    const activeWf = this.workflowEngine?.getActiveWorkflow();
    const featureIntent = activeWf?.featureInput?.title || 'Workspace Core Capability';
    const keywords = activeWf?.featureInput?.keywords || ['service', 'api', 'controller', 'model'];
    const chain = this.engine.buildCapabilityChain(featureIntent, keywords);
    const capabilityStages = chain.stages.map((st) => {
      const firstEvidence = st.evidence[0];
      const sourceLoc = firstEvidence && typeof firstEvidence.source === 'object' ? firstEvidence.source : undefined;
      const filePath = st.filePath || sourceLoc?.filePath || (typeof firstEvidence?.source === 'string' ? firstEvidence.source : '');
      const line = sourceLoc?.startLine || 1;

      return {
        stage: st.stage,
        label: st.label || st.stage.replace(/-/g, ' ').toUpperCase(),
        component: st.entityName || 'Unresolved Component',
        filePath,
        line,
        confidence: st.confidence,
        status: (st.evidence.length > 0 ? (st.confidence > 0.8 ? 'confirmed' : 'heuristic') : 'gap') as 'confirmed' | 'resolved' | 'heuristic' | 'gap',
        role: st.stage,
        notes: st.description || st.evidence.map((e) => e.description).join('; ') || 'Traversed capability flow tier',
        seedAcceptanceCriteria: [],
      };
    });

    return {
      state: stateMap[engineStatus.state] ?? 'unavailable',
      workspaceName: vscode.workspace.workspaceFolders?.[0]?.name ?? 'Workspace',
      generationId: engineStatus.generation > 0 ? String(engineStatus.generation) : null,
      completedAt: engineStatus.lastScanDuration ? new Date().toISOString() : null,
      lastRefresh: engineStatus.lastScanDuration ? new Date().toISOString() : null,
      stalePaths: 0,
      stalePathList: [],
      metrics,
      coverage,
      sqlTables,
      dockerServices,
      capabilityStages,
      progress: engineStatus.state === 'scanning' || engineStatus.state === 'analyzing' ? {
        jobId: `scan-${Date.now().toString(36)}`,
        phase: engineStatus.state === 'scanning' ? 'Scanning files' : 'Analyzing structure',
        message: engineStatus.state === 'scanning' ? 'Scanning workspace files…' : 'Building knowledge graph…',
        completed: 0,
        total: 0,
      } : null,
      error: engineStatus.error ?? null,
    };
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css'),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-eval'; font-src ${webview.cspSource} data:; connect-src ${webview.cspSource} https: data: blob:; worker-src ${webview.cspSource} blob:;" />
  <title>StoryForge</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
