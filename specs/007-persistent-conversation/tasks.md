# Tasks: Persistent Conversation Store and Multi-Turn Chat

**Feature**: 007-persistent-conversation | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new dependencies or project structure needed — project already has Express 5, Zod, node:sqlite, and the established MVC layout.

- [x] T001 Verify existing project builds cleanly: run `npm run typecheck` and `npm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the `IConversationStore` interface, `ConversationMessage` type, `SqliteConversationStore` implementation, and extend `StrategyMetrics` — these block all user story work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Define `ConversationMessage` interface and `IConversationStore` interface in `src/models/conversation.ts`. `ConversationMessage` has fields: `id: number`, `conversationId: string`, `role: "user" | "assistant"`, `content: string`, `createdAt: Date`. `IConversationStore` has methods: `create(): string`, `append(conversationId: string, role: "user" | "assistant", content: string): void`, `lastMessages(conversationId: string, limit?: number): ConversationMessage[]`.
- [x] T003 [P] Extend `StrategyMetricsSchema` in `src/agents/types.ts` to add `historyMessages: z.number().int().nonnegative().optional()`. Update the `StrategyMetrics` type accordingly. Ensure existing tests still pass since the field is optional.
- [x] T004 Implement `SqliteConversationStore` in `src/store/conversation-store.ts`. Follow the `SqliteOpsStore` pattern: accept `dbPath` in constructor (default from `OPSPILOT_DB` env or `./data/opspilot.db`), run idempotent DDL (`CREATE TABLE IF NOT EXISTS messages` with columns `id INTEGER PRIMARY KEY AUTOINCREMENT`, `conversation_id TEXT NOT NULL`, `role TEXT NOT NULL CHECK(role IN ('user','assistant'))`, `content TEXT NOT NULL`, `created_at TEXT NOT NULL DEFAULT (datetime('now'))`; create index `idx_messages_conversation ON messages (conversation_id, id)`). Prepare statements for `append` (INSERT), `lastMessages` (subquery: select last N by id DESC then flip to ASC), and a `create()` method that generates `conv-<Date.now().toString(36)>-<4 random hex chars>` and returns it.
- [x] T005 Write unit tests for `SqliteConversationStore` in `src/store/conversation-store.test.ts` using `:memory:` SQLite. Tests: (1) `create()` returns a string starting with `conv-`; (2) `append` + `lastMessages` round-trip — appended messages are retrievable; (3) `lastMessages` respects limit — insert 15 messages, request 12, get exactly 12 in chronological order (oldest-of-12 first); (4) `lastMessages` returns chronological order (ascending by id); (5) conversation isolation — messages from `conv-A` do not appear in `lastMessages('conv-B')`; (6) `lastMessages` on unknown conversationId returns empty array; (7) role CHECK constraint rejects invalid role values.

**Checkpoint**: `npm run typecheck` and `npm test` pass with new store and extended metrics.

---

## Phase 3: User Story 1 — Multi-Turn Chat via `/chat` (Priority: P1) 🎯 MVP

**Goal**: Extend `POST /chat` to accept optional `conversationId`, persist messages, compose history into the agent prompt, and return `conversationId` + `historyMessages` in the response.

**Independent Test**: Send `POST /chat` without `conversationId` → receive a new one. Send a second request with that `conversationId` → `historyMessages > 0`.

### Implementation for User Story 1

- [x] T006 [US1] Extend `ChatRequestSchema` in `src/http/schemas.ts` to add `conversationId: z.string().optional()`. Extend `ChatResponseSchema` to include `conversationId: z.string()`. Ensure `StrategyMetricsSchema` (already extended in T003) includes `historyMessages`.
- [x] T007 [US1] Update `ChatControllerOptions` and `AppOptions` in `src/http/chat.controller.ts` and `src/http/server.ts` to accept an optional `conversationStore?: IConversationStore`. Wire it through `createApp()` → `createChatHandler()`.
- [x] T008 [US1] Implement multi-turn conversation logic in `createChatHandler()` in `src/http/chat.controller.ts`: (1) After Zod validation, extract `conversationId` from parsed body. (2) If absent, call `conversationStore.create()` to generate one. (3) Call `conversationStore.lastMessages(conversationId, 12)` to fetch history. (4) Call `conversationStore.append(conversationId, "user", message)` to persist the user message before strategy execution. (5) Convert history messages to LangChain format `{role, content}` and prepend them to the messages array passed to `resolvedStrategy.run()`. (6) On successful strategy execution, call `conversationStore.append(conversationId, "assistant", result.answer)`. (7) Set `result.metrics.historyMessages` to the count of history messages fetched. (8) Return `{ conversationId, ...result }` in the 200 response. (9) On strategy failure (timeout/error), do NOT append assistant message but leave user message persisted. If no `conversationStore` is injected, fall back to single-turn behavior (no history, generate a random `conversationId`, skip persistence).
- [x] T009 [US1] Update `ReasoningStrategy.run()` signature in `src/agents/types.ts` to accept an optional `history?: Array<{role: string, content: string}>` parameter. Update `createReactStrategy` in `src/agents/react.ts` to prepend history messages to the `messages` array passed to `agent.invoke()`. Update `createPlanAndExecuteStrategy` in `src/agents/plan-and-execute.ts` similarly.
- [x] T010 [US1] Write integration tests in `src/http/chat.test.ts` for multi-turn flow: (1) `POST /chat` without `conversationId` returns 200 with `conversationId` string and `metrics.historyMessages: 0`; (2) Two sequential requests with the same `conversationId` — second request has `metrics.historyMessages: 2` (user + assistant from first turn); (3) Three sequential turns — third request has `metrics.historyMessages: 4`; (4) Existing tests continue to pass (backward compatibility — `conversationId` omitted). Use a fake strategy and `:memory:` `SqliteConversationStore` injected via `createApp({ conversationStore, strategyRegistry })`.

**Checkpoint**: `POST /chat` supports multi-turn conversation. `npm run typecheck` and `npm test` pass.

---

## Phase 4: User Story 2 — Durable Storage Across Restarts (Priority: P2)

**Goal**: Verify that conversation messages persist in the SQLite file and survive store re-instantiation.

**Independent Test**: Create store instance A, append messages, create store instance B on same DB path, call `lastMessages` — messages are present.

### Implementation for User Story 2

- [x] T011 [US2] Add durability tests in `src/store/conversation-store.test.ts`: create a `SqliteConversationStore` with a temporary file path (e.g. using `os.tmpdir()`), append messages, create a **second** `SqliteConversationStore` instance pointing to the same file, call `lastMessages` and assert all messages are present with correct content, role, and ordering. Clean up the temp file after test.

**Checkpoint**: Store durability verified. `npm test` passes.

---

## Phase 5: User Story 3 — Bounded Context Window & historyMessages Metric (Priority: P3)

**Goal**: Verify that prompt context is strictly bounded to 12 messages and the `historyMessages` metric is accurate at the boundary.

**Independent Test**: Populate a conversation with 16+ messages, submit a new `/chat` request, assert `metrics.historyMessages === 12`.

### Implementation for User Story 3

- [x] T012 [US3] Add sliding-window integration test in `src/http/chat.test.ts`: populate a conversation with 14 messages (7 user + 7 assistant) via direct store calls, then send `POST /chat` with that `conversationId`. Assert `metrics.historyMessages === 12` (not 14). Assert the agent's history context contains the 12 most recent messages (verify by checking the fake strategy received 12 history entries + 1 current message).

**Checkpoint**: 12-message cap enforced and verified. `npm test` passes.

---

## Phase 6: User Story 4 — Deterministic Offline Testing (Priority: P4)

**Goal**: Ensure the full test suite runs offline with `:memory:` and fake strategies.

**Independent Test**: Run `npm test` — all conversation-related tests pass with zero network calls.

### Implementation for User Story 4

- [x] T013 [US4] Add validation test in `src/http/chat.test.ts`: `POST /chat` with empty message and valid `conversationId` returns 400 without persisting any message to the store. Verify by calling `lastMessages` on the `conversationId` and asserting empty array.
- [x] T014 [US4] Add edge-case test in `src/http/chat.test.ts`: `POST /chat` with a non-existent `conversationId` (e.g. `"conv-does-not-exist"`) succeeds with 200, `historyMessages: 0`, and the provided `conversationId` is echoed back. Subsequent request to the same `conversationId` has `historyMessages: 2`.

**Checkpoint**: All edge cases covered. `npm test` passes with zero failures.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup.

- [x] T015 Run `npm run typecheck` — zero errors
- [x] T016 Run `npm test` — all tests pass (including pre-existing suite)
- [x] T017 Run quickstart.md validation scenarios from `specs/007-persistent-conversation/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verification only
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 — core multi-turn implementation
- **User Story 2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1 (store-only tests)
- **User Story 3 (Phase 5)**: Depends on Phase 3 — needs the `/chat` multi-turn flow working
- **User Story 4 (Phase 6)**: Depends on Phase 3 — needs the `/chat` multi-turn flow working
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — no cross-story dependencies
- **US2 (P2)**: Depends on Foundational only — tests store layer independently
- **US3 (P3)**: Depends on US1 — needs HTTP multi-turn flow operational
- **US4 (P4)**: Depends on US1 — needs HTTP multi-turn flow for edge-case validation

### Within Each User Story

- Models/interfaces before store implementation
- Store implementation before controller integration
- Controller integration before HTTP tests
- All changes validated with `typecheck` + `test`

### Parallel Opportunities

- **T002 + T003**: Interface/type definitions can be written in parallel (different files)
- **T011 (US2)** can run in parallel with **T006–T010 (US1)** since US2 tests only the store layer
- **T012 (US3) + T013–T014 (US4)** can run in parallel once US1 is complete

---

## Parallel Example: Phase 2 (Foundational)

```bash
# These two tasks touch different files and can run in parallel:
Task T002: "Define ConversationMessage + IConversationStore in src/models/conversation.ts"
Task T003: "Extend StrategyMetricsSchema in src/agents/types.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Verify build ✅
2. Complete Phase 2: Interface + Store + Types (T002–T005)
3. Complete Phase 3: Multi-turn `/chat` (T006–T010)
4. **STOP and VALIDATE**: `npm run typecheck && npm test` — all green
5. Feature is usable end-to-end

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Multi-turn chat works → **MVP!**
3. Add US2 → Durability verified
4. Add US3 → 12-message cap validated
5. Add US4 → Edge cases covered
6. Polish → Full validation

---

## Notes

- [P] tasks = different files, no dependencies
- [USn] label maps task to specific user story for traceability
- Each user story is independently testable after foundational phase
- All tests use `:memory:` SQLite — no file I/O in CI
- Existing `chat.test.ts` tests remain untouched — backward compatibility guaranteed by optional `conversationId`
