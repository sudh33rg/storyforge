/**
 * Symbol Index
 *
 * Fast inverted index for symbol lookup.
 * Avoids requiring all graph nodes in memory for simple queries.
 */

import { createLogger } from '../../shared/logger.js';
import type { EntityId, SymbolKind, SupportedLanguage, RelativePath } from '../../shared/types.js';

const log = createLogger('intelligence:index:symbol');

export interface SymbolIndexEntry {
  readonly id: EntityId;
  readonly name: string;
  readonly qualifiedName: string;
  readonly kind: SymbolKind;
  readonly language: SupportedLanguage;
  readonly filePath: RelativePath;
}

export class SymbolIndex {
  private readonly byName = new Map<string, Set<EntityId>>();
  private readonly byKind = new Map<SymbolKind, Set<EntityId>>();
  private readonly byFile = new Map<RelativePath, Set<EntityId>>();
  private readonly entries = new Map<EntityId, SymbolIndexEntry>();

  /**
   * Add a symbol to the index.
   */
  add(entry: SymbolIndexEntry): void {
    this.entries.set(entry.id, entry);

    // Index by name (lowercase for case-insensitive search)
    const lowerName = entry.name.toLowerCase();
    if (!this.byName.has(lowerName)) this.byName.set(lowerName, new Set());
    this.byName.get(lowerName)!.add(entry.id);

    // Index by kind
    if (!this.byKind.has(entry.kind)) this.byKind.set(entry.kind, new Set());
    this.byKind.get(entry.kind)!.add(entry.id);

    // Index by file
    if (!this.byFile.has(entry.filePath)) this.byFile.set(entry.filePath, new Set());
    this.byFile.get(entry.filePath)!.add(entry.id);
  }

  /**
   * Remove all symbols for a given file.
   */
  removeByFile(filePath: RelativePath): void {
    const ids = this.byFile.get(filePath);
    if (!ids) return;

    for (const id of ids) {
      const entry = this.entries.get(id);
      if (entry) {
        this.byName.get(entry.name.toLowerCase())?.delete(id);
        this.byKind.get(entry.kind)?.delete(id);
        this.entries.delete(id);
      }
    }

    this.byFile.delete(filePath);
  }

  /**
   * Search symbols by name (case-insensitive substring match).
   */
  searchByName(query: string): SymbolIndexEntry[] {
    const lowerQuery = query.toLowerCase();
    const results: SymbolIndexEntry[] = [];

    for (const [name, ids] of this.byName) {
      if (name.includes(lowerQuery)) {
        for (const id of ids) {
          const entry = this.entries.get(id);
          if (entry) results.push(entry);
        }
      }
    }

    return results;
  }

  /**
   * Get all symbols of a specific kind.
   */
  getByKind(kind: SymbolKind): SymbolIndexEntry[] {
    const ids = this.byKind.get(kind);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.entries.get(id))
      .filter((e): e is SymbolIndexEntry => e !== undefined);
  }

  /**
   * Get all symbols in a file.
   */
  getByFile(filePath: RelativePath): SymbolIndexEntry[] {
    const ids = this.byFile.get(filePath);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.entries.get(id))
      .filter((e): e is SymbolIndexEntry => e !== undefined);
  }

  /**
   * Get total symbol count.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.byName.clear();
    this.byKind.clear();
    this.byFile.clear();
    this.entries.clear();
  }
}
