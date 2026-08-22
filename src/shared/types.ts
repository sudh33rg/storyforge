/**
 * StoryForge Shared Type Definitions
 *
 * Core types used across the intelligence engine, workflow, and extension layers.
 */

// ─── Identification ─────────────────────────────────────────────────────────

/** Unique identifier for any entity in StoryForge */
export type EntityId = string;

/** Qualified name (e.g., "com.example.service.UserController.getUser") */
export type QualifiedName = string;

/** File path relative to the workspace root */
export type RelativePath = string;

/** Absolute file path */
export type AbsolutePath = string;

// ─── Source Location ─────────────────────────────────────────────────────────

export interface SourceLocation {
  readonly filePath: RelativePath;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface SourceRange {
  readonly filePath: RelativePath;
  readonly startLine: number;
  readonly endLine: number;
}

// ─── Language Support ────────────────────────────────────────────────────────

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'java'
  | 'csharp'
  | 'python'
  | 'go'
  | 'rust'
  | 'cpp'
  | 'sql'
  | 'docker'
  | 'yaml'
  | 'json'
  | 'markdown';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'typescript',
  'javascript',
  'java',
  'csharp',
  'python',
  'go',
  'rust',
  'cpp',
  'sql',
  'docker',
  'yaml',
  'json',
  'markdown',
] as const;

export const LANGUAGE_EXTENSIONS: Record<SupportedLanguage, readonly string[]> = {
  typescript: ['.ts', '.tsx', '.mts', '.cts'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  java: ['.java'],
  csharp: ['.cs'],
  python: ['.py'],
  go: ['.go'],
  rust: ['.rs'],
  cpp: ['.cpp', '.cc', '.cxx', '.c', '.hpp', '.h', '.hxx'],
  sql: ['.sql'],
  docker: ['dockerfile', '.dockerfile', 'docker-compose.yml', 'docker-compose.yaml'],
  yaml: ['.yaml', '.yml'],
  json: ['.json'],
  markdown: ['.md', '.mdx', '.markdown'],
};

// ─── Evidence & Confidence ──────────────────────────────────────────────────

/**
 * Resolution status of an intelligence conclusion.
 *
 * - confirmed:  Statically verified via AST, imports, or LSP
 * - resolved:   Inferred with high confidence from strong heuristics
 * - heuristic:  Inferred with medium confidence from naming/structural patterns
 * - unresolved: Possible relationship, insufficient evidence to confirm
 */
export type ResolutionStatus = 'confirmed' | 'resolved' | 'heuristic' | 'unresolved';

export interface Evidence {
  readonly type: EvidenceType;
  readonly source: SourceLocation | RelativePath;
  readonly description: string;
  readonly resolution: ResolutionStatus;
  readonly confidence: number; // 0.0 - 1.0
}

export type EvidenceType =
  | 'import-statement'
  | 'call-site'
  | 'type-reference'
  | 'inheritance'
  | 'implementation'
  | 'api-route'
  | 'configuration'
  | 'naming-convention'
  | 'structural-proximity'
  | 'lsp-reference'
  | 'lsp-call-hierarchy'
  | 'test-assertion'
  | 'annotation'
  | 'decorator'
  | 'sql-query'
  | 'docker-binding'
  | 'yaml-config'
  | 'markdown-doc';

export interface ConfidenceSummary {
  readonly overall: number;
  readonly confirmedCount: number;
  readonly resolvedCount: number;
  readonly heuristicCount: number;
  readonly unresolvedCount: number;
}

// ─── Symbol Kinds ────────────────────────────────────────────────────────────

export type SymbolKind =
  | 'class'
  | 'interface'
  | 'struct'
  | 'trait'
  | 'impl'
  | 'enum'
  | 'function'
  | 'method'
  | 'constructor'
  | 'property'
  | 'field'
  | 'variable'
  | 'constant'
  | 'type-alias'
  | 'namespace'
  | 'module'
  | 'package'
  | 'import'
  | 'export'
  | 'decorator'
  | 'annotation'
  | 'parameter'
  | 'generic-type'
  | 'table'
  | 'column'
  | 'docker-service'
  | 'config-item'
  | 'doc-section';

// ─── Architectural Concepts ──────────────────────────────────────────────────

export type ArchitecturalRole =
  | 'controller'
  | 'service'
  | 'repository'
  | 'model'
  | 'dto'
  | 'entity'
  | 'handler'
  | 'middleware'
  | 'guard'
  | 'interceptor'
  | 'pipe'
  | 'filter'
  | 'resolver'
  | 'gateway'
  | 'factory'
  | 'provider'
  | 'module'
  | 'component'
  | 'directive'
  | 'hook'
  | 'store'
  | 'action'
  | 'reducer'
  | 'saga'
  | 'effect'
  | 'utility'
  | 'configuration'
  | 'migration'
  | 'test'
  | 'test-fixture'
  | 'unknown';

export type ArchitecturalPattern =
  | 'mvc'
  | 'mvvm'
  | 'microservices'
  | 'monolith'
  | 'layered'
  | 'event-driven'
  | 'cqrs'
  | 'hexagonal'
  | 'clean-architecture'
  | 'plugin-based'
  | 'unknown';

export type ArchitecturalLayer =
  | 'presentation'
  | 'api'
  | 'business-logic'
  | 'data-access'
  | 'infrastructure'
  | 'shared'
  | 'test'
  | 'build'
  | 'deployment'
  | 'unknown';

// ─── Parsed Symbol ───────────────────────────────────────────────────────────

/**
 * A symbol extracted from source code by the parser.
 * This is the raw parsed output before graph insertion.
 */
export interface ParsedSymbol {
  readonly name: string;
  readonly qualifiedName: QualifiedName;
  readonly kind: SymbolKind;
  readonly language: SupportedLanguage;
  readonly location: SourceLocation;
  readonly filePath: RelativePath;
  readonly documentation?: string;
  readonly decorators?: string[];
  readonly modifiers?: string[];
  readonly typeAnnotation?: string;
  readonly parameters?: ParsedParameter[];
  readonly returnType?: string;
  readonly parentSymbol?: QualifiedName;
  readonly imports?: ParsedImport[];
  readonly callSites?: ParsedCallSite[];
  readonly typeReferences?: string[];
  readonly implementsTypes?: string[];
  readonly extendsType?: string;
}

export interface ParsedParameter {
  readonly name: string;
  readonly type?: string;
  readonly defaultValue?: string;
  readonly isOptional: boolean;
}

export interface ParsedImport {
  readonly source: string;
  readonly specifiers: string[];
  readonly isDefault: boolean;
  readonly isNamespace: boolean;
  readonly location: SourceLocation;
}

export interface ParsedCallSite {
  readonly callee: string;
  readonly location: SourceLocation;
  readonly arguments?: string[];
}

// ─── File Metadata ───────────────────────────────────────────────────────────

export interface FileMetadata {
  readonly path: RelativePath;
  readonly language: SupportedLanguage;
  readonly size: number;
  readonly hash: string;
  readonly lastModified: number;
  readonly lastAnalyzed?: number;
  readonly generation?: number;
  readonly symbolCount: number;
}

// ─── Disposable Pattern ──────────────────────────────────────────────────────

export interface Disposable {
  dispose(): void;
}
