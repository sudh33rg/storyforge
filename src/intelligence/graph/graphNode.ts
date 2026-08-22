/**
 * Knowledge Graph Node Types & Schema
 *
 * Defines the hierarchical node types that represent every entity
 * in the repository at multiple levels of understanding:
 *
 * Level 1 — Repository
 * Level 2 — Project
 * Level 3 — Application / Service
 * Level 4 — Module
 * Level 5 — Component (class, interface, etc.)
 * Level 6 — File
 * Level 7 — Symbol (function, method, field)
 * Level 8 — Concept (semantic grouping)
 */

import type {
  EntityId,
  QualifiedName,
  RelativePath,
  SourceLocation,
  SupportedLanguage,
  SymbolKind,
  ArchitecturalRole,
  ArchitecturalLayer,
  Evidence,
} from '../../shared/types.js';

// ─── Node Type Enumeration ───────────────────────────────────────────────────

export type GraphNodeType =
  | 'repository'
  | 'project'
  | 'application'
  | 'service'
  | 'module'
  | 'component'
  | 'file'
  | 'symbol'
  | 'concept'
  | 'api-endpoint'
  | 'test-suite'
  | 'configuration'
  | 'external-dependency'
  | 'database-table'
  | 'docker-service'
  | 'documentation';

/** Hierarchy level for each node type (used for multi-level queries) */
export const NODE_TYPE_LEVEL: Record<GraphNodeType, number> = {
  repository: 1,
  project: 2,
  application: 3,
  service: 3,
  module: 4,
  component: 5,
  file: 6,
  symbol: 7,
  concept: 8,
  'api-endpoint': 5,
  'test-suite': 5,
  configuration: 6,
  'external-dependency': 4,
  'database-table': 5,
  'docker-service': 3,
  documentation: 6,
};

// ─── Base Node ───────────────────────────────────────────────────────────────

export interface GraphNodeBase {
  readonly id: EntityId;
  readonly type: GraphNodeType;
  readonly name: string;
  readonly qualifiedName: QualifiedName;
  readonly description?: string;
  readonly metadata: Record<string, unknown>;
  readonly generationCreated: number;
  generationUpdated: number;
}

// ─── Specialized Node Data ───────────────────────────────────────────────────

export interface RepositoryNodeData {
  readonly rootPath: string;
  readonly detectedLanguages: SupportedLanguage[];
  readonly totalFiles: number;
  readonly totalSymbols: number;
}

export interface ProjectNodeData {
  readonly path: RelativePath;
  readonly projectType?: string; // 'npm', 'maven', 'gradle', 'dotnet', 'go-module', 'pip', 'cargo'
  readonly framework?: string;
  readonly frameworkVersion?: string;
}

export interface ApplicationNodeData {
  readonly path: RelativePath;
  readonly applicationType?: 'frontend' | 'backend' | 'fullstack' | 'library' | 'tool';
}

export interface ServiceNodeData {
  readonly path: RelativePath;
  readonly serviceType?: 'rest-api' | 'grpc' | 'graphql' | 'websocket' | 'worker' | 'scheduler';
  readonly port?: number;
}

export interface ModuleNodeData {
  readonly path: RelativePath;
  readonly layer?: ArchitecturalLayer;
}

export interface ComponentNodeData {
  readonly filePath: RelativePath;
  readonly location?: SourceLocation;
  readonly language: SupportedLanguage;
  readonly symbolKind: SymbolKind;
  readonly architecturalRole: ArchitecturalRole;
  readonly modifiers?: string[];
  readonly decorators?: string[];
  readonly typeParameters?: string[];
}

export interface FileNodeData {
  readonly path: RelativePath;
  readonly language: SupportedLanguage;
  readonly size: number;
  readonly hash: string;
  readonly layer?: ArchitecturalLayer;
}

export interface SymbolNodeData {
  readonly filePath: RelativePath;
  readonly location: SourceLocation;
  readonly language: SupportedLanguage;
  readonly symbolKind: SymbolKind;
  readonly returnType?: string;
  readonly parameters?: Array<{ name: string; type?: string }>;
  readonly documentation?: string;
  readonly visibility?: 'public' | 'private' | 'protected' | 'internal';
}

export interface ConceptNodeData {
  readonly description: string;
  readonly keywords: string[];
  readonly evidence: Evidence[];
}

export interface ApiEndpointNodeData {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  readonly path: string;
  readonly filePath: RelativePath;
  readonly handlerSymbol: QualifiedName;
  readonly parameters?: Array<{ name: string; in: 'path' | 'query' | 'body' | 'header' }>;
}

export interface TestSuiteNodeData {
  readonly filePath: RelativePath;
  readonly testFramework?: string;
  readonly testCount?: number;
  readonly testNames?: string[];
}

export interface ConfigurationNodeData {
  readonly filePath: RelativePath;
  readonly configurationType: 'feature-flag' | 'environment' | 'build' | 'deployment' | 'application';
  readonly key?: string;
  readonly values?: Record<string, unknown>;
}

export interface ExternalDependencyNodeData {
  readonly packageName: string;
  readonly version?: string;
  readonly registry?: string; // 'npm', 'maven', 'nuget', 'pypi', 'go', 'cargo'
}

export interface DatabaseTableNodeData {
  readonly tableName: string;
  readonly filePath: RelativePath;
  readonly columns: Array<{ name: string; type: string; isPrimary?: boolean; isNullable?: boolean }>;
  readonly foreignKeys?: Array<{ column: string; referencesTable: string; referencesColumn: string }>;
}

export interface DockerServiceNodeData {
  readonly serviceName: string;
  readonly filePath: RelativePath;
  readonly image?: string;
  readonly buildContext?: string;
  readonly ports?: string[];
  readonly environment?: string[];
  readonly dependsOn?: string[];
}

export interface DocumentationNodeData {
  readonly title: string;
  readonly filePath: RelativePath;
  readonly sections: Array<{ heading: string; level: number }>;
}

// ─── Node Type Map ───────────────────────────────────────────────────────────

export type NodeDataMap = {
  repository: RepositoryNodeData;
  project: ProjectNodeData;
  application: ApplicationNodeData;
  service: ServiceNodeData;
  module: ModuleNodeData;
  component: ComponentNodeData;
  file: FileNodeData;
  symbol: SymbolNodeData;
  concept: ConceptNodeData;
  'api-endpoint': ApiEndpointNodeData;
  'test-suite': TestSuiteNodeData;
  configuration: ConfigurationNodeData;
  'external-dependency': ExternalDependencyNodeData;
  'database-table': DatabaseTableNodeData;
  'docker-service': DockerServiceNodeData;
  documentation: DocumentationNodeData;
};

// ─── Concrete Graph Node ─────────────────────────────────────────────────────

export interface GraphNode<T extends GraphNodeType = GraphNodeType> extends GraphNodeBase {
  readonly type: T;
  readonly data: NodeDataMap[T];
}

/**
 * Create a new graph node with the given properties.
 */
export function createGraphNode<T extends GraphNodeType>(
  type: T,
  id: EntityId,
  name: string,
  qualifiedName: QualifiedName,
  data: NodeDataMap[T],
  generation: number,
  description?: string,
): GraphNode<T> {
  return {
    id,
    type,
    name,
    qualifiedName,
    description,
    data,
    metadata: {},
    generationCreated: generation,
    generationUpdated: generation,
  };
}
