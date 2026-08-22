/**
 * Graph Serializer
 *
 * Persists the knowledge graph to embedded disk storage within the workspace.
 * Backed by StorageEngine with atomic writes, rotation, and backup failover.
 */

import { StorageEngine } from '../storage/storageEngine.js';
import type { KnowledgeGraph } from './knowledgeGraph.js';

export async function saveGraph(
  graph: KnowledgeGraph,
  workspaceRoot: string,
): Promise<void> {
  const engine = new StorageEngine(workspaceRoot);
  await engine.saveGraph(graph);
}

export async function loadGraph(
  graph: KnowledgeGraph,
  workspaceRoot: string,
): Promise<boolean> {
  const engine = new StorageEngine(workspaceRoot);
  return engine.loadGraph(graph);
}

export async function clearGraphStorage(workspaceRoot: string): Promise<void> {
  const engine = new StorageEngine(workspaceRoot);
  await engine.clear();
}

export async function getGraphStorageSize(workspaceRoot: string): Promise<number> {
  const engine = new StorageEngine(workspaceRoot);
  const stats = await engine.getStats(new (await import('./knowledgeGraph.js')).KnowledgeGraph());
  return stats.sizeBytes;
}
