/**
 * Tree-sitter Parser
 *
 * Wraps web-tree-sitter for portable WASM-based AST parsing.
 * Falls back to regex-based language adapters when WASM grammars
 * are unavailable.
 */

import type {
  SupportedLanguage,
  ParsedSymbol,
  ParsedImport,
  RelativePath,
} from '../../shared/types.js';
import { ParserError } from '../../shared/errors.js';
import { createLogger } from '../../shared/logger.js';
import { getLanguageAdapter, type DetectedApiEndpoint } from './languageAdapters.js';

const log = createLogger('intelligence:parser:treesitter');

/**
 * Result of parsing a single file.
 */
export interface FileParseResult {
  readonly filePath: RelativePath;
  readonly language: SupportedLanguage;
  readonly symbols: ParsedSymbol[];
  readonly imports: ParsedImport[];
  readonly apiEndpoints: DetectedApiEndpoint[];
  readonly parseTimeMs: number;
  readonly usedTreeSitter: boolean;
}

/**
 * Parse a source file and extract all structural information.
 *
 * Currently uses regex-based fallback parsers.
 * Tree-sitter WASM integration will be layered on top when grammars are available.
 */
export function parseFile(
  sourceCode: string,
  filePath: RelativePath,
  language: SupportedLanguage,
): FileParseResult {
  const startTime = performance.now();
  const adapter = getLanguageAdapter(language);

  if (!adapter) {
    throw new ParserError(
      `No language adapter registered for: ${language}`,
      filePath,
      language,
    );
  }

  try {
    const symbols = adapter.extractSymbols(sourceCode, filePath);
    const imports = adapter.extractImports(sourceCode, filePath);
    const apiEndpoints = adapter.detectApiEndpoints?.(sourceCode, filePath, symbols) ?? [];

    const parseTimeMs = performance.now() - startTime;

    log.debug('File parsed', {
      filePath,
      language,
      symbols: symbols.length,
      imports: imports.length,
      apiEndpoints: apiEndpoints.length,
      parseTimeMs: Math.round(parseTimeMs * 100) / 100,
    });

    return {
      filePath,
      language,
      symbols,
      imports,
      apiEndpoints,
      parseTimeMs,
      usedTreeSitter: false, // Will be true when Tree-sitter WASM is loaded
    };
  } catch (err) {
    throw new ParserError(
      `Failed to parse file: ${err instanceof Error ? err.message : String(err)}`,
      filePath,
      language,
    );
  }
}

/**
 * Parse multiple files in batch.
 * Returns results for files that parsed successfully, with errors logged.
 */
export function parseFiles(
  files: Array<{ sourceCode: string; filePath: RelativePath; language: SupportedLanguage }>,
): { results: FileParseResult[]; errors: Array<{ filePath: string; error: string }> } {
  const results: FileParseResult[] = [];
  const errors: Array<{ filePath: string; error: string }> = [];

  for (const file of files) {
    try {
      results.push(parseFile(file.sourceCode, file.filePath, file.language));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ filePath: file.filePath, error: errorMsg });
      log.warn('Failed to parse file', { filePath: file.filePath, error: errorMsg });
    }
  }

  return { results, errors };
}
