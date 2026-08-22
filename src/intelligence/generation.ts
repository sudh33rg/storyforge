/**
 * Intelligence Generation Tracking
 *
 * Tracks intelligence generations — each time the repository is analyzed
 * (fully or incrementally), a new generation is created. This lets StoryForge
 * always know which generation it is using and detect stale data.
 *
 * Generation 1 → initial full scan
 * Generation 2 → developer changes code → affected files detected → incremental re-analysis
 * Generation 3 → more changes → incremental re-analysis
 * ...
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../shared/logger.js';

const log = createLogger('intelligence:generation');

export interface GenerationRecord {
  readonly generation: number;
  readonly timestamp: number;
  readonly trigger: 'full-scan' | 'incremental' | 'manual';
  readonly filesAnalyzed: number;
  readonly filesChanged: number;
  readonly nodesCreated: number;
  readonly nodesUpdated: number;
  readonly nodesRemoved: number;
  readonly edgesCreated: number;
  readonly edgesUpdated: number;
  readonly edgesRemoved: number;
  readonly durationMs: number;
  readonly errors: string[];
}

export interface GenerationSummary {
  readonly currentGeneration: number;
  readonly totalGenerations: number;
  readonly lastFullScan?: GenerationRecord;
  readonly lastIncremental?: GenerationRecord;
  readonly history: GenerationRecord[];
}

const STORYFORGE_DIR = '.storyforge';
const GENERATIONS_DIR = 'generations';
const SUMMARY_FILE = 'generation-summary.json';
const MAX_HISTORY = 50;

export class GenerationTracker {
  private records: GenerationRecord[] = [];
  private currentGeneration = 0;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Record a new generation.
   */
  recordGeneration(record: Omit<GenerationRecord, 'generation'>): GenerationRecord {
    this.currentGeneration++;
    const fullRecord: GenerationRecord = {
      ...record,
      generation: this.currentGeneration,
    };

    this.records.push(fullRecord);

    // Trim history
    if (this.records.length > MAX_HISTORY) {
      this.records = this.records.slice(-MAX_HISTORY);
    }

    log.info('Generation recorded', {
      generation: fullRecord.generation,
      trigger: fullRecord.trigger,
      filesAnalyzed: fullRecord.filesAnalyzed,
      durationMs: fullRecord.durationMs,
    });

    return fullRecord;
  }

  /**
   * Get the current generation number.
   */
  getCurrentGeneration(): number {
    return this.currentGeneration;
  }

  /**
   * Get a summary of all generations.
   */
  getSummary(): GenerationSummary {
    return {
      currentGeneration: this.currentGeneration,
      totalGenerations: this.records.length,
      lastFullScan: [...this.records].reverse().find((r) => r.trigger === 'full-scan'),
      lastIncremental: [...this.records].reverse().find((r) => r.trigger === 'incremental'),
      history: [...this.records],
    };
  }

  /**
   * Get the latest generation record.
   */
  getLatest(): GenerationRecord | undefined {
    return this.records.length > 0 ? this.records[this.records.length - 1] : undefined;
  }

  /**
   * Save generation history to disk.
   */
  async save(): Promise<void> {
    const dir = path.join(this.workspaceRoot, STORYFORGE_DIR, GENERATIONS_DIR);
    await fs.promises.mkdir(dir, { recursive: true });

    const summaryPath = path.join(dir, SUMMARY_FILE);
    const data = {
      currentGeneration: this.currentGeneration,
      records: this.records,
    };

    await fs.promises.writeFile(summaryPath, JSON.stringify(data, null, 2), 'utf-8');
    log.debug('Generation history saved', { path: summaryPath });
  }

  /**
   * Load generation history from disk.
   */
  async load(): Promise<boolean> {
    const summaryPath = path.join(
      this.workspaceRoot,
      STORYFORGE_DIR,
      GENERATIONS_DIR,
      SUMMARY_FILE,
    );

    try {
      const json = await fs.promises.readFile(summaryPath, 'utf-8');
      const data = JSON.parse(json);

      if (typeof data.currentGeneration === 'number' && Array.isArray(data.records)) {
        this.currentGeneration = data.currentGeneration;
        this.records = data.records;
        log.info('Generation history loaded', {
          currentGeneration: this.currentGeneration,
          totalRecords: this.records.length,
        });
        return true;
      }
    } catch {
      log.debug('No generation history found');
    }

    return false;
  }
}
