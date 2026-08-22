# Knowledge Graph & Query Schema Specification

The Knowledge Graph is the central reasoning substrate of StoryForge. It represents all repository structures, dependencies, data flows, and evidence records.

---

## 1. Node Types & Hierarchical Levels

Every node is indexed by a unique `EntityId` and qualified name:

```typescript
export type GraphNodeType =
  | 'repository'          // Level 1: Workspace root
  | 'project'             // Level 2: Sub-project / package definition
  | 'application'         // Level 3: Top-level app
  | 'service'             // Level 3: Microservice / API worker
  | 'module'              // Level 4: Feature slice or layer
  | 'component'           // Level 5: Class, Interface, Controller, Store
  | 'api-endpoint'        // Level 5: REST / GraphQL endpoint
  | 'test-suite'          // Level 5: Test file / suite
  | 'file'                // Level 6: Source file
  | 'configuration'       // Level 6: Config file / Feature flag
  | 'symbol'              // Level 7: Method, Function, Property, Type
  | 'concept'             // Level 8: Semantic domain concept
  | 'external-dependency' // Level 4: Third-party package
```

---

## 2. Relationship (Edge) Types

Every edge connects a source node to a target node with explicit evidence:

| Edge Type | Category | Description | Typical Source → Target |
| :--- | :--- | :--- | :--- |
| `contains` | Structural | Containment hierarchy | Module → Component, File → Symbol |
| `defined-in` | Structural | Symbol declaration | Symbol → File |
| `imports` | Dependency | Static import statement | File → File |
| `depends-on` | Dependency | Logical component dependency | Component → Component |
| `uses-package` | Dependency | Third-party package import | File → ExternalDependency |
| `implements` | Type Hierarchy | Interface implementation | Class → Interface |
| `extends` | Type Hierarchy | Class inheritance | Subclass → Superclass |
| `type-reference` | Type Hierarchy | Type usage in signature | Method → Type |
| `calls` | Invocation | Function / method call site | Method → Method |
| `instantiates` | Invocation | Object creation | Method → Class |
| `api-flow` | Routing | Endpoint to handler execution | ApiEndpoint → Controller Method |
| `handles-route` | Routing | Controller route binding | Controller → ApiEndpoint |
| `consumes-api` | Routing | Client API consumption | Service → ApiEndpoint |
| `communicates-with` | Distributed | Service-to-service call | Service → Service |
| `publishes-event` | Messaging | Message bus publication | Service → Queue / Topic |
| `subscribes-event` | Messaging | Event consumer handler | Service → Queue / Topic |
| `data-flow` | Data Pipeline | DTO to Entity transformation | DTO → Entity / Model |
| `configures` | Configuration | Config item controlling component | Configuration → Component |
| `tests` | Quality | Test suite covering component | TestSuite → Component |

---

## 3. Query Algorithms & Semantics

### 3.1 Breadth-First Traversal
`KnowledgeGraph.traverse(startId, options)` explores neighboring nodes with filter criteria:
- `maxDepth`: Maximum traversal radius (default: 5).
- `direction`: `'outgoing'`, `'incoming'`, or `'both'`.
- `edgeTypes`: Selective edge filters (e.g., `['calls', 'imports']`).
- `minConfidence`: Filter out heuristic links below threshold.

### 3.2 Shortest Path Resolution
`KnowledgeGraph.findPath(sourceId, targetId, edgeTypes)` finds the shortest directed or undirected path between two entities, providing the exact sequence of intermediate edges and evidence records.

### 3.3 Impact Analysis (Blast Radius)
`analyzeImpact(graph, nodeId, maxDepth)` computes:
- **Direct Impact**: Nodes with immediate incoming dependencies.
- **Transitive Impact**: All downstream dependent components.
- **Affected Tests**: Test suites reachable via incoming traversal.
- **Affected APIs**: Endpoints whose underlying handler chain intersects the target.
- **Risk Score**: Evaluated as `low`, `medium`, `high`, or `critical`.
