# Tasks: Context Token Measurement & Metrics Breakdown

**Feature**: 011-context-tokens-metrics | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify clean build status before adding context measurement components.

- [x] T001 Verify existing project builds cleanly: run `npm run typecheck` and `npm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, Zod schemas, and metrics structure that all stories depend on.

**⚠️ CRITICAL**: Must complete before strategy and HTTP controller wiring can begin.

- [x] T002 [P] Define `ContextBreakdownSchema`, `TokenUsageSchema`, and update `StrategyMetricsSchema` / `StrategyMetrics` in `src/agents/types.ts`
- [x] T003 [P] Verify or update `ChatResponseSchema` in `src/http/schemas.ts` to validate the enriched metrics structure

**Checkpoint**: `npm run typecheck` passes with updated schemas.

---

## Phase 3: User Story 1 — Token Estimation & Real LangChain Usage Extraction (Priority: P1) 🎯 MVP

**Goal**: Implement `estimateTokens`, `extractTokenUsage`, and `estimateContextBreakdown` in `src/context/tokens.ts` with comprehensive unit tests.

**Independent Test**:
Call `estimateTokens("12345678")` → returns 2. Call `extractTokenUsage([aiMsg])` with LangChain `usage_metadata` → returns `{ promptTokens, completionTokens, totalTokens }`. Call `estimateContextBreakdown(...)` → returns partitioned token counts.

### Implementation for User Story 1

- [x] T004 [P] [US1] Implement `estimateTokens(text: string | null | undefined): number` using `Math.ceil(text.length / 4)` in `src/context/tokens.ts`
- [x] T005 [P] [US1] Implement `extractTokenUsage(messages: readonly unknown[]): TokenUsage` in `src/context/tokens.ts` extracting and aggregating `usage_metadata` and `response_metadata.tokenUsage` across all AI messages
- [x] T006 [P] [US1] Implement `estimateContextBreakdown(input: ContextBreakdownInput): ContextBreakdown` in `src/context/tokens.ts` partitioning estimated tokens across `{ system, history, memories, userMessage, totalEstimated }`
- [x] T007 [US1] Write unit tests in `src/context/tokens.test.ts`:
  (1) `estimateTokens` for empty, single-character, short, and long texts;
  (2) `extractTokenUsage` for standard LangChain `usage_metadata`, fallback `response_metadata`, multi-call trajectory aggregation, and missing metadata fallback;
  (3) `estimateContextBreakdown` for complete components and missing/partial components.

**Checkpoint**: `node --import tsx --test "src/context/tokens.test.ts"` passes with 100% success.

---

## Phase 4: User Story 2 — `/chat` API Metrics with Real Prompt Tokens & Context Breakdown (Priority: P1)

**Goal**: Extract real token usage inside reasoning strategies (`react` and `plan-and-execute`), compute context breakdown in `/chat`, and return enriched metrics.

**Independent Test**:
Send `POST /chat` with a query. Assert `res.body.metrics.promptTokens` is a positive number and `res.body.metrics.contextBreakdown` contains non-negative numbers for `system`, `history`, `memories`, `userMessage`, and `totalEstimated`.

### Implementation for User Story 2

- [x] T008 [US2] Update `createReactStrategy` in `src/agents/react.ts` to call `extractTokenUsage(newMessages)` and attach `promptTokens`, `completionTokens`, `totalTokens` to `StrategyResult.metrics`
- [x] T009 [US2] Update `createPlanAndExecuteStrategy` in `src/agents/plan-and-execute.ts` to call `extractTokenUsage` and attach real token metrics to `StrategyResult.metrics`
- [x] T010 [US2] Update `createChatHandler` in `src/http/chat.controller.ts` to compute `contextBreakdown` via `estimateContextBreakdown({ history, memories: recalledMemories, userMessage: message })` and attach to `result.metrics`
- [x] T011 [US2] Write integration tests in `src/http/chat.test.ts`:
  (1) `POST /chat` response returns `metrics.promptTokens` and `metrics.contextBreakdown`;
  (2) When history and memories are present, their respective breakdown fields are non-zero.

**Checkpoint**: `node --import tsx --test "src/http/chat.test.ts"` passes.

---

## Phase 5: User Story 3 — Multi-Turn Long Conversation Inspection Script (`conversa-long.sh`) (Priority: P2)

**Goal**: Provide an executable script `conversa-long.sh` demonstrating token progression across sequential turns in a long conversation.

**Independent Test**:
Execute `bash ./conversa-long.sh` against running OpsPilot server. Observe sequential turns printing `promptTokens` and `historyMessages` for each turn.

### Implementation for User Story 3

- [x] T012 [US3] Create `conversa-long.sh` in the project root that sends sequential dialogue turns to `http://localhost:3000/chat` reusing `conversationId`, formatted with turn index, `promptTokens`, `historyMessages`, and assistant response snippet
- [x] T013 [US3] Add automated multi-turn progression test in `src/http/chat.test.ts` verifying that `contextBreakdown.history` strictly increases from turn 1 to turn 3

**Checkpoint**: `conversa-long.sh` runs and multi-turn test passes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, typecheck, and full test suite verification.

- [x] T014 Run `npm run typecheck` — zero errors
- [x] T015 Run `npm test` — all test suites pass (unit, HTTP, MCP, memory, context, reflection)
- [x] T016 Run quickstart validation scenarios from `specs/011-context-tokens-metrics/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verification only
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 — `src/context/tokens.ts` (MVP core)
- **User Story 2 (Phase 4)**: Depends on Phase 3 — strategy & `/chat` controller wiring
- **User Story 3 (Phase 5)**: Depends on Phase 4 — multi-turn script & test
- **Polish (Phase 6)**: Depends on all user stories complete

### Parallel Opportunities

- **T004 + T005 + T006**: Can be developed in parallel inside `src/context/tokens.ts`
- **T008 + T009**: Strategies can be updated in parallel
- **T012**: `conversa-long.sh` can be written in parallel with T010/T011

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup verification
2. Complete Phase 2: Schemas & Types (T002–T003)
3. Complete Phase 3: Token module + Unit tests (T004–T007)
4. **STOP and VALIDATE**: `node --import tsx --test "src/context/tokens.test.ts"` — MVP ready!

### Incremental Delivery

1. Setup + Foundational → Types and schemas ready
2. Add US1 → `src/context/tokens.ts` working with 100% unit tests (MVP!)
3. Add US2 → Real tokens in `react.ts`, `plan-and-execute.ts`, and `/chat` metrics
4. Add US3 → `conversa-long.sh` and multi-turn test
5. Polish → Full test suite verification (`npm test` & `npm run typecheck`)
