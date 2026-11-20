# Tasks: Model Fallback & Retry Resilience

**Input**: Design documents from `specs/015-model-fallback-resilience/` (`spec.md`, `plan.md`, `data-model.md`, `contracts/chat-api.md`, `research.md`, `quickstart.md`)  
**Status**: Ready for Implementation  

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline verification and clean workspace readiness before starting changes.

- [X] T001 Verify existing test suite and TypeScript compilation baseline by running `npm run typecheck` and `npm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core configuration schemas, trace event types, domain errors, and trace formatters that MUST be in place before implementing user stories.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [X] T002 [P] Update `src/config/env.ts` to add `OPENROUTER_MODEL_FALLBACK` to `EnvSchema` and implement pure function `parseFallbackModels`
- [X] T003 [P] Update `src/agents/types.ts` to add `"fallback"` to `TraceEventTypeSchema`, define `FallbackTraceEventSchema`, and add `modelUsed: z.string().optional()` to `StrategyMetricsSchema`
- [X] T004 [P] Create domain error class `ModelUnavailableError` in `src/agents/errors.ts`
- [X] T005 Update `src/agents/trace.ts` to format `[FALLBACK]` events in `formatTraceEvent` and add test coverage in `src/agents/trace.test.ts`

**Checkpoint**: Foundational schemas, configuration parser, domain error, and trace formatting ready. User story implementation can begin.

---

## Phase 3: User Story 1 - Automatic Model Fallback on Primary Failure (Priority: P1) 🎯 MVP

**Goal**: When the primary model fails (e.g. rate limit HTTP 429, 5xx server error, or timeout), OpsPilot automatically falls back to backup models configured in `OPENROUTER_MODEL_FALLBACK`, emits a `"fallback"` trace event, and populates `metrics.modelUsed`.

**Independent Test**:
Simulate primary model failure with a functioning fallback model in `src/agents/model.test.ts`. Verify execution seamlessly succeeds on the backup model, appends a `"fallback"` event to the trace, and sets `metrics.modelUsed` to the backup model identifier.

### Tests for User Story 1 🧪

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T006 [P] [US1] Write unit tests in `src/agents/model.test.ts` testing automatic failover to fallback model when primary model fails, verifying emitted `"fallback"` trace event and `metrics.modelUsed`

### Implementation for User Story 1

- [X] T007 [US1] Implement resilient model creation in `src/agents/model.ts` utilizing LangChain `.withFallbacks([reservas])` and attaching fallback event interception
- [X] T008 [US1] Ensure strategies in `src/agents/react.ts`, `src/agents/plan-and-execute.ts`, `src/agents/reflection.ts`, and `src/agents/production-graph.ts` propagate fallback trace events and `metrics.modelUsed`

**Checkpoint**: User Story 1 (MVP) complete. OpsPilot automatically fails over to backup models without dropping state or crashing.

---

## Phase 4: User Story 2 - Transient Retry on Primary Model (Priority: P2)

**Goal**: Ensure transient failures on the primary model (rate limits, momentary network drops, 5xx) are retried with backoff before cascading to fallback models.

**Independent Test**:
Simulate a single transient failure on the primary model followed by success. Verify that the primary model retries, succeeds, emits no `"fallback"` event, and sets `metrics.modelUsed` to the primary model identifier.

### Tests for User Story 2 🧪

- [X] T009 [P] [US2] Write unit tests in `src/agents/model.test.ts` testing transient failure retries on the primary model (up to 2 retries) without triggering fallback

### Implementation for User Story 2

- [X] T010 [US2] Configure `.withRetry({ stopAfterAttempt: 3 })` on the primary model in `src/agents/model.ts` for transient errors (HTTP 429, 5xx, timeouts)

**Checkpoint**: User Stories 1 and 2 functional. Primary model retries transient issues and only cascades to fallbacks when retries are exhausted.

---

## Phase 5: User Story 3 - Graceful Degradation & HTTP 503 on Total Provider Outage (Priority: P3)

**Goal**: When both primary and all configured fallback models fail (or no fallbacks exist and primary fails), OpsPilot raises `ModelUnavailableError` and the HTTP layer returns HTTP 503 Service Unavailable.

**Independent Test**:
Simulate total failure across primary and all fallback models. Send a request to `POST /chat` and verify it returns HTTP 503 with `{ "error": "model_unavailable" }`.

### Tests for User Story 3 🧪

- [X] T011 [P] [US3] Write integration tests in `src/http/chat.test.ts` asserting `POST /chat` returns HTTP 503 (`model_unavailable`) when all models fail

### Implementation for User Story 3

- [X] T012 [US3] Update `src/agents/model.ts` to wrap exhausted fallback attempts in `ModelUnavailableError`
- [X] T013 [US3] Update `src/http/chat.controller.ts` to catch `ModelUnavailableError` and respond with HTTP 503 Service Unavailable

**Checkpoint**: User Story 3 complete. Catastrophic AI provider outages gracefully degrade to HTTP 503 without unhandled server crashes.

---

## Phase 6: User Story 4 - Trace Visibility & Model Attribution Telemetry (Priority: P4)

**Goal**: Ensure 100% of trace events carry valid `node: string` attribution, `"fallback"` events include `fromModel`, `toModel`, `reason`, and `metrics.modelUsed` accurately reflects the model used in all responses.

**Independent Test**:
Inspect trace events and metrics in `src/agents/model.test.ts` and `src/http/chat.test.ts` across normal, retried, and fallback executions to confirm 100% compliance with telemetry and trace schemas.

### Tests for User Story 4 🧪

- [X] T014 [P] [US4] Add test assertions in `src/agents/model.test.ts` and `src/http/chat.test.ts` verifying `FallbackTraceEventSchema` compliance, `node: string` attribution, and `metrics.modelUsed` accuracy

### Implementation for User Story 4

- [X] T015 [US4] Verify and polish trace event emission and telemetry propagation in `src/agents/model.ts` and `src/http/chat.controller.ts`

**Checkpoint**: Complete observability and telemetry in place for all model execution pathways.

---

## Phase 7: Polish & Quality Gates

**Purpose**: Strict type checking, regression test execution, and quickstart scenario verification.

- [X] T016 Run `npm run typecheck` to verify zero TypeScript errors across all modified modules
- [X] T017 Run `npm test` to verify complete test suite passes green across all modules
- [X] T018 Execute Quickstart validation scenarios from `specs/015-model-fallback-resilience/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — executes first.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Story 1 (Phase 3 - P1 MVP)**: Depends on Foundational completion.
- **User Story 2 (Phase 4 - P2)**: Depends on US1 completion (adds retry layer to primary model).
- **User Story 3 (Phase 5 - P3)**: Depends on US1 completion (handles exhaustion of all models).
- **User Story 4 (Phase 6 - P4)**: Depends on US1, US2, US3 completion (verifies end-to-end telemetry).
- **Polish (Phase 7)**: Depends on all user stories being complete.

### Parallel Opportunities

- Within Foundational (Phase 2): T002 (`env.ts`), T003 (`types.ts`), and T004 (`errors.ts`) can run in parallel.
- Tests marked `[P]` within each story phase (T006, T009, T011, T014) can be developed alongside schema definitions.

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phase 1: Setup verification (T001).
2. Complete Phase 2: Foundational schemas, domain errors, and trace types (T002 - T005).
3. Complete Phase 3: User Story 1 fallback execution and tests (T006 - T008).
4. **STOP and VALIDATE**: Verify model switches to backup upon primary failure and reports `modelUsed`.

### Incremental Delivery
1. Add User Story 2: Primary model retry (`withRetry`) (T009, T010).
2. Add User Story 3: HTTP 503 on complete outage (T011 - T013).
3. Add User Story 4: Complete trace visibility and telemetry validation (T014, T015).
4. Final Quality Gates: `npm run typecheck`, `npm test`, and quickstart scenarios (T016 - T018).
