# Tasks: Unified Production Graph (`production-graph.ts`)

**Feature**: 014-unified-production-graph | **Date**: 2026-10-19 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify clean build and test status before introducing graph orchestration changes.

- [X] T001 Verify existing project builds cleanly: run `npm run typecheck` and `npm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, trace schemas, route decision models, and node attribution schemas that all user stories depend on.

**⚠️ CRITICAL**: Must complete before strategy graph assembly and controller integration can begin.

- [X] T002 [P] Update `src/agents/types.ts` to add `"route"` to `TraceEventTypeSchema`, mandatory `node: z.string().min(1)` to `BaseTraceEventSchema`, `RouteTraceEventSchema`, and `RouteDecisionSchema`
- [X] T003 [P] Update `src/agents/trace.ts` to support `node` attribute and `"route"` event type across `formatTraceEvent`, `formatTrace`, and `toTrace`

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 — Autonomous Operational Strategy Routing (Priority: P1) 🎯 MVP

**Goal**: Implement the operational decision table and autonomous router node with structured output in `src/agents/production-graph.ts`, recording the decision in a `"route"` trace event.

**Independent Test**:
Call the router node with varied operational queries (alert inquiry, complex mitigation, high-precision verification) without a strategy override. Verify that it selects the appropriate strategy (`react`, `plan-and-execute`, or `reflection`) and appends a `"route"` trace event with `route`, `reason`, and `node: "router"`.

### Implementation for User Story 1

- [X] T004 [US1] Implement operational decision table prompt and `routerNode` function with `model.withStructuredOutput(RouteDecisionSchema)` and offline fallback to `"react"` in `src/agents/production-graph.ts`
- [X] T005 [US1] Create unit tests in `src/agents/production-graph.test.ts` verifying autonomous classification across alert inspection (`react`), multi-step triage (`plan-and-execute`), and critical verification (`reflection`), verifying `"route"` trace event emission

**Checkpoint**: MVP router node functional and independently testable with structured output.

---

## Phase 4: User Story 2 — Operator Strategy Override via `/chat` (Priority: P1)

**Goal**: Support optional `strategy` in `/chat` requests, allowing operators to force a specific strategy with immediate routing and explicit override annotation in the trace.

**Independent Test**:
Send a `/chat` request specifying `"strategy": "plan-and-execute"`. Verify that the router node skips LLM classification, immediately selects `plan-and-execute`, and records a `"route"` event indicating manual override.

### Implementation for User Story 2

- [X] T006 [US2] Update `ChatRequestSchema` in `src/http/schemas.ts` to define `strategy` as optional enum `z.enum(["react", "plan-and-execute", "reflection"]).optional()`
- [X] T007 [US2] Update `routerNode` in `src/agents/production-graph.ts` to check `strategyOverride`, bypassing LLM classification and emitting an override `"route"` trace event
- [X] T008 [US2] Update `createChatHandler` in `src/http/chat.controller.ts` to delegate to `runProductionGraph` passing optional `strategyOverride`
- [X] T009 [US2] Add integration tests in `src/http/chat.test.ts` verifying autonomous routing when strategy is omitted, manual override when specified, and validation rejection on invalid strategy strings

**Checkpoint**: User Story 2 functional and independently testable via HTTP endpoint.

---

## Phase 5: User Story 3 — Comprehensive Node Attribution in Trace Events (Priority: P1)

**Goal**: Guarantee that 100% of trace events emitted during graph execution carry an explicit `node` attribute identifying their originating node.

**Independent Test**:
Execute an end-to-end request through the graph and inspect all returned trace events. Verify every single item contains a non-empty `node` property matching `"context" | "router" | "react" | "plan-and-execute" | "reflection" | "response"`.

### Implementation for User Story 3

- [X] T010 [US3] Update strategy runners (`reactStrategy` in `src/agents/react.ts`, `planAndExecuteStrategy` in `src/agents/plan-and-execute.ts`, and `withReflection` in `src/agents/reflection.ts`) to attribute every generated trace event with its respective node identifier
- [X] T011 [US3] Add unit tests in `src/agents/production-graph.test.ts` asserting that 100% of trace events in graph execution contain a valid, non-empty `node` property

**Checkpoint**: User Story 3 functional — strict node attribution verified across all trace events.

---

## Phase 6: User Story 4 — Unified Production Graph Pipeline: Context -> Router -> Strategy -> Response (Priority: P2)

**Goal**: Build and compile the unified LangGraph `StateGraph(ProductionGraphState)` in `src/agents/production-graph.ts`, connecting `context` -> `router` -> conditional strategy execution -> `response`.

**Independent Test**:
Invoke `runProductionGraph` with a sample prompt. Verify the complete transition path: `context` node builds budget messages, `router` selects strategy, target strategy node executes, and `response` node aggregates final metrics and answer.

### Implementation for User Story 4

- [X] T012 [US4] Implement `contextNode` in `src/agents/production-graph.ts` invoking `ContextBuilder` to construct prompt messages and enforce section budgets
- [X] T013 [US4] Implement strategy execution nodes (`reactNode`, `planAndExecuteNode`, `reflectionNode`) and `responseNode` in `src/agents/production-graph.ts`
- [X] T014 [US4] Assemble and compile `StateGraph(ProductionGraphState)` with conditional edge from `routerNode` to strategy nodes and convergence onto `responseNode` in `src/agents/production-graph.ts`
- [X] T015 [US4] Implement helper `runProductionGraph` and export from `src/agents/production-graph.ts` and `src/agents/index.ts`
- [X] T016 [US4] Write end-to-end graph tests in `src/agents/production-graph.test.ts` validating complete state transitions (START -> context -> router -> strategy -> response -> END)

**Checkpoint**: Complete unified production graph functional and verified end-to-end.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Strict type checking, full regression test execution, and quickstart scenario verification.

- [X] T017 Run `npm run typecheck` to verify zero TypeScript errors across all modified modules
- [X] T018 Run `npm test` to verify complete test suite passes green across all modules
- [X] T019 Execute Quickstart validation scenarios from `specs/014-unified-production-graph/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — executes first.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Story 1 (Phase 3 - P1 MVP)**: Depends on Foundational completion.
- **User Story 2 (Phase 4 - P1)**: Depends on US1 completion.
- **User Story 3 (Phase 5 - P1)**: Depends on Foundational completion; can proceed in parallel with US1/US2.
- **User Story 4 (Phase 6 - P2)**: Depends on US1, US2, and US3 completion (assembles the full graph pipeline).
- **Polish (Phase 7)**: Depends on all user stories being complete.

### User Story Dependencies

- **User Story 1 (P1 MVP)**: Router logic and structured output classification in `production-graph.ts`.
- **User Story 2 (P1)**: Extends router with override bypass and connects `/chat` endpoint.
- **User Story 3 (P1)**: Ensures node attribution on all strategy traces and trace helpers.
- **User Story 4 (P2)**: Integrates all components into the full LangGraph pipeline (`context` -> `router` -> strategies -> `response`).

### Parallel Opportunities

- Within Foundational (Phase 2): T002 (`types.ts`) and T003 (`trace.ts`) can be done in parallel.
- US2 schema update (T006) can be performed in parallel with router override logic (T007).
- US3 strategy trace updates (T010) across `react.ts`, `plan-and-execute.ts`, and `reflection.ts` can be performed in parallel.

---

## Parallel Example: User Story 1 & 2

```bash
# Update boundary schemas and router override logic in parallel:
Task: "Update ChatRequestSchema in src/http/schemas.ts"
Task: "Update routerNode in src/agents/production-graph.ts to check strategyOverride"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phase 1: Setup verification (T001).
2. Complete Phase 2: Foundational schemas and trace updates (T002, T003).
3. Complete Phase 3: Router node with structured output decision table (T004, T005).
4. **STOP and VALIDATE**: Verify router independently classifies queries into `react`, `plan-and-execute`, and `reflection`.

### Incremental Delivery
1. Add User Story 2: Strategy override in `/chat` and controller wiring (T006 - T009).
2. Add User Story 3: Node attribution in all strategy trace events (T010, T011).
3. Add User Story 4: Full StateGraph compilation connecting context, router, strategies, and response (T012 - T016).
4. Final Polish: Typecheck, test suite, and quickstart validation (T017 - T019).
