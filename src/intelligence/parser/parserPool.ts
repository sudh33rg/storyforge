/**
 * Parser Pool
 *
 * Orchestrates file discovery, language detection, and batch parsing.
 * Acts as the entry point for the intelligence engine's parsing pipeline.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '../../shared/logger.js';
import type { SupportedLanguage, RelativePath, FileMetadata } from '../../shared/types.js';
import { detectLanguage } from './languageAdapters.js';
import { parseFile, type FileParseResult } from './treeSitterParser.js';

const log = createLogger('intelligence:parser:pool');

export interface ParserPoolOptions {
  readonly workspaceRoot: string;
  readonly excludePatterns: string[];
  readonly maxFileSize: number;
}

export interface ScanResult {
  readonly files: FileMetadata[];
  readonly parseResults: FileParseResult[];
  readonly errors: Array<{ filePath: string; error: string }>;
  readonly totalFiles: number;
  readonly parsedFiles: number;
  readonly skippedFiles: number;
  readonly durationMs: number;
}

/**
 * Discover and parse all supported files in a workspace.
 */
export async function scanWorkspace(options: ParserPoolOptions): Promise<ScanResult> {
  const startTime = performance.now();
  const { workspaceRoot, excludePatterns, maxFileSize } = options;

  log.info('Starting workspace scan', { workspaceRoot, maxFileSize });

  // Step 1: Discover files
  const allFiles = await discoverFiles(workspaceRoot, excludePatterns);
  log.info('Files discovered', { total: allFiles.length });

  // Step 2: Filter and classify files
  const supportedFiles: Array<{ absolutePath: string; relativePath: RelativePath; language: SupportedLanguage }> = [];
  let skippedFiles = 0;

  for (const filePath of allFiles) {
    const relativePath = path.relative(workspaceRoot, filePath);
    const language = detectLanguage(relativePath);

    if (!language) {
      skippedFiles++;
      continue;
    }

    // Check file size
    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.size > maxFileSize) {
        log.debug('File skipped (too large)', { filePath: relativePath, size: stats.size });
        skippedFiles++;
        continue;
      }
    } catch {
      skippedFiles++;
      continue;
    }

    supportedFiles.push({ absolutePath: filePath, relativePath, language });
  }

  log.info('Supported files identified', {
    supported: supportedFiles.length,
    skipped: skippedFiles,
  });

  // Step 3: Parse files
  const fileMetadatas: FileMetadata[] = [];
  const parseResults: FileParseResult[] = [];
  const errors: Array<{ filePath: string; error: string }> = [];

  for (const file of supportedFiles) {
    try {
      const sourceCode = await fs.promises.readFile(file.absolutePath, 'utf-8');
      const hash = crypto.createHash('sha256').update(sourceCode).digest('hex').slice(0, 16);

      const result = parseFile(sourceCode, file.relativePath, file.language);
      parseResults.push(result);

      const stats = await fs.promises.stat(file.absolutePath);
      fileMetadatas.push({
        path: file.relativePath,
        language: file.language,
        size: stats.size,
        hash,
        lastModified: stats.mtimeMs,
        lastAnalyzed: Date.now(),
        symbolCount: result.symbols.length,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ filePath: file.relativePath, error: errorMsg });
      log.warn('Failed to parse file', { filePath: file.relativePath, error: errorMsg });
    }
  }

  const durationMs = performance.now() - startTime;

  log.info('Workspace scan complete', {
    totalFiles: allFiles.length,
    parsedFiles: parseResults.length,
    skippedFiles,
    errors: errors.length,
    durationMs: Math.round(durationMs),
  });

  return {
    files: fileMetadatas,
    parseResults,
    errors,
    totalFiles: allFiles.length,
    parsedFiles: parseResults.length,
    skippedFiles,
    durationMs,
  };
}

/**
 * Parse a single changed file (for incremental updates).
 */
export async function parseChangedFile(
  absolutePath: string,
  workspaceRoot: string,
): Promise<{ metadata: FileMetadata; result: FileParseResult } | undefined> {
  const relativePath = path.relative(workspaceRoot, absolutePath);
  const language = detectLanguage(relativePath);

  if (!language) return undefined;

  try {
    const sourceCode = await fs.promises.readFile(absolutePath, 'utf-8');
    const hash = crypto.createHash('sha256').update(sourceCode).digest('hex').slice(0, 16);
    const stats = await fs.promises.stat(absolutePath);

    const result = parseFile(sourceCode, relativePath, language);

    const metadata: FileMetadata = {
      path: relativePath,
      language,
      size: stats.size,
      hash,
      lastModified: stats.mtimeMs,
      lastAnalyzed: Date.now(),
      symbolCount: result.symbols.length,
    };

    return { metadata, result };
  } catch (err) {
    log.warn('Failed to parse changed file', {
      filePath: relativePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

// ─── File Discovery ──────────────────────────────────────────────────────────

/**
 * Recursively discover all files in a directory, applying exclude patterns.
 */
async function discoverFiles(
  dir: string,
  excludePatterns: string[],
  relativeTo?: string,
): Promise<string[]> {
  const root = relativeTo ?? dir;
  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(root, fullPath);

    // Check exclude patterns
    if (shouldExclude(relPath, entry.name, excludePatterns)) {
      continue;
    }

    if (entry.isDirectory()) {
      const subFiles = await discoverFiles(fullPath, excludePatterns, root);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Check if a path should be excluded based on glob-like patterns.
 */
function shouldExclude(relativePath: string, name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple glob matching
    if (pattern.includes('**/')) {
      const suffix = pattern.replace('**/', '');
      if (suffix.endsWith('/**')) {
        const dirName = suffix.replace('/**', '');
        if (name === dirName || relativePath.includes(`/${dirName}/`) || relativePath.startsWith(`${dirName}/`)) {
          return true;
        }
      } else {
        const parts = suffix.replace('*', '');
        if (name === parts || relativePath.includes(parts)) {
          return true;
        }
      }
    }

    // Direct name match
    if (name === pattern || name === pattern.replace('*', '')) {
      return true;
    }

    // Hidden directories
    if (name.startsWith('.') && !name.startsWith('.storyforge')) {
      return true;
    }
  }

  return false;
}
