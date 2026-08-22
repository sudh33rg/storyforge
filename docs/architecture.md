# StoryForge System Architecture

StoryForge is architected around a single inviolable principle:

> **Intelligence First. Everything else is a consumer of Intelligence.**

```
                     ┌────────────────────────┐
                     │ StoryForge Intelligence│
                     │ (Graph, Index, Evidence)│
                     └───────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ VS Code Ext Host │    │ Copilot Chat     │    │ Webview Panel    │
│ Commands & Trees │    │ @storyforge      │    │ Workbench UI     │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

The extension UI, Copilot chat participant, and webviews contain **zero business intelligence**. They are thin consumers delegating all semantic reasoning, graph queries, context synthesis, and impact calculations to the `IntelligenceEngine` and `WorkflowEngine`.

---

## 1. Subsystem Architecture

### 1.1 Ingestion & Parsing Subsystem (`src/intelligence/parser/`)
- **`LanguageAdapter`**: Extensible registry supporting TypeScript, JavaScript, Java, C#, Python, and Go with AST & regex extraction.
- **`TreeSitterParser`**: Extracts structural AST information (classes, interfaces, methods, imports, decorators, API mappings).
- **`LspBridge` / `VscLspBridge`**: Bridges VS Code's active Language Server Protocol instances (`vscode.executeDefinitionProvider`, `vscode.executeReferenceProvider`, `vscode.prepareCallHierarchy`, `vscode.executeImplementationProvider`) to enrich graph edges.
- **`ParserPool`**: Manages batch scanning and single-file incremental parsing with exclusion glob filtering and file size bounds.

### 1.2 Knowledge Graph Engine (`src/intelligence/graph/`)
- **`KnowledgeGraph`**: In-memory directed multigraph with bidirectional adjacency indexes (`outgoingEdges` and `incomingEdges`).
- **`GraphNode` & `GraphEdge`**: Strongly-typed entity representations across 13 node types and 19+ relationship types.
- **`GraphQuery`**: High-performance algorithms for BFS traversal, shortest path resolution, dependency tree extraction, and blast-radius impact analysis.
- **`GraphSerializer`**: Workspace-local atomic disk persistence in `.storyforge/graph.json` with automatic backup recovery (`.storyforge/graph.backup.json`).

### 1.3 Analysis Pipeline (`src/intelligence/analyzer/`)
- **`StructureAnalyzer`**: Identifies project frameworks (React, NestJS, Express, Spring, ASP.NET, Flask, Gin) and categorizes architectural layers.
- **`RelationshipAnalyzer`**: Traces cross-file imports, method calls, interface implementations, and API route bindings.
- **`ArchitectureAnalyzer`**: Detects architectural patterns (MVC, Layered, Microservices, Event-Driven) and computes language distributions and test coverage.
- **`ImpactAnalyzer`**: Evaluates blast-radius risks for candidate changes and flags impacted test suites.

### 1.4 Specialized Context & Capability Engine (`src/intelligence/context/`)
- **`ContextBuilder`**: Synthesizes relevant subgraphs into 3 targeted context structures:
  1. `FeatureIntelligenceContext`: Raw semantic discovery package.
  2. `DiscoveryContext`: Affected areas, current vs. proposed behaviors, risks, and assumptions.
  3. `StoryIntelligenceContext`: Component/API mappings, Gherkin AC templates, and QA scenario matrices.
- **`CapabilityChain`**: Extracts the 11-stage capability reasoning flow (`Stage 1 -> Stage 11`) linking user intent down to code and tests.
- **`EvidenceCollector`**: Merges provenance records and computes weighted confidence statistics (`confirmed`, `resolved`, `heuristic`, `unresolved`).
- **Absence & Uncertainty Reasoning**: Explicitly flags capabilities missing from the repository rather than fabricating hallucinated code.

### 1.5 Generational Staleness Auditor (`src/intelligence/stalenessAuditor.ts`)
- **`auditStoriesStaleness`**: Audits active User Stories and QA Stories against repository code changes across intelligence generations, flagging stale items and proposing reconciliation actions.

### 1.6 Core Workflow & LLM Reasoning Engine (`src/core/`)
- **`WorkflowEngine`**: Manages state machine lifecycles (`feature-input` → `discovery-review` → `story-generation` → `story-review` → `qa-review` → `alm-push`).
- **`VscLlmProvider`**: Integrates with VS Code Language Model API (`vscode.lm`) using GitHub Copilot models (`gpt-4o`, `copilot`) with automated JSON repair and deterministic offline fallbacks.

### 1.7 ALM Provider Subsystem (`src/alm/`)
- **`AlmProvider` Interface**: Pluggable abstraction for enterprise lifecycle management.
- **Implementations**:
  - `ValueEdgeProvider`: OpenText ValueEdge integration.
  - `GitHubProvider`: GitHub Issues & Projects integration.
  - `JiraProvider`: Atlassian Jira Cloud REST integration.

---

## 2. Storage & Zero-Infrastructure Guarantee

StoryForge requires **zero external databases or cloud servers**. Everything is stored inside `.storyforge/` in the workspace root:

```
.storyforge/
├── graph.json              # Serialized knowledge graph
├── graph.backup.json       # Previous generation snapshot
├── generations/
│   └── generation-summary.json  # Historical audit log
└── cache/                  # AST parse and hash cache
```

Atomic write operations ensure resilience against IDE restarts or power failures.
