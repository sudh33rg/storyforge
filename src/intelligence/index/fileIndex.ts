/**
 * File Index
 *
 * Tracks file metadata and content hashes for change detection.
 * Used by the generation tracker to determine which files changed
 * between analysis generations.
 */

import { createLogger } from '../../shared/logger.js';
import type { RelativePath, FileMetadata, SupportedLanguage } from '../../shared/types.js';

const log = createLogger('intelligence:index:file');

export class FileIndex {
  private readonly files = new Map<RelativePath, FileMetadata>();

  /**
   * Add or update a file in the index.
   */
  set(metadata: FileMetadata): void {
    this.files.set(metadata.path, metadata);
  }

  /**
   * Get metadata for a file.
   */
  get(filePath: RelativePath): FileMetadata | undefined {
    return this.files.get(filePath);
  }

  /**
   * Remove a file from the index.
   */
  remove(filePath: RelativePath): boolean {
    return this.files.delete(filePath);
  }

  /**
   * Check if a file has changed since last analysis.
   * Compares hash to detect content changes.
   */
  hasChanged(filePath: RelativePath, newHash: string): boolean {
    const existing = this.files.get(filePath);
    if (!existing) return true; // New file
    return existing.hash !== newHash;
  }

  /**
   * Get all indexed files.
   */
  getAll(): FileMetadata[] {
    return Array.from(this.files.values());
  }

  /**
   * Get all files of a specific language.
   */
  getByLanguage(language: SupportedLanguage): FileMetadata[] {
    return Array.from(this.files.values()).filter((f) => f.language === language);
  }

  /**
   * Find files that were indexed in a specific generation.
   */
  getByGeneration(generation: number): FileMetadata[] {
    return Array.from(this.files.values()).filter((f) => f.generation === generation);
  }

  /**
   * Get statistics.
   */
  getStats(): { totalFiles: number; byLanguage: Record<string, number>; totalSize: number } {
    const byLanguage: Record<string, number> = {};
    let totalSize = 0;

    for (const file of this.files.values()) {
      byLanguage[file.language] = (byLanguage[file.language] || 0) + 1;
      totalSize += file.size;
    }

    return {
      totalFiles: this.files.size,
      byLanguage,
      totalSize,
    };
  }

  /**
   * Get total file count.
   */
  get size(): number {
    return this.files.size;
  }

  /**
   * Get all indexed file paths.
   */
  allPaths(): RelativePath[] {
    return Array.from(this.files.keys());
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.files.clear();
  }
}
