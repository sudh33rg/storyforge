/**
 * LSP Bridge
 *
 * Integrates with VS Code's built-in Language Server Protocol features
 * to enrich the knowledge graph with semantic information:
 *
 * - Type information and resolved references
 * - Call hierarchy (callers/callees)
 * - Go-to-definition resolution
 * - Find all references
 *
 * Gracefully degrades when LSP is unavailable (e.g., no language extension installed).
 */

import { createLogger } from '../../shared/logger.js';
import type { RelativePath, SourceLocation } from '../../shared/types.js';

const log = createLogger('intelligence:parser:lsp');

// ─── LSP Result Types ────────────────────────────────────────────────────────

export interface LspReference {
  readonly filePath: RelativePath;
  readonly location: SourceLocation;
  readonly kind: 'definition' | 'reference' | 'implementation';
}

export interface LspCallHierarchyItem {
  readonly name: string;
  readonly kind: string;
  readonly filePath: RelativePath;
  readonly location: SourceLocation;
}

export interface LspCallChain {
  readonly item: LspCallHierarchyItem;
  readonly callers: LspCallHierarchyItem[];
  readonly callees: LspCallHierarchyItem[];
}

export interface LspTypeInfo {
  readonly name: string;
  readonly filePath: RelativePath;
  readonly location: SourceLocation;
}

// ─── LSP Bridge Interface ────────────────────────────────────────────────────

/**
 * Interface for LSP operations.
 * Implemented by the VS Code extension layer, mocked in tests.
 */
export interface LspBridge {
  /**
   * Check if LSP is available for a given language.
   */
  isAvailable(languageId: string): Promise<boolean>;

  /**
   * Find all references to a symbol at a given location.
   */
  findReferences(
    filePath: string,
    line: number,
    column: number,
  ): Promise<LspReference[]>;

  /**
   * Go to the definition of a symbol at a given location.
   */
  findDefinition(
    filePath: string,
    line: number,
    column: number,
  ): Promise<LspReference | undefined>;

  /**
   * Get the call hierarchy (callers and callees) for a symbol.
   */
  getCallHierarchy(
    filePath: string,
    line: number,
    column: number,
  ): Promise<LspCallChain | undefined>;

  /**
   * Find all implementations of an interface/abstract class.
   */
  findImplementations(
    filePath: string,
    line: number,
    column: number,
  ): Promise<LspReference[]>;

  /**
   * Get type information at a given location.
   */
  getTypeInfo(
    filePath: string,
    line: number,
    column: number,
  ): Promise<LspTypeInfo | undefined>;
}

// ─── No-Op LSP Bridge (used when VS Code APIs are unavailable) ──────────────

/**
 * A no-op LSP bridge that returns empty results.
 * Used in tests and when running outside VS Code.
 */
export class NoOpLspBridge implements LspBridge {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async findReferences(): Promise<LspReference[]> {
    return [];
  }

  async findDefinition(): Promise<LspReference | undefined> {
    return undefined;
  }

  async getCallHierarchy(): Promise<LspCallChain | undefined> {
    return undefined;
  }

  async findImplementations(): Promise<LspReference[]> {
    return [];
  }

  async getTypeInfo(): Promise<LspTypeInfo | undefined> {
    return undefined;
  }
}

/**
 * Create the appropriate LSP bridge based on the runtime environment.
 */
export function createLspBridge(): LspBridge {
  // Check if we're running in VS Code
  try {
    // This will be replaced by the actual VS Code implementation
    // in the extension layer (src/extension/vscLspBridge.ts)
    return new NoOpLspBridge();
  } catch {
    log.info('LSP bridge: running outside VS Code, using no-op implementation');
    return new NoOpLspBridge();
  }
}
