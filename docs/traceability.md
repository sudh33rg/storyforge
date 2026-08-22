# End-to-End Traceability Specification

Traceability is the cornerstone of StoryForge. Unlike generic AI coding assistants that generate untraceable prose, every output produced by StoryForge maintains a deterministic chain of provenance back to source code locations, semantic relationships, and user decisions.

---

## 1. The Core Idea: Reasoning-Based Traceability

StoryForge grounds traceability in a **living semantic model of the repository**. It understands how high-level feature requests decompose into capabilities, components, execution paths, and quality artifacts:

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

## 2. The 11-Stage Capability Reasoning Flow

For any feature request, StoryForge reasons through the entire repository capability stack and records evidence at each stage (`buildCapabilityChain`):

```
[Stage 1]  Feature Request
                │
                ▼
[Stage 2]  Relevant Capability (Domain Concept)
                │
                ▼
[Stage 3]  Existing UI (Pages, Views, Dialogs)
                │
                ▼
[Stage 4]  Frontend Component (State, Hooks, Actions)
                │
                ▼
[Stage 5]  API Endpoint (REST / GraphQL Route)
                │
                ▼
[Stage 6]  Backend Controller (Handler, Route Binding)
                │
                ▼
[Stage 7]  Service Layer (Business Logic)
                │
                ▼
[Stage 8]  Shared Library / Utility (Common Modules)
                │
                ▼
[Stage 9]  Data & Configuration (Entities, Feature Flags, DB)
                │
                ▼
[Stage 10] Existing Tests (Unit, Integration, E2E Suites)
                │
                ▼
[Stage 11] Related Workflows (Pipelines, Background Jobs)
```

StoryForge knows **why** each item in this chain is relevant and attaches provenance records to every link.

---

## 3. Concrete Traceability Example (LoadRunner Cloud)

### Step-by-Step Provenance Chain

```yaml
Feature Request: "Add Load Test Scheduling to LoadRunner Cloud"

Traceability Chain:
  1. Capability:
     - Concept: "Load Test Configuration"
     - Resolution: Confirmed (Confidence: 0.95)

  2. Existing UI:
     - Component: src/ui/pages/LoadTestConfigPage.tsx
     - Evidence: Line 45, class LoadTestConfigPage

  3. Frontend Component:
     - Component: src/ui/components/SchedulePanel.tsx
     - Evidence: Line 18, function SchedulePanel

  4. API Endpoint:
     - Endpoint: POST /api/v1/loadtests/:id/schedule
     - Evidence: src/api/routes.ts:Line 88

  5. Backend Controller:
     - Component: src/controllers/LoadTestController.ts
     - Evidence: Line 120, method scheduleTest()

  6. Service Layer:
     - Component: src/services/SchedulerService.ts
     - Evidence: Line 54, method createSchedule()

  7. Data / Configuration:
     - Config: src/config/scheduler.json
     - Model: src/models/ScheduleEntity.ts

  8. Existing Tests:
     - Suite: tests/services/SchedulerService.test.ts (8 tests)

  9. Identified Gaps:
     - Gap: "No recurring cron validation found in frontend UI"
     - Confidence: 0.85
```

---

## 4. Discovery → Stories → QA → ValueEdge Traceability

The chain flows directly into engineering artifacts:

```
[Approved Discovery Context]
         │
         ├── Identified Affected Area: src/services/SchedulerService.ts
         ├── Current Behavior: Immediate execution only
         └── Proposed Behavior: Cron-based delayed execution
         │
         ├─────────────────────────────────────────┐
         ▼                                         ▼
[User Story: US-101]                      [QA Story: QA-201]
  Title: Schedule Load Test Execution        Title: Validate Load Test Cron Scheduling
  As a / I want / So that                    Related Story: US-101
  Acceptance Criteria:                       Test Type: Functional & Edge Cases
    ├── AC-1: Given a valid cron syntax...     ├── Scenario 1 (Positive): Valid daily schedule
    └── AC-2: Given an invalid time...         ├── Scenario 2 (Negative): Invalid past datetime
  Affected Components:                         └── Scenario 3 (Boundary): Timezone daylight savings
    ├── src/controllers/LoadTestController.ts Linked Test Fixture:
    └── src/services/SchedulerService.ts       └── tests/fixtures/scheduleData.json
  Evidence:                                  Linked Source:
    └── src/services/SchedulerService.ts:L54   └── src/services/SchedulerService.ts:L54
         │                                         │
         └───────────────────┬─────────────────────┘
                             ▼
              [ValueEdge / ALM Work Items]
                ├── Feature: #5401 "Load Test Scheduling"
                ├── User Story: #5402 "Schedule Load Test Execution" (ACs attached)
                └── Quality Story: #5403 "Validate Load Test Cron Scheduling" (Scenarios attached)
```

---

## 5. Evidence & Confidence Taxonomy

StoryForge distinguishes certainty levels rather than pretending every relationship is equally verified:

| Status | Confidence | Description | Example |
| :--- | :--- | :--- | :--- |
| **`confirmed`** | **0.90 – 1.00** | Statically verified via AST, imports, or LSP | `import { Svc } from './svc'` |
| **`resolved`** | **0.70 – 0.89** | Inferred via strong structural conventions | `@GetMapping("/api")` on controller |
| **`heuristic`** | **0.50 – 0.69** | Inferred via naming patterns or proximity | `UserUtil` matching `UserService` |
| **`unresolved`** | **0.00 – 0.49** | Candidate relationship with ambiguity | Multiple candidate auth providers |

---

## 6. Generational Traceability & Staleness Auditing

As developers change code, StoryForge increments generations and audits active story links via `auditStoriesStaleness(...)`:

```
Intelligence Generation 41
        ↓
Developer modifies src/services/SchedulerService.ts
        ↓
Affected-area detection via Knowledge Graph
        ↓
Intelligence Generation 42
        ↓
Audit Check:
  ⚠️ User Story US-101 evidence modified (SchedulerService.ts line 54 altered)
  StoryForge Action: Flags US-101 and QA-201 as STALE, prompts user to review diff via @storyforge /audit
```

---

## 7. Absence and Uncertainty Traceability

If StoryForge cannot find a capability in the repository:
1. It records an explicit gap: *"No existing implementation matching this capability was confidently identified."*
2. It documents the gap in the **Discovery Context** under `potentialGaps`.
3. It converts the gap into an **Unresolved Question** presented to the user during iterative refinement.
4. If approved, the gap becomes a **New Component Task** in the generated User Stories.
