/**
 * Intelligence Engine — The 5-Tier Orchestrator
 *
 * Coordinates the full 5-tier intelligence architecture:
 *
 *   1. Ontology Layer     (Domain metamodel & architectural invariants)
 *   2. Semantic Layer     (BM25 Inverted Index & Concept Taxonomy)
 *   3. Context Layer      (Situational & Generational tracking)
 *   4. Knowledge Graph    (Universal Multi-Language Ingestion & Graph Substrate)
 *   5. Context Graph      (Dynamic Situational Subgraph & 11-Stage Capability Reasoning)
 */

import { createLogger } from '../shared/logger.js';
import { KnowledgeGraph } from './graph/knowledgeGraph.js';
import { saveGraph, loadGraph } from './graph/graphSerializer.js';
import { GenerationTracker } from './generation.js';
import { scanWorkspace, parseChangedFile } from './parser/parserPool.js';
import { detectProjects, buildStructure } from './analyzer/structureAnalyzer.js';
import { buildRelationships } from './analyzer/relationshipAnalyzer.js';
import { analyzeArchitecture, type ArchitectureReport } from './analyzer/architectureAnalyzer.js';
import { computeQualityMetrics, type QualityReport } from './analyzer/qualityAnalyzer.js';
import { analyzeDocumentationHealth, type DocumentationHealthReport } from './analyzer/documentationAnalyzer.js';
import { snapshotFromGraph, computeGraphDiff, type GraphDiff, type GraphSnapshot } from './graph/graphDiff.js';
import {
  buildFeatureContext,
  buildDiscoveryContext,
  buildStoryIntelligenceContext,
  buildCapabilityChain,
} from './context/contextBuilder.js';
import { SymbolIndex, type SymbolIndexEntry } from './index/symbolIndex.js';
import { FileIndex } from './index/fileIndex.js';
import { SemanticIndexer, type ScoredSemanticMatch } from './semantic/semanticIndexer.js';
import { ContextGraph, type DynamicContextGraphProjection, type SituationalContext } from './contextGraph/contextGraph.js';
import type {
  FeatureIntelligenceContext,
  DiscoveryContext,
  StoryIntelligenceContext,
  CapabilityChain,
} from './context/contextTypes.js';
import type { GraphStats } from './graph/knowledgeGraph.js';
import type { FileMetadata, SupportedLanguage } from '../shared/types.js';
import { createLspBridge, type LspBridge } from './parser/lspBridge.js';
import { McpServer } from './mcp/mcpServer.js';

const log = createLogger('intelligence:engine');

/** Let the extension host deliver pending webview messages between phases. */
const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

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
  readonly maxFileSize?: number;
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
  private readonly semanticIndexer: SemanticIndexer;
  private readonly contextGraph: ContextGraph;
  private readonly lspBridge: LspBridge;
  private architectureReport?: ArchitectureReport;
  private cachedQualityReport?: QualityReport;
  private previousSnapshot?: GraphSnapshot;
  private lastScanDuration?: number;
  private errorMessage?: string;
  private readonly eventHandlers: EngineEventHandler[] = [];

  constructor(private readonly config: IntelligenceEngineConfig) {
    // Auto-scan is scheduled by the extension after activation. Mark the
    // engine as busy up front so a dashboard opened in that small window shows
    // progress instead of an inaccurate "unavailable" state.
    if (config.autoScan) {
      this.state = 'scanning';
    }
    this.graph = new KnowledgeGraph();
    this.generationTracker = new GenerationTracker(config.workspaceRoot);
    this.symbolIndex = new SymbolIndex();
    this.fileIndex = new FileIndex();
    this.semanticIndexer = new SemanticIndexer();
    this.contextGraph = new ContextGraph(this.graph, this.semanticIndexer);
    this.lspBridge = config.lspBridge ?? createLspBridge();

    log.info('Intelligence engine initialized with 5-tier architecture', {
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

    // Give activation-time commands (especially Open Dashboard) a chance to
    // run before reading a potentially very large persisted graph.
    await yieldToEventLoop();

    // Surface the background startup work immediately. This lets the dashboard
    // render its progress state even while the persisted graph is being loaded
    // or the first scan is starting.
    if (this.config.autoScan) {
      this.setState('scanning');
    }

    const loaded = await loadGraph(this.graph, this.config.workspaceRoot);
    await this.generationTracker.load();

    if (loaded) {
      // The graph is persisted, while FileIndex is intentionally in-memory.
      // Rehydrate it before exposing the ready state so a restored workspace
      // cannot report zero indexed files or treat every file as new.
      this.rebuildFileIndex();
      this.setState('updating');
      // Keep the renderer responsive between graph restore and the expensive
      // symbol/semantic index rebuild for large persisted repositories.
      await yieldToEventLoop();
      await this.rebuildIndexesAsync();
      this.setState('ready');
      log.info('Intelligence loaded from disk', {
        generation: this.graph.getGeneration(),
        stats: this.graph.getStats(),
      });
    } else if (this.config.autoScan) {
      await this.performFullScan();
    } else {
      this.setState('idle');
    }
  }

  private activeScanPromise?: Promise<void>;

  /**
   * Perform a full non-blocking repository scan.
   */
  async performFullScan(): Promise<void> {
    if (this.activeScanPromise) {
      log.info('Full scan already in progress, joining active scan');
      return this.activeScanPromise;
    }

    this.activeScanPromise = this.doPerformFullScan();
    try {
      await this.activeScanPromise;
    } finally {
      this.activeScanPromise = undefined;
    }
  }

  private async doPerformFullScan(): Promise<void> {
    const startTime = performance.now();
    this.setState('scanning');

    try {
      log.info('Starting full non-blocking repository scan');

      // Step 1: Scan and parse all files (< 3MB, async micro-batching)
      const scanResult = await scanWorkspace({
        workspaceRoot: this.config.workspaceRoot,
        excludePatterns: this.config.excludePatterns,
        maxFileSize: this.config.maxFileSize,
      });

      this.emit('scan-started', { totalFiles: scanResult.totalFiles });

      this.setState('analyzing');
      await yieldToEventLoop();

      // Step 2: Increment generation and reset graph
      this.graph.clear();
      const generation = this.graph.incrementGeneration();

      // Step 3: Detect projects across all ecosystems
      const projects = detectProjects(scanResult.files);

      // Step 4: Build structural hierarchy (Levels 1-7 + SQL, Docker, Docs)
      buildStructure(
        this.graph,
        this.config.workspaceName,
        scanResult.files,
        scanResult.parseResults,
        projects,
        generation,
      );
      await yieldToEventLoop();

      // Step 5: Build relationships (Imports, Type refs, API flows, Foreign keys)
      const relResult = buildRelationships(
        this.graph,
        scanResult.parseResults,
        generation,
      );
      await yieldToEventLoop();

      // Step 6: Analyze architecture & patterns
      this.architectureReport = analyzeArchitecture(
        this.graph,
        scanResult.parseResults,
        projects,
      );

      // Step 6b: Compute code quality metrics (GAP 3)
      this.cachedQualityReport = computeQualityMetrics(
        this.graph,
        scanResult.parseResults,
      );
      await yieldToEventLoop();

      // Step 7: Rebuild indexes & Semantic BM25 index
      await this.rebuildIndexesAsync();
      await yieldToEventLoop();

      // Step 8: Update file index
      for (const file of scanResult.files) {
        this.fileIndex.set({ ...file, generation });
      }
      await yieldToEventLoop();

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

      // Step 10: Persist atomically
      await this.save();
      await yieldToEventLoop();

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

      const existingMeta = this.fileIndex.get(result.metadata.path);
      if (existingMeta && existingMeta.hash === result.metadata.hash) {
        this.setState('ready');
        return;
      }

      const generation = this.graph.incrementGeneration();

      this.symbolIndex.removeByFile(result.metadata.path);
      this.fileIndex.set({ ...result.metadata, generation });

      this.rebuildIndexes();

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
      this.setState('ready');
    }
  }

  /**
   * Handle live in-memory document keystroke streaming without waiting for disk writes.
   */
  async handleDocumentChange(absolutePath: string, sourceCode: string): Promise<void> {
    if (this.state !== 'ready' && this.state !== 'idle') return;

    try {
      const relativePath = absolutePath.replace(this.config.workspaceRoot + '/', '');
      const language = (await import('./parser/languageAdapters.js')).detectLanguage(relativePath);
      if (!language) return;

      const { parseFile } = await import('./parser/treeSitterParser.js');
      const parseResult = parseFile(sourceCode, relativePath, language);

      const generation = this.graph.incrementGeneration();

      // Update in-memory symbol index
      this.symbolIndex.removeByFile(relativePath);
      for (const sym of parseResult.symbols) {
        this.symbolIndex.add({
          id: `symbol:${sym.qualifiedName}`,
          name: sym.name,
          qualifiedName: sym.qualifiedName,
          kind: (sym.kind as SymbolIndexEntry['kind']) || 'variable',
          language: language as SymbolIndexEntry['language'],
          filePath: relativePath,
        });
      }

      // Quick re-index for semantic layer
      this.rebuildIndexes();

      this.emit('generation-updated', { generation, liveStream: true });
      log.debug('Live in-memory keystroke update applied', { filePath: relativePath, symbols: parseResult.symbols.length });
    } catch (err) {
      log.debug('Live document change skipped', { error: String(err) });
    }
  }

  /**
   * Handle a file deletion.
   */
  async handleFileDeletion(absolutePath: string): Promise<void> {
    if (this.state !== 'ready') return;

    const relativePath = absolutePath.replace(this.config.workspaceRoot + '/', '');

    this.symbolIndex.removeByFile(relativePath);
    this.fileIndex.remove(relativePath);

    const fileNode = this.graph.getNodeByQualifiedName(`file:${relativePath}`);
    if (fileNode) {
      this.graph.removeNode(fileNode.id);
    }

    this.rebuildIndexes();
    log.info('File removed from intelligence', { path: relativePath });
  }

  // ─── Query API (The 5 Layers) ──────────────────────────────────────────

  /**
   * Project a dynamic Context Graph (Layer 5) from live situation and intent.
   */
  projectContextGraph(
    intent: string,
    keywords: string[],
    situation: Partial<SituationalContext> = {},
  ): DynamicContextGraphProjection {
    return this.contextGraph.project(intent, keywords, situation);
  }

  /**
   * Search knowledge graph using the Semantic Layer (BM25 + Synonyms).
   */
  searchSemantic(query: string, limit: number = 20): ScoredSemanticMatch[] {
    return this.semanticIndexer.search(query, { limit });
  }

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
   * Search the knowledge graph directly.
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
   * Get the knowledge graph.
   */
  getGraph(): KnowledgeGraph {
    return this.graph;
  }

  /**
   * Get the current architecture report if analyzed.
   */
  getArchitectureReport(): ArchitectureReport | undefined {
    return this.architectureReport;
  }

  /**
   * Get the generation tracker.
   */
  getGenerationTracker(): GenerationTracker {
    return this.generationTracker;
  }

  /**
   * Get the semantic indexer.
   */
  getSemanticIndexer(): SemanticIndexer {
    return this.semanticIndexer;
  }

  // ─── Persistence ────────────────────────────────────────────────────────

  /**
   * Save intelligence to disk.
   */
  async save(): Promise<void> {
    await saveGraph(this.graph, this.config.workspaceRoot);
    await this.generationTracker.save();
  }

  /**
   * Get code quality metrics (GAP 3).
   * Computes on first call, returns cached result thereafter.
   */
  getQualityMetrics(forceRecompute = false): QualityReport | null {
    if (this.state !== 'ready') return null;
    if (!this.cachedQualityReport || forceRecompute) {
      // Recompute with available parse results from graph
      this.cachedQualityReport = computeQualityMetrics(this.graph, []);
    }
    return this.cachedQualityReport;
  }

  /**
   * Get documentation health report (GAP 5).
   */
  getDocumentationHealth(): DocumentationHealthReport | null {
    if (this.state !== 'ready') return null;
    const fileList = Array.from(this.fileIndex.allPaths());
    return analyzeDocumentationHealth(this.graph, [], fileList);
  }

  /**
   * Get graph diff between two generations (GAP 4).
   * If no previous snapshot exists, returns null.
   */
  getGraphDiff(): GraphDiff | null {
    if (this.state !== 'ready' || !this.previousSnapshot) return null;
    const currentSnapshot = snapshotFromGraph(this.graph);
    return computeGraphDiff(this.previousSnapshot, currentSnapshot);
  }

  /**
   * Create an MCP (Model Context Protocol) server instance connected to this engine.
   */
  createMcpServer(): McpServer {
    return new McpServer(this);
  }

  /**
   * Store the current graph as a snapshot for future diffing.
   * Called automatically at the start of each full scan.
   */
  private captureSnapshot(): void {
    this.previousSnapshot = snapshotFromGraph(this.graph);
  }

  // ─── Event System ──────────────────────────────────────────────────────

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

    // Rebuild semantic BM25 index across all graph nodes
    this.semanticIndexer.indexNodes(this.graph.getAllNodes());

    log.debug('Indexes rebuilt', {
      symbolCount: this.symbolIndex.size,
      graphNodesCount: this.graph.getAllNodes().length,
    });
  }

  /** Cooperative variant used by startup/full scans with very large graphs. */
  private async rebuildIndexesAsync(): Promise<void> {
    this.symbolIndex.clear();

    const nodes = [
      ...this.graph.getNodesByType('symbol'),
      ...this.graph.getNodesByType('component'),
    ];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
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

      if ((i + 1) % 1000 === 0) await yieldToEventLoop();
    }

    await this.semanticIndexer.indexNodesAsync(this.graph.getAllNodes());

    log.debug('Indexes rebuilt', {
      symbolCount: this.symbolIndex.size,
      graphNodesCount: this.graph.getAllNodes().length,
    });
  }

  /** Restore the change-detection index from persisted file nodes. */
  private rebuildFileIndex(): void {
    this.fileIndex.clear();

    const symbolCounts = new Map<string, number>();
    for (const symbol of this.graph.getNodesByType('symbol')) {
      const filePath = (symbol.data as { filePath?: string }).filePath;
      if (filePath) symbolCounts.set(filePath, (symbolCounts.get(filePath) ?? 0) + 1);
    }

    for (const node of this.graph.getNodesByType('file')) {
      const data = node.data as {
        path?: string;
        language?: string;
        size?: number;
        hash?: string;
        lastModified?: number;
        lastAnalyzed?: number;
        symbolCount?: number;
      };

      if (!data.path || !data.language || !data.hash) continue;

      const metadata: FileMetadata = {
        path: data.path,
        language: data.language as SupportedLanguage,
        size: data.size ?? 0,
        hash: data.hash,
        // Older graph stores do not have these fields. Hash-based change
        // detection remains valid, so use safe defaults for those versions.
        lastModified: data.lastModified ?? 0,
        lastAnalyzed: data.lastAnalyzed ?? 0,
        generation: node.generationUpdated,
        symbolCount: data.symbolCount ?? symbolCounts.get(data.path) ?? 0,
      };
      this.fileIndex.set(metadata);
    }

    log.debug('File index restored from graph', { fileCount: this.fileIndex.size });
  }
}
