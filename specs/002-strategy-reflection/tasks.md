# Tasks: Strategy Reflection Layer

**Branch**: `002-strategy-reflection` | **Date**: 2026-09-13 | **Spec**: [specs/002-strategy-reflection/spec.md](file:///c:/Users/luism/OneDrive/Documentos/P%C3%B3s%20gradua%C3%A7%C3%A3o/Handsome/me/modulo04-agentes-autonomos/ops-pilot/specs/002-strategy-reflection/spec.md) | **Plan**: [specs/002-strategy-reflection/plan.md](file:///c:/Users/luism/OneDrive/Documentos/P%C3%B3s%20gradua%C3%A7%C3%A3o/Handsome/me/modulo04-agentes-autonomos/ops-pilot/specs/002-strategy-reflection/plan.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Define reflection data contracts, Zod schemas, and core evaluator primitives.

- [X] T001 Export reflection types and schemas (`ReflectionOptions`, `CritiqueVerdictSchema`, `CritiqueVerdict`) in `src/agents/types.ts`
- [X] T002 [P] Define critic evaluation prompts and pure observation extraction helper in `src/agents/reflection.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core critic evaluation infrastructure that MUST be complete before user stories can execute.

- [X] T003 Implement critic evaluator function `evaluateAnswer` using OpenRouter model structured output in `src/agents/reflection.ts`
- [X] T004 [P] Implement unit tests for critic schema validation and observation extraction in `src/agents/reflection.test.ts`

**Checkpoint**: Foundation ready - critic evaluator and trace extraction can now be integrated into the decorator.

---

## Phase 3: User Story 1 - Self-Critique and Verification of Operational Answers (Priority: P1) 🎯 MVP

**Goal**: As an on-call engineer, wrap any `ReasoningStrategy` so that the agent's proposed answer is automatically evaluated against tool observations in the trace and returned if approved.

**Independent Test**: Wrap a baseline strategy with `withReflection`, submit an operational query with tool observations, and verify that the critic inspects the answer, produces an approved verdict with feedback, emits a `critique` event in the trace, and outputs the response.

### Tests for User Story 1
- [X] T005 [P] [US1] Unit test for first-pass approved evaluation and critique event emission in `src/agents/reflection.test.ts`

### Implementation for User Story 1
- [X] T006 [US1] Implement basic `withReflection` decorator function returning `ReasoningStrategy` (`name: reflect:${strategy.name}`) in `src/agents/reflection.ts`
- [X] T007 [US1] Integrate `evaluateAnswer` into `withReflection` to perform initial critique evaluation and append `critique` trace event in `src/agents/reflection.ts`

**Checkpoint**: User Story 1 is functional: strategies can be decorated and verified with an approved critique verdict.

---

## Phase 4: User Story 2 - Feedback-Driven Answer Regeneration on Rejection (Priority: P2)

**Goal**: As an on-call operator, when an answer contradicts or omits critical tool findings, reject the answer and re-run with critique feedback in context up to `maxReflection` limit.

**Independent Test**: Provide an operational scenario where the initial answer is rejected by the critic. Verify that the strategy regenerates with corrective feedback in context and halts when approved or upon reaching `maxReflection` (default: 2).

### Tests for User Story 2
- [X] T008 [P] [US2] Unit test for rejection feedback augmentation, loop regeneration, and maxReflection bounding in `src/agents/reflection.test.ts`

### Implementation for User Story 2
- [X] T009 [US2] Implement pure function for feedback prompt context augmentation in `src/agents/reflection.ts`
- [X] T010 [US2] Implement iterative reflection loop with `maxReflection` ceiling in `src/agents/reflection.ts`

**Checkpoint**: User Stories 1 and 2 work: rejected answers trigger corrective regeneration bounded by `maxReflection`.

---

## Phase 5: User Story 3 - Transparent Critique Trace and Cumulative Telemetry (Priority: P3)

**Goal**: As an auditor or operator, provide complete visibility into every critique cycle, ordered trace history, and total cumulative resource consumption (`llmCalls` and `latencyMs`).

**Independent Test**: Execute a query triggering reflection rejection and regeneration. Verify that the trace contains all ordered events (`thought`, `action`, `observation`, `critique`, `answer`) and that metrics reflect the cumulative sum of all base and critique passes.

### Tests for User Story 3
- [X] T011 [P] [US3] Unit test for trace ordering and cumulative metrics calculation across multiple attempts in `src/agents/reflection.test.ts`

### Implementation for User Story 3
- [X] T012 [US3] Implement trace concatenator and metrics accumulator in `src/agents/reflection.ts`
- [X] T013 [US3] Implement graceful fallback error handling if critic model call fails in `src/agents/reflection.ts`

**Checkpoint**: User Stories 1, 2, and 3 work: complete traces with auditable history and accurate cumulative metrics.

---

## Phase 6: User Story 4 - Arena Comparative Benchmarking for Reflected Strategies (Priority: P4)

**Goal**: As a reliability engineer, run `reflect:react` and `reflect:plan-and-execute` in the Strategy Arena side-by-side with baseline strategies to compare quality, latency, and iterations.

**Independent Test**: Run `npm run arena -- --strategies react,reflect:react,plan-and-execute,reflect:plan-and-execute`, verifying streaming trace output and unified comparison table.

### Tests for User Story 4
- [X] T014 [P] [US4] Unit test for Arena CLI parsing and execution of reflected strategy identifiers in `src/arena.test.ts`

### Implementation for User Story 4
- [X] T015 [US4] Update `ArenaArgsSchema` and `DEFAULT_STRATEGIES` to support `reflect:react` and `reflect:plan-and-execute` in `src/arena.ts`
- [X] T016 [US4] Adjust Arena summary table formatting and column widths for reflected strategy names in `src/arena.ts`

**Checkpoint**: All user stories functional: CLI arena supports benchmarking baseline vs. reflected strategies.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation and verification across all components.

- [X] T017 [P] Verify `npm run typecheck` and `npm test` pass with 100% green status across all test suites
- [X] T018 Execute end-to-end quickstart validation scenario in `specs/002-strategy-reflection/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion (T001, T002) - BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Phase 2. Delivers MVP.
- **User Story 2 (Phase 4)**: Depends on Phase 3 (US1 decorator structure).
- **User Story 3 (Phase 5)**: Depends on Phase 4 (US2 regeneration loop).
- **User Story 4 (Phase 6)**: Depends on Phase 5 (complete `withReflection` decorator ready for Arena registration).
- **Polish (Phase 7)**: Depends on all user stories complete.

### User Story Dependencies

```
[Phase 1: Setup] (T001, T002)
       │
       ▼
[Phase 2: Foundational] (T003, T004)
       │
       ▼
[Phase 3: US1 - Self-Critique] (T005 ──> T006 ──> T007) ── MVP
       │
       ▼
[Phase 4: US2 - Regeneration] (T008 ──> T009 ──> T010)
       │
       ▼
[Phase 5: US3 - Telemetry & Trace] (T011 ──> T012 ──> T013)
       │
       ▼
[Phase 6: US4 - Arena CLI] (T014 ──> T015 ──> T016)
       │
       ▼
[Phase 7: Polish & Validation] (T017, T018)
```

---

## Parallel Opportunities

- **Phase 1**: T002 [P] can run alongside T001.
- **Phase 2**: T004 [P] (critic tests) can run alongside T003.
- **Phase 3**: T005 [P] (tests) can be created in parallel with T006.
- **Phase 4**: T008 [P] (tests) can be written prior to T009/T010.
- **Phase 5**: T011 [P] (telemetry tests) can run in parallel with T012.
- **Phase 6**: T014 [P] (arena tests) can run before T015/T016.
- **Phase 7**: T017 [P] runs independently before quickstart validation.

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Setup (T001, T002) and Foundational (T003, T004).
2. Complete User Story 1 (T005-T007).
3. Validate: Strategies can be wrapped with `withReflection` and verified with an approved critique pass.

### Incremental Delivery
1. Foundation & MVP: Setup + US1 (First-pass critique approval).
2. Self-Healing: US2 (Feedback-guided regeneration bounded by `maxReflection`).
3. Observability: US3 (Complete ordered trace and cumulative metrics).
4. Benchmarking: US4 (Arena CLI with `reflect:react` and `reflect:plan-and-execute`).
5. Quality Gate: Phase 7 (Full regression test & typecheck pass).
