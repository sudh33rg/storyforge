/**
 * Intelligence Engine — The Orchestrator
 *
 * This is the heart of StoryForge. It coordinates the full intelligence pipeline:
 *
 *   Repository → Discovery → Parse → Analyze → Graph → Index → Publish
 *                                                                  ↓
 *   File changes → Affected-area detection → Incremental re-analysis → Updated intelligence
 *
 * The engine is the shared foundation consumed by:
 * - VS Code extension
 * - Copilot Chat participant
 * - Webview dashboard
 * - Future CLI / browser UI
 *
 * Intelligence first. Everything else is a consumer of Intelligence.
 */

import { createLogger } from '../shared/logger.js';
import { KnowledgeGraph } from './graph/knowledgeGraph.js';
import { saveGraph, loadGraph } from './graph/graphSerializer.js';
import { GenerationTracker } from './generation.js';
import { scanWorkspace, parseChangedFile } from './parser/parserPool.js';
import { detectProjects, buildStructure } from './analyzer/structureAnalyzer.js';
import { buildRelationships } from './analyzer/relationshipAnalyzer.js';
import { analyzeArchitecture, type ArchitectureReport } from './analyzer/architectureAnalyzer.js';
import {
  buildFeatureContext,
  buildDiscoveryContext,
  buildStoryIntelligenceContext,
  buildCapabilityChain,
} from './context/contextBuilder.js';
import { SymbolIndex, type SymbolIndexEntry } from './index/symbolIndex.js';
import { FileIndex } from './index/fileIndex.js';
import type {
  FeatureIntelligenceContext,
  DiscoveryContext,
  StoryIntelligenceContext,
  CapabilityChain,
} from './context/contextTypes.js';
import type { GraphStats } from './graph/knowledgeGraph.js';
import { createLspBridge, type LspBridge } from './parser/lspBridge.js';

const log = createLogger('intelligence:engine');

// ─── Engine State ────────────────────────────────────────────────────────────

export type EngineState =
  | 'idle'           // not started
  | 'scanning'       // full scan in progress
  | 'analyzing'      // analysis in progress
  | 'ready'          // intelligence available
  | 'updating'       // incremental update in progress
  | 'error';         // error state

export interface EngineStatus {
  readonly state: EngineState;
  readonly generation: number;
  readonly graphStats: GraphStats;
  readonly fileCount: number;
  readonly lastScanDuration?: number;
  readonly architectureReport?: ArchitectureReport;
  readonly error?: string;
}

// ─── Engine Configuration ────────────────────────────────────────────────────

export interface IntelligenceEngineConfig {
  readonly workspaceRoot: string;
  readonly workspaceName: string;
  readonly excludePatterns: string[];
  readonly maxFileSize: number;
  readonly autoScan: boolean;
  readonly lspBridge?: LspBridge;
}

// ─── Event Emitter ───────────────────────────────────────────────────────────

export type EngineEventType =
  | 'state-changed'
  | 'scan-started'
  | 'scan-completed'
  | 'generation-updated'
  | 'error';

type EngineEventHandler = (event: { type: EngineEventType; data?: unknown }) => void;

// ─── Intelligence Engine ─────────────────────────────────────────────────────

export class IntelligenceEngine {
  private state: EngineState = 'idle';
  private readonly graph: KnowledgeGraph;
  private readonly generationTracker: GenerationTracker;
  private readonly symbolIndex: SymbolIndex;
  private readonly fileIndex: FileIndex;
  private readonly lspBridge: LspBridge;
  private architectureReport?: ArchitectureReport;
  private lastScanDuration?: number;
  private errorMessage?: string;
  private readonly eventHandlers: EngineEventHandler[] = [];

  constructor(private readonly config: IntelligenceEngineConfig) {
    this.graph = new KnowledgeGraph();
    this.generationTracker = new GenerationTracker(config.workspaceRoot);
    this.symbolIndex = new SymbolIndex();
    this.fileIndex = new FileIndex();
    this.lspBridge = config.lspBridge ?? createLspBridge();

    log.info('Intelligence engine created', {
      workspace: config.workspaceName,
      root: config.workspaceRoot,
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Initialize the engine: load existing intelligence or perform first scan.
   */
  async initialize(): Promise<void> {
    log.info('Initializing intelligence engine');

    // Try to load existing intelligence
    const loaded = await loadGraph(this.graph, this.config.workspaceRoot);
    await this.generationTracker.load();

    if (loaded) {
      this.rebuildIndexes();
      this.setState('ready');
      log.info('Intelligence loaded from disk', {
        generation: this.graph.getGeneration(),
        stats: this.graph.getStats(),
      });
    } else if (this.config.autoScan) {
      // No existing intelligence — perform first scan
      await this.performFullScan();
    } else {
      this.setState('idle');
    }
  }

  /**
   * Perform a full repository scan.
   */
  async performFullScan(): Promise<void> {
    const startTime = performance.now();
    this.setState('scanning');

    try {
      log.info('Starting full repository scan');

      // Step 1: Scan and parse all files
      const scanResult = await scanWorkspace({
        workspaceRoot: this.config.workspaceRoot,
        excludePatterns: this.config.excludePatterns,
        maxFileSize: this.config.maxFileSize,
      });

      this.emit('scan-started', { totalFiles: scanResult.totalFiles });

      this.setState('analyzing');

      // Step 2: Clear existing graph and rebuild
      this.graph.clear();
      const generation = this.graph.incrementGeneration();

      // Step 3: Detect projects
      const projects = detectProjects(scanResult.files);

      // Step 4: Build structural hierarchy
      buildStructure(
        this.graph,
        this.config.workspaceName,
        scanResult.files,
        scanResult.parseResults,
        projects,
        generation,
      );

      // Step 5: Build relationships
      const relResult = buildRelationships(
        this.graph,
        scanResult.parseResults,
        generation,
      );

      // Step 6: Analyze architecture
      this.architectureReport = analyzeArchitecture(
        this.graph,
        scanResult.parseResults,
        projects,
      );

      // Step 7: Rebuild indexes
      this.rebuildIndexes();

      // Step 8: Update file index
      for (const file of scanResult.files) {
        this.fileIndex.set({ ...file, generation });
      }

      // Step 9: Record generation
      const duration = performance.now() - startTime;
      this.lastScanDuration = duration;

      this.generationTracker.recordGeneration({
        timestamp: Date.now(),
        trigger: 'full-scan',
        filesAnalyzed: scanResult.parsedFiles,
        filesChanged: scanResult.parsedFiles,
        nodesCreated: this.graph.getStats().nodeCount,
        nodesUpdated: 0,
        nodesRemoved: 0,
        edgesCreated: this.graph.getStats().edgeCount,
        edgesUpdated: relResult.edgesUpdated,
        edgesRemoved: 0,
        durationMs: duration,
        errors: scanResult.errors.map((e) => `${e.filePath}: ${e.error}`),
      });

      // Step 10: Persist
      await this.save();

      this.setState('ready');
      this.emit('scan-completed', {
        generation,
        duration,
        files: scanResult.parsedFiles,
        nodes: this.graph.getStats().nodeCount,
        edges: this.graph.getStats().edgeCount,
      });

      log.info('Full scan complete', {
        generation,
        files: scanResult.parsedFiles,
        nodes: this.graph.getStats().nodeCount,
        edges: this.graph.getStats().edgeCount,
        durationMs: Math.round(duration),
      });
    } catch (err) {
      this.errorMessage = err instanceof Error ? err.message : String(err);
      this.setState('error');
      log.error('Full scan failed', err);
      throw err;
    }
  }

  /**
   * Handle a file change (for incremental updates).
   */
  async handleFileChange(absolutePath: string): Promise<void> {
    if (this.state !== 'ready') return;

    this.setState('updating');

    try {
      const result = await parseChangedFile(absolutePath, this.config.workspaceRoot);
      if (!result) {
        this.setState('ready');
        return;
      }

      // Check if the file actually changed
      const existingMeta = this.fileIndex.get(result.metadata.path);
      if (existingMeta && existingMeta.hash === result.metadata.hash) {
        this.setState('ready');
        return; // No actual content change
      }

      const generation = this.graph.incrementGeneration();

      // Remove old data for this file
      this.symbolIndex.removeByFile(result.metadata.path);
      // Note: full re-indexing would be needed for a production system

      // Re-build structure for this file
      // (simplified — full implementation would do targeted graph updates)
      this.fileIndex.set({ ...result.metadata, generation });

      // Record incremental generation
      this.generationTracker.recordGeneration({
        timestamp: Date.now(),
        trigger: 'incremental',
        filesAnalyzed: 1,
        filesChanged: 1,
        nodesCreated: result.result.symbols.length,
        nodesUpdated: 0,
        nodesRemoved: 0,
        edgesCreated: result.result.imports.length,
        edgesUpdated: 0,
        edgesRemoved: 0,
        durationMs: result.result.parseTimeMs,
        errors: [],
      });

      this.emit('generation-updated', { generation });
      this.setState('ready');

      log.info('Incremental update complete', {
        file: result.metadata.path,
        generation,
      });
    } catch (err) {
      log.error('Incremental update failed', err);
      this.setState('ready'); // Recover to ready state
    }
  }

  /**
   * Handle a file deletion.
   */
  async handleFileDeletion(absolutePath: string): Promise<void> {
    if (this.state !== 'ready') return;

    const relativePath = absolutePath.replace(this.config.workspaceRoot + '/', '');

    // Remove from indexes
    this.symbolIndex.removeByFile(relativePath);
    this.fileIndex.remove(relativePath);

    // Remove from graph
    const fileNode = this.graph.getNodeByQualifiedName(`file:${relativePath}`);
    if (fileNode) {
      this.graph.removeNode(fileNode.id);
    }

    log.info('File removed from intelligence', { path: relativePath });
  }

  // ─── Query API ──────────────────────────────────────────────────────────

  /**
   * Build a feature intelligence context for a feature request.
   */
  buildFeatureContext(featureIntent: string, keywords: string[]): FeatureIntelligenceContext {
    return buildFeatureContext(this.graph, featureIntent, keywords);
  }

  /**
   * Build a Discovery context for a feature request.
   */
  buildDiscoveryContext(
    featureIntent: string,
    keywords: string[],
    featureContext?: FeatureIntelligenceContext,
  ): DiscoveryContext {
    return buildDiscoveryContext(this.graph, featureIntent, keywords, featureContext);
  }

  /**
   * Build a Story Intelligence context from approved discovery.
   */
  buildStoryIntelligenceContext(discovery: DiscoveryContext): StoryIntelligenceContext {
    return buildStoryIntelligenceContext(this.graph, discovery);
  }

  /**
   * Build an 11-stage capability reasoning chain.
   */
  buildCapabilityChain(featureIntent: string, keywords: string[]): CapabilityChain {
    return buildCapabilityChain(this.graph, featureIntent, keywords);
  }

  /**
   * Search the knowledge graph.
   */
  searchGraph(query: string): { nodes: ReturnType<KnowledgeGraph['searchNodes']> } {
    return { nodes: this.graph.searchNodes(query) };
  }

  /**
   * Search symbols by name.
   */
  searchSymbols(query: string): SymbolIndexEntry[] {
    return this.symbolIndex.searchByName(query);
  }

  /**
   * Get the current engine status.
   */
  getStatus(): EngineStatus {
    return {
      state: this.state,
      generation: this.graph.getGeneration(),
      graphStats: this.graph.getStats(),
      fileCount: this.fileIndex.size,
      lastScanDuration: this.lastScanDuration,
      architectureReport: this.architectureReport,
      error: this.errorMessage,
    };
  }

  /**
   * Get the knowledge graph (for advanced queries).
   */
  getGraph(): KnowledgeGraph {
    return this.graph;
  }

  /**
   * Get the generation tracker.
   */
  getGenerationTracker(): GenerationTracker {
    return this.generationTracker;
  }

  // ─── Persistence ────────────────────────────────────────────────────────

  /**
   * Save intelligence to disk.
   */
  async save(): Promise<void> {
    await saveGraph(this.graph, this.config.workspaceRoot);
    await this.generationTracker.save();
  }

  // ─── Event System ──────────────────────────────────────────────────────

  /**
   * Subscribe to engine events.
   */
  onEvent(handler: EngineEventHandler): { dispose: () => void } {
    this.eventHandlers.push(handler);
    return {
      dispose: () => {
        const idx = this.eventHandlers.indexOf(handler);
        if (idx >= 0) this.eventHandlers.splice(idx, 1);
      },
    };
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private setState(newState: EngineState): void {
    const oldState = this.state;
    this.state = newState;
    if (oldState !== newState) {
      this.emit('state-changed', { from: oldState, to: newState });
      log.info('Engine state changed', { from: oldState, to: newState });
    }
  }

  private emit(type: EngineEventType, data?: unknown): void {
    for (const handler of this.eventHandlers) {
      try {
        handler({ type, data });
      } catch (err) {
        log.error('Event handler error', err);
      }
    }
  }

  private rebuildIndexes(): void {
    this.symbolIndex.clear();

    // Index all symbol and component nodes
    const symbols = this.graph.getNodesByType('symbol');
    const components = this.graph.getNodesByType('component');

    for (const node of [...symbols, ...components]) {
      const data = node.data as {
        filePath?: string;
        language?: string;
        symbolKind?: string;
      };

      this.symbolIndex.add({
        id: node.id,
        name: node.name,
        qualifiedName: node.qualifiedName,
        kind: (data.symbolKind as SymbolIndexEntry['kind']) || 'variable',
        language: (data.language as SymbolIndexEntry['language']) || 'typescript',
        filePath: data.filePath || '',
      });
    }

    log.debug('Indexes rebuilt', { symbolCount: this.symbolIndex.size });
  }
}
