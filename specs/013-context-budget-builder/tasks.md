# Tasks: Section-Budget Context Builder (`ContextBuilder`)

**Feature**: 013-context-budget-builder | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify clean build and test status before introducing ContextBuilder components.

- [X] T001 Verify existing project builds cleanly: run `npm run typecheck` and `npm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, Zod configuration schemas, and budget helpers that all user stories depend on.

**⚠️ CRITICAL**: Must complete before strategy integrations and pruning algorithms can begin.

- [X] T002 [P] Define `MemoryItem`, `ContextBudgets`, `BuildContextInput`, and `BuiltContext` domain types in `src/agents/types.ts`
- [X] T003 [P] Implement `ContextBudgetsSchema` and `loadContextBudgets` configuration loader with defaults (200 summary, 1200 window, 300 memory) in `src/context/context-builder.ts`

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 — Unified Prompt Composition & Core Builder (Priority: P1) 🎯 MVP

**Goal**: Implement `buildContext` in `src/context/context-builder.ts` with untouchable systemPrompt and userMessage guarantees, returning messages, userPrompt, and breakdown for all reasoning strategies.

**Independent Test**:
Call `buildContext` with systemPrompt, userMessage, summary, history, and memories. Verify system and user message are never truncated and messages array is properly assembled.

### Implementation for User Story 1

- [X] T004 [US1] Implement pure `buildContext` function in `src/context/context-builder.ts` assembling messages (`system`, `summary`, `history`, `user`) and ensuring `systemPrompt` and `userMessage` are untouched
- [X] T005 [US1] Write unit tests in `src/context/context-builder.test.ts` verifying that systemPrompt and userMessage are never truncated or dropped across all inputs
- [X] T006 [US1] Integrate `buildContext` into ReAct strategy in `src/agents/react.ts`
- [X] T007 [US1] Integrate `buildContext` into Plan-and-Execute strategy in `src/agents/plan-and-execute.ts`
- [X] T008 [US1] Integrate `buildContext` into Reflection strategy in `src/agents/reflection.ts`

**Checkpoint**: MVP ready — all strategies assemble prompts through `buildContext` with untouchable system and user message guarantees.

---

## Phase 4: User Story 2 — Chronological History Eviction (Oldest First) (Priority: P1)

**Goal**: When dialogue history exceeds the window token ceiling (`CONTEXT_BUDGET_WINDOW`, default 1200), evict messages in chronological order (oldest messages removed first) while preserving recent interactions.

**Independent Test**:
Supply multiple history messages exceeding window budget. Verify oldest messages are evicted first and newest messages are retained.

### Implementation for User Story 2

- [X] T009 [US2] Implement pure `pruneHistoryWindow` helper in `src/context/context-builder.ts` that accumulates estimated tokens from newest to oldest and drops oldest exceeding budget
- [X] T010 [US2] Write unit tests in `src/context/context-builder.test.ts` verifying that constrained window budgets evict oldest messages first and retain the latest messages

**Checkpoint**: User Story 2 functional and independently testable.

---

## Phase 5: User Story 3 — Relevance-Based Memory Eviction (Lowest Score First) (Priority: P1)

**Goal**: When recalled semantic memories exceed the memory token ceiling (`CONTEXT_BUDGET_MEMORY`, default 300), evict memories in score order (lowest score removed first) while preserving highest-scoring facts.

**Independent Test**:
Supply multiple memories with scores [0.3, 0.9, 0.6] exceeding budget. Verify memories are pruned lowest score first, retaining the 0.9 memory.

### Implementation for User Story 3

- [X] T011 [US3] Implement pure `pruneMemoriesByScore` helper in `src/context/context-builder.ts` sorting descending by relevance score and evicting lower-scoring items when budget is exceeded
- [X] T012 [US3] Write unit tests in `src/context/context-builder.test.ts` verifying that constrained memory budgets evict lowest-scoring memories first
- [X] T013 [US3] Update `createChatHandler` in `src/http/chat.controller.ts` to pass recalled memories with their similarity scores to `StrategyOptions`

**Checkpoint**: User Story 3 functional and independently testable.

---

## Phase 6: User Story 4 — Summary Budget Enforcement (Priority: P2)

**Goal**: Constrain conversation summary to the summary budget (`CONTEXT_BUDGET_SUMMARY`, default 200 tokens), cleanly bounding oversized summary text.

**Independent Test**:
Supply an oversized summary exceeding 200 tokens (or a small test budget). Verify output summary is bounded within the ceiling.

### Implementation for User Story 4

- [X] T014 [US4] Implement pure `boundSummary` helper in `src/context/context-builder.ts` bounding oversized summaries to budget ceiling
- [X] T015 [US4] Write unit tests in `src/context/context-builder.test.ts` verifying summary bounding when exceeding budget

**Checkpoint**: User Story 4 functional and independently testable.

---

## Phase 7: User Story 5 — Environment Variable Ceilings (`CONTEXT_BUDGET_*`) (Priority: P2)

**Goal**: Allow runtime configuration of budgets via `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_WINDOW`, and `CONTEXT_BUDGET_MEMORY`, falling back gracefully to defaults or zeroing disabled sections.

**Independent Test**:
Provide custom environment variables and verify that `loadContextBudgets` parses positive values, handles zero, and ignores invalid inputs.

### Implementation for User Story 5

- [X] T016 [US5] Implement environment variable parsing and budget resolution in `src/context/context-builder.ts` with testable environment input options
- [X] T017 [US5] Write unit tests in `src/context/context-builder.test.ts` testing environment variable reading, overriding, fallback defaults, and zero budget suppression

**Checkpoint**: All user stories complete and verified.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Full regression suite verification and strict type checks.

- [X] T018 Run `npm run typecheck` to verify zero TypeScript errors
- [X] T019 Run `npm test` to verify complete test suite passes across all modules

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — executes first.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Story 1 (Phase 3 - P1 MVP)**: Depends on Foundational completion.
- **User Story 2 (Phase 4 - P1)**: Depends on US1 completion.
- **User Story 3 (Phase 5 - P1)**: Depends on US1 completion.
- **User Story 4 (Phase 6 - P2)**: Depends on US1 completion.
- **User Story 5 (Phase 7 - P2)**: Depends on Foundational completion.
- **Polish (Phase 8)**: Depends on all user stories being complete.

### Parallel Opportunities

- Within Foundational (Phase 2): T002 and T003 can execute in parallel.
- US2 (History), US3 (Memory), US4 (Summary) algorithms can be written in parallel once US1 core structure is ready.
- Polish tasks T018 and T019 run at the end.

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phase 1 (T001).
2. Complete Phase 2 (T002, T003).
3. Complete Phase 3 (T004 through T008).
4. Validate ReAct, Plan-and-Execute, and Reflection with `buildContext`.

### Incremental Delivery
1. Add US2 (History pruning - oldest first) -> test in isolation.
2. Add US3 (Memory pruning - lowest score first) -> test in isolation.
3. Add US4 (Summary bounding) -> test in isolation.
4. Add US5 (Env vars configuration) -> test in isolation.
5. Final Polish (Typecheck & test suite).
