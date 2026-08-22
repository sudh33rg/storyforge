/**
 * Graph Serializer
 *
 * Persists the knowledge graph to .storyforge/graph.json within the workspace.
 * Uses atomic writes (write to temp, then rename) for crash safety.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../shared/logger.js';
import type { KnowledgeGraph } from './knowledgeGraph.js';

const log = createLogger('intelligence:graph:serializer');

const STORYFORGE_DIR = '.storyforge';
const GRAPH_FILE = 'graph.json';
const GRAPH_BACKUP = 'graph.backup.json';

/**
 * Save the knowledge graph to disk.
 */
export async function saveGraph(
  graph: KnowledgeGraph,
  workspaceRoot: string,
): Promise<void> {
  const storageDir = path.join(workspaceRoot, STORYFORGE_DIR);
  const graphPath = path.join(storageDir, GRAPH_FILE);
  const tempPath = graphPath + '.tmp';

  // Ensure .storyforge directory exists
  await fs.promises.mkdir(storageDir, { recursive: true });

  const data = graph.exportData();
  const json = JSON.stringify(data, null, 2);

  try {
    // Atomic write: write to temp file, then rename
    await fs.promises.writeFile(tempPath, json, 'utf-8');

    // Backup existing graph before overwriting
    try {
      await fs.promises.access(graphPath);
      await fs.promises.copyFile(graphPath, path.join(storageDir, GRAPH_BACKUP));
    } catch {
      // No existing graph to backup
    }

    await fs.promises.rename(tempPath, graphPath);

    log.info('Graph saved', {
      path: graphPath,
      nodes: data.nodes.length,
      edges: data.edges.length,
      generation: data.generation,
      bytes: Buffer.byteLength(json),
    });
  } catch (err) {
    // Clean up temp file on error
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Load the knowledge graph from disk.
 * Returns true if a graph was loaded, false if no saved graph exists.
 */
export async function loadGraph(
  graph: KnowledgeGraph,
  workspaceRoot: string,
): Promise<boolean> {
  const graphPath = path.join(workspaceRoot, STORYFORGE_DIR, GRAPH_FILE);

  try {
    await fs.promises.access(graphPath);
  } catch {
    log.info('No saved graph found', { path: graphPath });
    return false;
  }

  try {
    const json = await fs.promises.readFile(graphPath, 'utf-8');
    const data = JSON.parse(json);

    if (!data.nodes || !data.edges || typeof data.generation !== 'number') {
      log.warn('Invalid graph file format', { path: graphPath });
      return false;
    }

    graph.importData(data);

    log.info('Graph loaded', {
      path: graphPath,
      nodes: data.nodes.length,
      edges: data.edges.length,
      generation: data.generation,
    });

    return true;
  } catch (err) {
    log.error('Failed to load graph', err, { path: graphPath });

    // Try loading from backup
    const backupPath = path.join(workspaceRoot, STORYFORGE_DIR, GRAPH_BACKUP);
    try {
      const backupJson = await fs.promises.readFile(backupPath, 'utf-8');
      const backupData = JSON.parse(backupJson);
      graph.importData(backupData);
      log.info('Graph restored from backup', { path: backupPath });
      return true;
    } catch {
      log.error('Failed to load graph backup', err);
      return false;
    }
  }
}

/**
 * Delete the saved graph and all intelligence data.
 */
export async function clearGraphStorage(workspaceRoot: string): Promise<void> {
  const storageDir = path.join(workspaceRoot, STORYFORGE_DIR);
  try {
    await fs.promises.rm(storageDir, { recursive: true, force: true });
    log.info('Intelligence storage cleared', { path: storageDir });
  } catch (err) {
    log.error('Failed to clear storage', err, { path: storageDir });
  }
}

/**
 * Get the size of the saved graph on disk.
 */
export async function getGraphStorageSize(workspaceRoot: string): Promise<number> {
  const graphPath = path.join(workspaceRoot, STORYFORGE_DIR, GRAPH_FILE);
  try {
    const stats = await fs.promises.stat(graphPath);
    return stats.size;
  } catch {
    return 0;
  }
}
