# StoryForge 🧪

> **Intelligence-First Engineering System** for Transforming Feature Requests into Evidence-Backed User Stories, QA Stories, and ALM Work Items.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.95.0-purple.svg)](https://code.visualstudio.com/)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-Chat%20Participant-black.svg)](https://github.com/features/copilot)
[![Tests](https://img.shields.io/badge/Tests-57%20Passed-brightgreen.svg)]()

---

## 🌟 The Core Philosophy

Traditional AI story generators operate on raw prompts and loose keyword searches, inventing non-existent APIs and hallucinatory dependencies. 

**StoryForge is built on a different principle: Intelligence First.** Everything else is a consumer of Intelligence.

```
                         STORYFORGE
                              │
             ┌────────────────┴────────────────┐
             │                                 │
      REPOSITORY INTELLIGENCE             USER INTENT
      (Knowledge Graph & Evidence)      (Copilot Chat & Webview)
             │                                 │
             └──────────────┬──────────────────┘
                            │
                    CONTEXT UNDERSTANDING
                            │
             ┌──────────────┴──────────────┐
             │                             │
       WHAT EXISTS                    WHAT IS REQUESTED
     (Evidence-backed)              (Collaborative discussion)
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
          (Acceptance Criteria)  (Test Scenarios & Edge Cases)
                 │                     │
                 └──────────┬──────────┘
                            │
                       USER APPROVAL
                            │
                         ALM / VALUEEDGE
```

---

## 🧠 10-Level Repository Understanding

StoryForge builds and continuously maintains a living semantic model across 10 hierarchical levels:

| Level | Granularity | Responsibilities & Semantic Model |
| :--- | :--- | :--- |
| **Level 1** | **Repository** | Workspace root, detected languages, global metrics |
| **Level 2** | **Projects** | Sub-projects, package definitions (npm, maven, gradle, dotnet, go-module, pip) |
| **Level 3** | **Applications & Services** | Frontend apps, REST microservices, background workers, event consumers |
| **Level 4** | **Modules** | Feature slices, architectural layers (Presentation, API, Core, Data, Infra) |
| **Level 5** | **Components** | Classes, interfaces, controllers, repositories, services, stores, hooks |
| **Level 6** | **Files** | File metadata, language classification, content hash, generational tracking |
| **Level 7** | **Symbols** | Methods, functions, properties, type aliases, enums, parameter signatures |
| **Level 8** | **Relationships** | Imports, call chains, inheritance, implementations, API routing, data flow |
| **Level 9** | **Execution & Data Flows** | Route → Controller → Service → Repository → DB / Queue pipelines |
| **Level 10** | **Tests & Impact** | Test suites, test-to-component mappings, blast radius impact analysis |

---

## 🔗 End-to-End Traceability Matrix

StoryForge guarantees strict bidirectional traceability from the initial user requirement down to code symbols, tests, and ALM issues:

```
[User Feature Intent]
         │
         ▼
[Semantic Concept Matching] ◄────► [Knowledge Graph Nodes]
         │
         ▼
[11-Stage Capability Reasoning Flow] (Stage 1 -> Stage 11)
         │
         ▼
[Feature Intelligence & Discovery Context] (with Evidence Provenance)
         │
         ▼
[Approved Discovery Artifact]
         │
         ├─────────────────────────────────────────┐
         ▼                                         ▼
[Engineered User Stories]                  [QA Test Stories]
  ├── As a / I want / So that                ├── Preconditions & Test Data
  ├── Acceptance Criteria (Given/When/Then)  ├── Positive / Negative Scenarios
  ├── Story Points & Technical Notes         ├── Regression & Boundary Cases
  └── Linked Code Component Evidence         └── Linked Target Components
         │                                         │
         └───────────────────┬─────────────────────┘
                             ▼
              [ValueEdge / ALM Work Items]
```

Read the full [Traceability Specification](docs/traceability.md).

---

## 🔬 Evidence & Provenance Taxonomy

StoryForge never pretends all relationships are equally certain. Every graph edge and context item carries provenance:

- **`confirmed` (High Confidence: 0.9 - 1.0)**: Statically proven via Tree-sitter AST, explicit imports, or LSP type definitions.
- **`resolved` (Medium Confidence: 0.7 - 0.89)**: Inferred through strong structural patterns and naming conventions.
- **`heuristic` (Low Confidence: 0.5 - 0.69)**: Inferred through lexical proximity or fuzzy similarity.
- **`unresolved` (Minimal Confidence: < 0.5)**: Flagged as a candidate, triggering an explicit question to the user.

### Handling Absence & Uncertainty
When a capability does not exist in the repository, StoryForge explicitly states:
> *"No existing implementation matching this capability was confidently identified."*

If multiple candidate components exist, StoryForge explains the ambiguity and asks the user to choose during Discovery.

---

## 🛠️ VS Code Integration & Copilot Chat

StoryForge operates as a first-class VS Code extension and registers the `@storyforge` participant in GitHub Copilot Chat:

### Slash Commands

- `@storyforge /discover <feature request>`: Initiate evidence-backed feature discovery & 11-stage capability tracing.
- `@storyforge /stories`: Generate user stories (with Gherkin ACs) and QA stories from approved Discovery artifacts.
- `@storyforge /audit`: Audit active stories for generational code staleness.
- `@storyforge /intelligence <query>`: Query the repository knowledge graph for concepts, components, and APIs.
- `@storyforge /impact <component>`: Perform blast-radius impact analysis on components and tests.
- `@storyforge /status`: Display current intelligence engine state, generation number, node/edge counts, and architectural metrics.

---

## 📚 Documentation Index

- 📘 [End-to-End Traceability Model](docs/traceability.md)
- 🏗️ [System Architecture & Design](docs/architecture.md)
- 🕸️ [Knowledge Graph & Query Schema](docs/knowledge-graph-schema.md)
- 💡 [Core Concept & Identity](docs/core-concept.md)

---

## 🚀 Development & Testing

```bash
# Install dependencies
pnpm install

# Type check and run all test suites
pnpm run check

# Run tests
pnpm test

# Build extension bundle
pnpm run build:extension
```
