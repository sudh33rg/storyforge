# The Core Concept: Intelligence-First Engineering System

> **"Intelligence first. Everything else is a consumer of Intelligence."**

---

## 1. Product Identity & Definition

**StoryForge** is an intelligence-first engineering system that builds and continuously maintains a deep semantic understanding of a repository, then uses that understanding to:

1. **Discover** — Collaboratively analyze feature requests against the living codebase
2. **Generate** — Produce evidence-backed user stories, QA stories, and acceptance criteria
3. **Enrich** — Turn any raw developer prompt into a repository-aware prompt with bounded, explainable context
4. **Customize** — Generate repository-specific Copilot instructions, skills, and agents
5. **Trace** — Maintain end-to-end provenance from feature intent through code to ALM work items
6. **Audit** — Detect when active stories become stale as the codebase evolves

---

## 2. The Foundational Idea

Traditional AI story generators act as simple prompt templates: you feed them a sentence, and they invent fictional code components, non-existent endpoints, and imaginary databases.

StoryForge works by grounding every interaction in a **living semantic model** of the repository:

```
                         STORYFORGE
                              │
             ┌────────────────┴────────────────┐
             │                                 │
      REPOSITORY INTELLIGENCE             USER INTENT
             │                                 │
             └──────────────┬──────────────────┘
                            │
                    CONTEXT UNDERSTANDING
                            │
             ┌──────────────┴──────────────┐
             │                             │
       WHAT EXISTS                    WHAT IS REQUESTED
             │                             │
             └──────────────┬──────────────┘
                            │
                    FEATURE DISCOVERY
                            │
                     USER ITERATION
                            │
                     APPROVED DISCOVERY
                            │
                 ┌──────────┴──────────┐
                 │                     │
             USER STORIES          QA STORIES
                 │                     │
                 └──────────┬──────────┘
                            │
                       USER APPROVAL
                            │
                         VALUEEDGE
```

---

## 3. The 4-Surface Architecture

StoryForge Intelligence is the shared foundation. All surfaces are thin consumers:

```
                   StoryForge Intelligence
                           ▲
                           │
          ┌────────────────┼────────────────┐
          │                │                │
 ① VS Code Sidebar   ② Webview        ③ Copilot Chat
   (Tree Views)      (Dashboard)       (@storyforge)
                          │
            ┌─────────────┼─────────────┐
            │             │             │
    Intelligence    Feature        Prompt
    Dashboard     Workspace      Enricher
            │
    Copilot Setup
```

### Surface ① — VS Code Sidebar (Tree Views)
Browse the knowledge graph hierarchy and active workflows directly in the activity bar. Always visible for quick reference.

### Surface ② — Webview Dashboard
A full interactive React webview with 4 major areas:

**Intelligence View** — The command center:
- Workspace metrics (files indexed, symbols, relationships, entry points, tests, dependencies)
- Graph Explorer — interactive @xyflow/react visualization with 5 modes (architecture, dependencies, calls, flows, tests-impact)
- Query Surface — 7-mode entity query (definition, callers, callees, implementations, usages, tests, trace flow)
- Coverage report and enrichment diagnostics
- Entity inspector with source links

**Copilot Setup** — Repository-specific Copilot customization:
- Generate compact `.github/copilot/` artifacts from intelligence
- Always-on repository bridge (tiny repo map)
- Scoped language guidance (per-language conventions)
- On-demand skills and focused agents
- Preview, edit, select, and apply artifacts
- Token estimation and reduction metrics

**Prompt Enricher** — The most unique capability:
- Transform raw developer prompts into repository-aware prompts
- Task-mode selection (implementation, investigation, testing, review, general)
- Rewrite level control (conservative, moderate, aggressive)
- Token budget control (768 – 12,000)
- Conversation-based iteration with follow-up turns
- Evidence attachment with source citations
- Bounded flow inclusion
- Copy enriched prompt or delegate to Copilot

**Feature Workspace** — The 3-stage pipeline:
- **Stage 1 — Feature Intent**: Title, description, acceptance context, domain terms
- **Stage 2 — Discovery**: Evidence-backed repository analysis, grouped by impact area, questions, approval
- **Stage 3 — Stories**: User stories with Gherkin ACs, QA stories with scenarios, traceability matrix
- Feature lifecycle history and archival

### Surface ③ — Copilot Chat (@storyforge)
Slash commands for quick interactions:
- `/status` — Intelligence status and generation info
- `/discover <feature>` — Start feature discovery
- `/stories` — Generate stories from approved discovery
- `/audit` — Audit active stories for staleness
- `/intelligence <query>` — Search the knowledge graph
- `/impact <component>` — Analyze change blast radius

### Surface ④ — Future CLI
The intelligence is not locked in VS Code. A future CLI can consume the same `.storyforge/` data.

---

## 4. Deep Semantic Understanding (Beyond Vector Search)

StoryForge does not simply index text or perform vector embeddings. It understands what things are and **how they relate to each other**:

### What StoryForge Understands:
- **Repository Hierarchy**: Repository, projects, applications, services, modules, components, packages, libraries.
- **API & Execution Layers**: Endpoints, routes, controllers, handlers, services, repositories, data-access components, models, DTOs, entities.
- **Infrastructure & Wiring**: Configuration, feature flags, queues/events, service-to-service communication, database interactions, external integrations.
- **Full-Stack Topology**: Frontend/backend relationships, UI components, state stores, shared/common utilities.
- **Quality & Operations**: Tests, test suites, test fixtures, build systems, deployment configurations, framework usage & versions, language versions, legacy technologies, architectural patterns, and coding conventions.
- **Relational Connectors**: Call chains, data flows, import/dependency relationships, inheritance/implementation hierarchies, API contracts, test relationships, configuration boundaries.

---

## 5. Relationship Reasoning Flow

For any feature request, StoryForge reasons through the entire capability stack:

```
Feature Request (e.g. "Add Load Test Scheduling")
      ↓
Relevant Capability (Domain Concept)
      ↓
Existing UI (Pages, Dialogs, State Stores)
      ↓
Frontend Component (TypeScript / React)
      ↓
API Endpoint (REST / GraphQL Route)
      ↓
Backend Controller (Spring / Express / ASP.NET)
      ↓
Service Layer (Business Logic & Orchestration)
      ↓
Shared Library / Utility
      ↓
Data / Configuration (DB entities, Feature Flags, YAML/JSON)
      ↓
Existing Tests (Unit, Integration, E2E Suites)
      ↓
Related Workflows (Execution Pipelines, Schedulers)
```

StoryForge knows **why** each item in this chain is relevant.

---

## 6. Evidence & Provenance

Every intelligence conclusion is anchored in verifiable evidence:

```yaml
Concept: Load Test Configuration
Relationship: Configuration UI → Configuration API
Resolution: Confirmed
Evidence:
  - src/ui/components/LoadTestConfiguration.tsx (Lines 42-88)
  - src/controllers/configurationController.ts (Lines 15-34)
Confidence: High (0.95)
```

### Resolution Taxonomy:
- **`confirmed`**: Statically proven via AST, explicit imports, or LSP type definitions.
- **`resolved`**: Inferred through strong structural patterns and naming conventions.
- **`heuristic`**: Inferred through lexical proximity or fuzzy similarity.
- **`unresolved`**: Candidate relationship requiring user clarification.

---

## 7. The Knowledge Graph as a Reasoning Substrate

The graph is not merely a visualization—it is part of the reasoning engine:

```
                    Load Test
                       │
             ┌─────────┼─────────┐
             │         │         │
          Config     Runtime    Tests
             │         │         │
          API/UI    Execution   Suites
             │         │
          Service ─── Dependency
             │
          Storage
```

### Graph Traversal Operations:
- **Callers & Callees**: Function and method invocation trees.
- **Dependencies & Dependents**: Internal imports and external package dependencies.
- **Implementations & Inheritance**: Interface and class hierarchies.
- **API Flows**: End-to-end routing from HTTP request to database persist.
- **Impact & Test Analysis**: Blast radius calculation for any proposed change.

---

## 8. The 10-Level Understanding Hierarchy

```
Level 1  — Repository
    ↓
Level 2  — Projects
    ↓
Level 3  — Applications / Services
    ↓
Level 4  — Modules
    ↓
Level 5  — Components
    ↓
Level 6  — Files
    ↓
Level 7  — Symbols
    ↓
Level 8  — Relationships
    ↓
Level 9  — Execution / Data Flows
    ↓
Level 10 — Tests / Impact
```

---

## 9. Specialized Context Packages (Never 500 Raw Files)

StoryForge builds targeted context structures:

1. **Feature Intelligence Context**: Relevant architecture, components, APIs, flows, tests, evidence, confidence scores.
2. **Discovery Context**: Feature intent vs repository understanding, affected areas, gaps, assumptions, questions.
3. **Story Intelligence Context**: Component/API mappings, Gherkin AC templates, QA scenario matrices.
4. **Prompt Enrichment Context**: Token-budgeted, evidence-backed prompt with bounded flows and source citations.
5. **Copilot Customization Context**: Compact repository bridge, scoped instructions, reusable skills.

---

## 10. Prompt Enricher — The Unique Capability

The Prompt Enricher is StoryForge's most distinctive feature. It transforms any raw developer prompt into a **repository-aware prompt** that preserves intent while adding bounded, explainable context:

```
Developer prompt: "Add caching to the user service"
         ↓
StoryForge: "What does the repository know about UserService, caching patterns, and related tests?"
         ↓
Evidence: UserService.ts:L45 (service class), CacheManager.ts (existing pattern),
          UserServiceTest.ts (8 tests), RedisConfig.ts (cache config)
         ↓
Enriched prompt: [Original intent preserved] + [Bounded evidence context] + [Relevant flows]
         ↓
Token count: 2,400 tokens (vs 180,000 tokens if full source was included)
Reduction: 98.7% smaller than equivalent source
```

### Key Properties:
- **Intent preservation**: The user's original wording is never altered
- **Bounded context**: Only relevant evidence within the token budget
- **Explainable**: Every piece of context has a reason and source location
- **Iterable**: Conversation-based follow-up turns refine the context
- **Task-aware**: Different task modes (implementation, investigation, testing) select different evidence strategies

---

## 11. Continuous Learning & Generation Tracking

StoryForge does not perform a one-time static scan. It continuously learns as the repository evolves:

```
Repository
    ↓
Discovery & Parsing
    ↓
Knowledge Graph
    ↓
Published Intelligence (Generation 41)
    ↓
Developer changes code
    ↓
Affected-area detection
    ↓
Incremental re-analysis
    ↓
Updated Intelligence (Generation 42)
```

StoryForge always knows which generation it is using and audits whether active user stories are in sync with the latest code state.

---

## 12. Absence and Uncertainty

StoryForge recognizes what is missing:
- If a capability does not exist:
  > *"No existing implementation matching this capability was confidently identified."*
- If multiple implementations exist:
  > *"Candidate A (High confidence) vs Candidate B (Medium confidence)"* — StoryForge presents the ambiguity and asks the user to choose.

---

## 13. The Collaborative User Loop

```
User: "Add X to the system."
  ↓
Intelligence: "What does the repository currently contain relating to X?"
  ↓
Context: Architecture + Graph + Source + Tests + Evidence
  ↓
StoryForge: "This is what I understand about current behavior and gaps..."
  ↓
User: "No, this applies only to the reporting module."
  ↓
Intelligence: Refines relevant context subgraph
  ↓
StoryForge: "Updated discovery understanding..."
  ↓
User: "Accepted."
  ↓
Story Generation: User Stories + QA Stories
  ↓
User: "Split Story 2 and add negative security cases."
  ↓
Updated Stories + QA Stories
  ↓
User: "Accepted."
  ↓
ALM / ValueEdge Push
```

---

## 14. Feature Lifecycle Management

Every feature workspace maintains a complete lifecycle:

```
Feature Workspace
  ├── Feature 1 (current)
  │   ├── Intent → Discovery (3 iterations) → Stories (2 iterations)
  │   └── Status: In Stories phase
  ├── Feature 2 (archived)
  │   ├── Intent → Discovery → Stories → ValueEdge pushed
  │   └── Status: Complete
  └── Feature 3 (archived)
      ├── Intent → Discovery → Rejected
      └── Status: Abandoned
```

Lifecycle provides:
- **Audit trail**: Every iteration, approval, and rejection is recorded
- **Context continuity**: Approved context is preserved across story iterations
- **Archival**: Completed features move to history but remain queryable
- **Staleness detection**: Active features are audited against code changes

---

## 15. Zero-Infrastructure Guarantee

StoryForge requires **zero external databases or cloud servers**. Everything is stored inside `.storyforge/` in the workspace root:

```
.storyforge/
├── graph.json              # Serialized knowledge graph
├── graph.backup.json       # Previous generation snapshot
├── intelligence/
│   ├── generation-summary.json  # Historical audit log
│   └── workflow.json            # Active & archived feature workflows
├── cache/                  # AST parse and hash cache
└── copilot/                # Generated copilot artifacts (preview)
```
