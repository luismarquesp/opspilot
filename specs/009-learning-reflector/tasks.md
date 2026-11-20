# Tasks: Learning Reflector & Memory Distillation

**Feature**: 009-learning-reflector | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify clean build status before adding reflection components.

- [x] T001 Verify existing project builds cleanly: run `npm run typecheck` and `npm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core distillation schema, prompt with negative filtering, and `LearningReflector` implementation.

**⚠️ CRITICAL**: Must complete before user story HTTP wiring can begin.

- [x] T002 [P] Define `LearningExtractionSchema`, `LearningExtraction` type, `ReflectionInput`, and `ILearningReflector` interface in `src/memory/reflector.ts`
- [x] T003 [P] Define `LEARNING_REFLECTOR_PROMPT` in `src/memory/reflector.ts` with explicit negative constraints: never extract punctual commands, never extract secrets, only extract durable operational facts
- [x] T004 Implement `LearningReflector` class and `defaultLearningReflector` in `src/memory/reflector.ts` using `withStructuredOutput(LearningExtractionSchema)` and invoking `memoryStore.remember(userId, fact)` when `hasLearning: true`
- [x] T005 Write unit tests for `LearningReflector` in `src/memory/reflector.test.ts` using mock LLM and `:memory:` `SqliteMemoryStore`:
  (1) Durable operational statement yields `hasLearning: true` and calls `remember()`;
  (2) Punctual/ephemeral command yields `hasLearning: false` and does not call `remember()`;
  (3) Secret/credential input yields `hasLearning: false` and persists nothing;
  (4) LLM failure or timeout is caught gracefully without throwing.

**Checkpoint**: `npm run typecheck` and `node --import tsx --test "src/memory/reflector.test.ts"` pass.

---

## Phase 3: User Story 1 — Autonomous Operational Fact Distillation (Priority: P1) 🎯 MVP

**Goal**: Automatically distill durable operational facts after each chat response and persist them asynchronously via `memoryStore.remember(userId, fact)` without blocking the HTTP response.

**Independent Test**: Send `POST /chat` with `userId` and message "Sou responsável pela payment-api e pelo auth-service". Receive 200 response immediately. Verify asynchronously that `memoryStore.list(userId)` contains the distilled fact.

### Implementation for User Story 1

- [x] T006 [US1] Update `ChatControllerOptions` and `AppOptions` in `src/http/chat.controller.ts` and `src/http/server.ts` to accept optional `learningReflector?: ILearningReflector`
- [x] T007 [US1] Update `createChatHandler()` in `src/http/chat.controller.ts`: after `resolvedStrategy.run()` completes and before/during response return, dispatch `reflector.reflect({ userMessage: message, assistantAnswer: result.answer, userId, memoryStore })` in a non-blocking background microtask (`void ...catch(...)`), only if `userId` is present
- [x] T008 [US1] Write integration tests in `src/http/chat.test.ts`:
  (1) `POST /chat` with `userId` triggers background reflection and persists distilled fact;
  (2) `POST /chat` without `userId` skips reflection;
  (3) Ephemeral message produces no persisted memory.

**Checkpoint**: Background reflection works end-to-end. `npm test` passes.

---

## Phase 4: User Story 2 — Agent Tool for Forgetting Preferences (Priority: P2)

**Goal**: Expose `forget_preference` tool to agent reasoning strategies, allowing operators to revoke obsolete preferences in natural language.

**Independent Test**: Seed a memory for a user, call `forget_preference` with matching description or ID, verify the memory is removed and a confirmation string is returned.

### Implementation for User Story 2

- [x] T009 [US2] Define `ForgetPreferenceSchema` and implement `forgetPreference` tool in `src/agents/tools.ts`, registered in `opsTools`. Tool accepts `queryOrId` and optional `userId`, resolving natural language queries via `memoryStore.recall()` before calling `memoryStore.forget()`.
- [x] T010 [US2] Write unit tests for `forgetPreference` tool in `src/agents/tools.test.ts`:
  (1) Natural language query recalls and deletes matching preference;
  (2) Numeric ID deletes memory directly;
  (3) Non-matching query returns informative message without error.

**Checkpoint**: `forget_preference` tool functional and tested. `npm test` passes.

---

## Phase 5: User Story 3 — Asynchronous & Non-Blocking Reflection Execution (Priority: P3)

**Goal**: Guarantee 0ms blocking impact on `/chat` HTTP response latency from reflection.

**Independent Test**: Measure HTTP response time with a mock reflector that introduces 500ms artificial delay. Assert response completes under 100ms.

### Implementation for User Story 3

- [x] T011 [US3] Add latency and non-blocking integration test in `src/http/chat.test.ts`: inject a slow mock reflector (500ms delay), send `POST /chat`, and assert the HTTP response arrives immediately without waiting for the reflector delay.

**Checkpoint**: Non-blocking execution verified. `npm test` passes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, typecheck, and full test suite verification.

- [x] T012 Run `npm run typecheck` — zero errors
- [x] T013 Run `npm test` — all tests pass (unit, HTTP, MCP, memory, reflection)
- [x] T014 Run quickstart.md validation scenarios from `specs/009-learning-reflector/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verification only
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 — background reflection in `/chat` (MVP)
- **User Story 2 (Phase 4)**: Depends on Phase 2 — `forget_preference` tool
- **User Story 3 (Phase 5)**: Depends on Phase 3 — non-blocking verification
- **Polish (Phase 6)**: Depends on all user stories complete

### Parallel Opportunities

- **T002 + T003**: Schema and Prompt can be defined in parallel
- **T009 + T010 (US2)** can run in parallel with **T006–T008 (US1)**

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup verification
2. Complete Phase 2: Schema + Reflector class + Unit tests (T002–T005)
3. Complete Phase 3: Background reflection in `/chat` (T006–T008)
4. **STOP and VALIDATE**: `npm run typecheck && npm test` — MVP complete!

### Incremental Delivery

1. Setup + Foundational → Reflector service working
2. Add US1 → Background distillation in `/chat` → **MVP!**
3. Add US2 → `forget_preference` agent tool
4. Add US3 → Non-blocking latency verification
5. Polish → Full test suite verification
