/**
 * StoryForge Repository & Software Engineering Ontology (Layer 1)
 *
 * Formal specification of concepts, relationships, layer constraints,
 * and architectural invariant rules for software repositories.
 *
 * Implements the "Ontology Layer (Defines)" in the 5-Tier Intelligence Architecture:
 * Defines the structure, meaning, constraints, and valid relationships of the codebase.
 */

import type {
  GraphNodeType,
} from '../graph/graphNode.js';
import type {
  GraphEdgeType,
} from '../graph/graphEdge.js';
import type {
  ArchitecturalLayer,
} from '../../shared/types.js';

// ─── Concept Specification ───────────────────────────────────────────────────

export interface OntologyConceptSpec {
  readonly type: GraphNodeType;
  readonly name: string;
  readonly description: string;
  readonly level: number; // 1-8 abstraction hierarchy
  readonly allowedParentTypes: readonly GraphNodeType[];
  readonly allowedParents: readonly GraphNodeType[]; // alias for compatibility
  readonly allowedChildTypes: readonly GraphNodeType[];
}

export const ONTOLOGY_CONCEPTS: Record<GraphNodeType, OntologyConceptSpec> = {
  repository: {
    type: 'repository',
    name: 'Repository',
    description: 'Root container representing the entire version-controlled workspace.',
    level: 1,
    allowedParentTypes: [],
    allowedParents: [],
    allowedChildTypes: ['project', 'application', 'service', 'module', 'file', 'configuration', 'documentation'],
  },
  project: {
    type: 'project',
    name: 'Project / Package',
    description: 'Build or package unit identified by a manifest (package.json, pom.xml, Cargo.toml, go.mod, etc.).',
    level: 2,
    allowedParentTypes: ['repository'],
    allowedParents: ['repository'],
    allowedChildTypes: ['module', 'file', 'external-dependency', 'configuration', 'test-suite'],
  },
  application: {
    type: 'application',
    name: 'Application',
    description: 'A runnable user-facing application (SPA, mobile app, CLI tool, or desktop app).',
    level: 3,
    allowedParentTypes: ['repository', 'project'],
    allowedParents: ['repository', 'project'],
    allowedChildTypes: ['module', 'component', 'file'],
  },
  service: {
    type: 'service',
    name: 'Backend Service',
    description: 'A backend server, microservice, or daemon handling API requests, RPCs, or jobs.',
    level: 3,
    allowedParentTypes: ['repository', 'project'],
    allowedParents: ['repository', 'project'],
    allowedChildTypes: ['module', 'component', 'api-endpoint', 'file'],
  },
  module: {
    type: 'module',
    name: 'Logical Module',
    description: 'Cohesive namespace or directory grouping related components and files.',
    level: 4,
    allowedParentTypes: ['repository', 'project', 'application', 'service', 'module'],
    allowedParents: ['repository', 'project', 'application', 'service', 'module'],
    allowedChildTypes: ['component', 'file', 'symbol', 'api-endpoint'],
  },
  component: {
    type: 'component',
    name: 'Architectural Component',
    description: 'High-level programmatic component: Class, Struct, Interface, Trait, or React/Vue Component.',
    level: 5,
    allowedParentTypes: ['file', 'module'],
    allowedParents: ['file', 'module'],
    allowedChildTypes: ['symbol'],
  },
  file: {
    type: 'file',
    name: 'Source File',
    description: 'Individual source code, schema, configuration, or documentation file on disk.',
    level: 6,
    allowedParentTypes: ['repository', 'project', 'module'],
    allowedParents: ['repository', 'project', 'module'],
    allowedChildTypes: ['component', 'symbol', 'api-endpoint', 'test-suite', 'database-table', 'docker-service'],
  },
  symbol: {
    type: 'symbol',
    name: 'Code Symbol',
    description: 'Fine-grained symbol: function, method, property, variable, constant, or type-alias.',
    level: 7,
    allowedParentTypes: ['component', 'file'],
    allowedParents: ['component', 'file'],
    allowedChildTypes: [],
  },
  concept: {
    type: 'concept',
    name: 'Domain Concept',
    description: 'Semantic or business concept (e.g. Authentication, Payment, Order, Session, RateLimiting).',
    level: 8,
    allowedParentTypes: [],
    allowedParents: [],
    allowedChildTypes: [],
  },
  'api-endpoint': {
    type: 'api-endpoint',
    name: 'API Endpoint Route',
    description: 'HTTP, REST, GraphQL, or gRPC endpoint definition with method, path, and handler binding.',
    level: 5,
    allowedParentTypes: ['file', 'service', 'module', 'component'],
    allowedParents: ['file', 'service', 'module', 'component'],
    allowedChildTypes: [],
  },
  'test-suite': {
    type: 'test-suite',
    name: 'Test Suite',
    description: 'Automated test file or suite validating units, integration, or end-to-end scenarios.',
    level: 5,
    allowedParentTypes: ['project', 'module', 'file'],
    allowedParents: ['project', 'module', 'file'],
    allowedChildTypes: [],
  },
  configuration: {
    type: 'configuration',
    name: 'Configuration',
    description: 'Configuration file, environment definition, or feature flag registry.',
    level: 6,
    allowedParentTypes: ['repository', 'project', 'file'],
    allowedParents: ['repository', 'project', 'file'],
    allowedChildTypes: [],
  },
  'external-dependency': {
    type: 'external-dependency',
    name: 'External Dependency',
    description: 'Third-party library, package, or framework imported from an external registry.',
    level: 4,
    allowedParentTypes: ['project'],
    allowedParents: ['project'],
    allowedChildTypes: [],
  },
  'database-table': {
    type: 'database-table',
    name: 'Database Table / Entity Schema',
    description: 'Relational or document schema definition with columns, types, keys, and constraints.',
    level: 5,
    allowedParentTypes: ['file', 'module'],
    allowedParents: ['file', 'module'],
    allowedChildTypes: [],
  },
  'docker-service': {
    type: 'docker-service',
    name: 'Container Service',
    description: 'Containerized infrastructure service defined in Dockerfile or docker-compose.yml.',
    level: 3,
    allowedParentTypes: ['file', 'repository'],
    allowedParents: ['file', 'repository'],
    allowedChildTypes: [],
  },
  documentation: {
    type: 'documentation',
    name: 'Documentation Section',
    description: 'Markdown document, architecture decision record (ADR), or specification document.',
    level: 6,
    allowedParentTypes: ['repository', 'file'],
    allowedParents: ['repository', 'file'],
    allowedChildTypes: [],
  },
};

// ─── Relationship Specification ──────────────────────────────────────────────

export interface RelationshipRule {
  readonly type: GraphEdgeType;
  readonly validSources: readonly GraphNodeType[];
  readonly validTargets: readonly GraphNodeType[];
  readonly description: string;
}

export const ONTOLOGY_RELATIONSHIPS: Record<GraphEdgeType, RelationshipRule> = {
  contains: {
    type: 'contains',
    validSources: ['repository', 'project', 'application', 'service', 'module', 'file', 'component'],
    validTargets: ['project', 'application', 'service', 'module', 'file', 'component', 'symbol', 'api-endpoint', 'test-suite', 'database-table', 'docker-service', 'documentation'],
    description: 'Hierarchical containment relationship.',
  },
  'defined-in': {
    type: 'defined-in',
    validSources: ['file', 'component'],
    validTargets: ['symbol', 'component', 'database-table'],
    description: 'Symbol or entity definition location.',
  },
  imports: {
    type: 'imports',
    validSources: ['file', 'module'],
    validTargets: ['file', 'module', 'external-dependency'],
    description: 'Explicit module or file import statement.',
  },
  'depends-on': {
    type: 'depends-on',
    validSources: ['component', 'service', 'module', 'file', 'docker-service', 'database-table'],
    validTargets: ['component', 'service', 'module', 'file', 'external-dependency', 'docker-service', 'database-table'],
    description: 'Direct programmatic or operational dependency.',
  },
  'uses-package': {
    type: 'uses-package',
    validSources: ['project', 'file', 'module'],
    validTargets: ['external-dependency'],
    description: 'Third-party package consumption.',
  },
  implements: {
    type: 'implements',
    validSources: ['component', 'symbol'],
    validTargets: ['component', 'symbol'],
    description: 'Class or struct implements an interface, abstract class, or trait.',
  },
  extends: {
    type: 'extends',
    validSources: ['component', 'symbol'],
    validTargets: ['component', 'symbol'],
    description: 'Inheritance extension from superclass or parent interface.',
  },
  'type-reference': {
    type: 'type-reference',
    validSources: ['symbol', 'component'],
    validTargets: ['component', 'symbol'],
    description: 'Field, parameter, or return type reference.',
  },
  calls: {
    type: 'calls',
    validSources: ['symbol', 'component'],
    validTargets: ['symbol', 'component'],
    description: 'Function or method invocation.',
  },
  instantiates: {
    type: 'instantiates',
    validSources: ['symbol', 'component'],
    validTargets: ['component'],
    description: 'Constructs an instance of a class/struct.',
  },
  'api-flow': {
    type: 'api-flow',
    validSources: ['api-endpoint'],
    validTargets: ['component', 'symbol', 'service'],
    description: 'Flow from route to handler, service, or controller.',
  },
  'handles-route': {
    type: 'handles-route',
    validSources: ['component', 'symbol'],
    validTargets: ['api-endpoint'],
    description: 'Controller or function acts as endpoint handler.',
  },
  'consumes-api': {
    type: 'consumes-api',
    validSources: ['component', 'service', 'application'],
    validTargets: ['api-endpoint'],
    description: 'Client or service calls an external or internal endpoint.',
  },
  'communicates-with': {
    type: 'communicates-with',
    validSources: ['service', 'docker-service'],
    validTargets: ['service', 'docker-service'],
    description: 'Inter-service RPC, HTTP, or queue communication.',
  },
  'publishes-event': {
    type: 'publishes-event',
    validSources: ['component', 'service'],
    validTargets: ['concept', 'component', 'service'],
    description: 'Publishes message to event bus or queue.',
  },
  'subscribes-event': {
    type: 'subscribes-event',
    validSources: ['component', 'service'],
    validTargets: ['concept', 'component', 'service'],
    description: 'Consumes messages from event bus or queue.',
  },
  'data-flow': {
    type: 'data-flow',
    validSources: ['component', 'symbol', 'database-table'],
    validTargets: ['component', 'symbol', 'database-table'],
    description: 'Data transformation or persistence pipeline.',
  },
  'reads-from': {
    type: 'reads-from',
    validSources: ['component', 'symbol', 'service'],
    validTargets: ['database-table', 'configuration'],
    description: 'Queries or retrieves data from database table or config.',
  },
  'writes-to': {
    type: 'writes-to',
    validSources: ['component', 'symbol', 'service'],
    validTargets: ['database-table', 'configuration'],
    description: 'Inserts, updates, or mutates database table or config.',
  },
  'maps-to': {
    type: 'maps-to',
    validSources: ['component', 'symbol'],
    validTargets: ['database-table', 'component'],
    description: 'DTO, model, or ORM entity mapping.',
  },
  configures: {
    type: 'configures',
    validSources: ['configuration', 'file'],
    validTargets: ['service', 'project', 'component', 'module'],
    description: 'Configuration property applies to target.',
  },
  'feature-flag': {
    type: 'feature-flag',
    validSources: ['configuration'],
    validTargets: ['component', 'api-endpoint', 'symbol'],
    description: 'Feature flag conditionally gates code.',
  },
  tests: {
    type: 'tests',
    validSources: ['test-suite', 'file'],
    validTargets: ['component', 'symbol', 'api-endpoint', 'module', 'file'],
    description: 'Test suite provides verification coverage.',
  },
  'test-fixture': {
    type: 'test-fixture',
    validSources: ['test-suite'],
    validTargets: ['file', 'component', 'database-table'],
    description: 'Test uses fixture, mock, or seeder.',
  },
  'related-concept': {
    type: 'related-concept',
    validSources: ['concept'],
    validTargets: ['concept'],
    description: 'Semantic relatedness between domain concepts.',
  },
  'belongs-to-concept': {
    type: 'belongs-to-concept',
    validSources: ['component', 'symbol', 'file', 'api-endpoint', 'database-table'],
    validTargets: ['concept'],
    description: 'Entity belongs to a high-level domain capability.',
  },
  'layer-boundary': {
    type: 'layer-boundary',
    validSources: ['module', 'file', 'component'],
    validTargets: ['module', 'file', 'component'],
    description: 'Dependency crosses architectural layer.',
  },
  'module-boundary': {
    type: 'module-boundary',
    validSources: ['module', 'file'],
    validTargets: ['module', 'file'],
    description: 'Dependency crosses module boundary.',
  },
};

// ─── Layer Architecture Rules & Invariants ───────────────────────────────────

export const ALLOWED_LAYER_DEPENDENCIES: Record<ArchitecturalLayer, readonly ArchitecturalLayer[]> = {
  presentation: ['presentation', 'api', 'business-logic', 'shared', 'infrastructure', 'unknown'],
  api: ['api', 'business-logic', 'shared', 'infrastructure', 'unknown'],
  'business-logic': ['business-logic', 'data-access', 'shared', 'infrastructure', 'unknown'],
  'data-access': ['data-access', 'shared', 'infrastructure', 'unknown'],
  infrastructure: ['infrastructure', 'shared', 'unknown'],
  shared: ['shared', 'unknown'],
  test: ['presentation', 'api', 'business-logic', 'data-access', 'infrastructure', 'shared', 'test', 'build', 'deployment', 'unknown'],
  build: ['build', 'deployment', 'shared', 'unknown'],
  deployment: ['deployment', 'build', 'infrastructure', 'unknown'],
  unknown: ['presentation', 'api', 'business-logic', 'data-access', 'infrastructure', 'shared', 'test', 'build', 'deployment', 'unknown'],
};

/**
 * Validate whether a proposed dependency relationship satisfies ontology rules.
 * Supports both (source, target, edge) and (source, edge, target) calling conventions.
 */
export function validateRelationship(
  sourceType: GraphNodeType,
  param2: GraphNodeType | GraphEdgeType,
  param3: GraphNodeType | GraphEdgeType,
): { valid: boolean; reason?: string } {
  let targetType: GraphNodeType;
  let edgeType: GraphEdgeType;

  if (ONTOLOGY_RELATIONSHIPS[param2 as GraphEdgeType]) {
    edgeType = param2 as GraphEdgeType;
    targetType = param3 as GraphNodeType;
  } else {
    targetType = param2 as GraphNodeType;
    edgeType = param3 as GraphEdgeType;
  }

  const rule = ONTOLOGY_RELATIONSHIPS[edgeType];
  if (!rule) {
    return { valid: false, reason: `Unknown relationship type: ${edgeType}` };
  }

  if (!rule.validSources.includes(sourceType)) {
    return {
      valid: false,
      reason: `Node type '${sourceType}' cannot be the source of a '${edgeType}' relationship.`,
    };
  }

  if (!rule.validTargets.includes(targetType)) {
    return {
      valid: false,
      reason: `Node type '${targetType}' cannot be the target of a '${edgeType}' relationship.`,
    };
  }

  return { valid: true };
}

/**
 * Check if a dependency between two layers violates clean architecture boundaries.
 */
export function isLayerDependencyAllowed(
  fromLayer: ArchitecturalLayer,
  toLayer: ArchitecturalLayer,
): boolean {
  const allowed = ALLOWED_LAYER_DEPENDENCIES[fromLayer];
  return allowed ? allowed.includes(toLayer) : true;
}

/**
 * Get valid target concepts for a given relationship edge type.
 */
export function getValidTargetConcepts(edgeType: GraphEdgeType): readonly GraphNodeType[] {
  const rule = ONTOLOGY_RELATIONSHIPS[edgeType];
  return rule ? rule.validTargets : [];
}
