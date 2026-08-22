/**
 * Storage Engine Tests (Layer 4 Persistence)
 *
 * Tests atomic writing, rotation, and crash-safe backup recovery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StorageEngine } from '../../src/intelligence/storage/storageEngine.js';
import { KnowledgeGraph } from '../../src/intelligence/graph/knowledgeGraph.js';
import { createGraphNode } from '../../src/intelligence/graph/graphNode.js';

describe('Storage Engine (Zero-Dependency Persistence)', () => {
  let tempDir: string;
  let storage: StorageEngine;
  let graph: KnowledgeGraph;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'storyforge-storage-test-'));
    storage = new StorageEngine(tempDir);
    graph = new KnowledgeGraph();
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should save and reload knowledge graph atomically in compressed format', async () => {
    const node = createGraphNode('component', 'comp:test', 'TestService', 'src/Test.ts', {}, 1);
    graph.addNode(node);

    await storage.saveGraph(graph);

    const loadedGraph = new KnowledgeGraph();
    const loaded = await storage.loadGraph(loadedGraph);

    expect(loaded).toBe(true);
    expect(loadedGraph.hasNode('comp:test')).toBe(true);
    expect(loadedGraph.getNode('comp:test')?.name).toBe('TestService');

    const stats = await storage.getStats(loadedGraph);
    expect(stats.nodeCount).toBe(1);
    expect(stats.sizeBytes).toBeGreaterThan(0);
  });

  it('should recover from backup if primary compressed file is corrupted', async () => {
    const node = createGraphNode('component', 'comp:backup', 'BackupService', 'src/Backup.ts', {}, 1);
    graph.addNode(node);

    // Save twice so backup is created
    await storage.saveGraph(graph);
    await storage.saveGraph(graph);

    // Corrupt primary file
    const primaryPath = path.join(tempDir, '.storyforge', 'storage', 'graph_store.json.gz');
    await fs.promises.writeFile(primaryPath, Buffer.from('corrupt binary data'));

    const recoveredGraph = new KnowledgeGraph();
    const loaded = await storage.loadGraph(recoveredGraph);

    expect(loaded).toBe(true);
    expect(recoveredGraph.hasNode('comp:backup')).toBe(true);
  });

  it('should load legacy uncompressed json files and migrate', async () => {
    const storageDir = path.join(tempDir, '.storyforge', 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });
    const legacyPath = path.join(storageDir, 'graph_store.json');

    const legacyPayload = JSON.stringify({
      generation: 1,
      nodes: [
        {
          id: 'comp:legacy',
          type: 'component',
          name: 'LegacyService',
          qualifiedName: 'src/LegacyService.ts',
          data: {},
          metadata: {},
          generationCreated: 1,
          generationUpdated: 1,
        },
      ],
      edges: [],
    });
    await fs.promises.writeFile(legacyPath, legacyPayload, 'utf-8');

    const legacyGraph = new KnowledgeGraph();
    const loaded = await storage.loadGraph(legacyGraph);

    expect(loaded).toBe(true);
    expect(legacyGraph.hasNode('comp:legacy')).toBe(true);
    expect(legacyGraph.getNode('comp:legacy')?.name).toBe('LegacyService');
  });
});
