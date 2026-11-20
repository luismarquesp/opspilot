# Tasks: Semantic Memory Store & Context Recall

**Feature**: 008-semantic-memory | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing build and dependencies.

- [x] T001 Verify existing project builds cleanly: run `npm run typecheck` and `npm test`
- [x] T002 [P] Verify `@huggingface/transformers` dependency in `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core embedding pipeline, domain interfaces, and `SqliteMemoryStore` implementation.

**⚠️ CRITICAL**: Must complete before user story HTTP integration can begin.

- [x] T003 [P] Define `MemoryRecord`, `RecalledMemory`, `RememberResult`, and `IMemoryStore` interfaces in `src/models/memory.ts`
- [x] T004 [P] Implement lazy singleton embedding service and pure `dotProduct` math in `src/memory/embeddings.ts` using `@huggingface/transformers` (`all-MiniLM-L6-v2`, `pooling: "mean"`, `normalize: true`)
- [x] T005 Implement `SqliteMemoryStore` in `src/memory/memory-store.ts` following `SqliteConversationStore` patterns: idempotent DDL (table `memories` with `id`, `user_id`, `fact`, `embedding BLOB`, `created_at` and index `idx_memories_user`), `remember()`, `recall()`, `forget()`, `list()`, and `close()`
- [x] T006 Write comprehensive unit tests for embeddings and store in `src/memory/memory-store.test.ts` using `:memory:` SQLite:
  (1) `embed` generates 384-dimensional unit vector;
  (2) `dotProduct` calculates exact cosine similarity on normalized vectors;
  (3) `remember` stores unique fact and embedding;
  (4) `remember` deduplicates when cosine similarity > 0.92;
  (5) `recall` returns top-3 facts with score >= 0.3;
  (6) `recall` finds facts with 0 common words (semantic similarity);
  (7) `forget` removes memory for user;
  (8) User isolation — User A cannot see or delete User B's memories.

**Checkpoint**: `npm run typecheck` and `node --import tsx --test "src/memory/memory-store.test.ts"` pass.

---

## Phase 3: User Story 1 — Personalized Assistance via Semantic Recall (Priority: P1) 🎯 MVP

**Goal**: Extend `POST /chat` to accept optional `userId`, perform semantic recall on incoming messages, inject recalled facts into the agent prompt context, and echo `userId` in the response.

**Independent Test**: Seed a memory for a user without common words (e.g., "O operador gerencia o cluster de banco PostgreSQL"), send `POST /chat` with `userId` and message "Qual tecnologia relacional devo inspecionar?", and assert the response reflects the recalled context.

### Implementation for User Story 1

- [x] T007 [US1] Extend `ChatRequestSchema` in `src/http/schemas.ts` to add `userId: z.string().trim().min(1).optional()`. Extend `ChatResponseSchema` with `userId: z.string().optional()`.
- [x] T008 [US1] Update `ChatControllerOptions` and `AppOptions` in `src/http/chat.controller.ts` and `src/http/server.ts` to accept an optional `memoryStore?: IMemoryStore`. Wire it through `createApp()` and `createChatHandler()`.
- [x] T009 [US1] Update `createChatHandler()` in `src/http/chat.controller.ts`:
  (1) Extract `userId` from parsed body;
  (2) If `userId` is present, call `memoryStore.recall(userId, message, 3, 0.3)`;
  (3) If memories are recalled, format them into a memory context block and pass to `resolvedStrategy.run()`;
  (4) Return `userId` in the 200 response alongside `conversationId` and strategy result.
- [x] T010 [US1] Update `StrategyOptions` in `src/agents/types.ts` to accept optional `recalledMemories?: string[]`. Update `src/agents/react.ts` and `src/agents/plan-and-execute.ts` to incorporate recalled memories into prompt context.
- [x] T011 [US1] Write integration tests in `src/http/chat.test.ts`:
  (1) `POST /chat` with `userId` recalls relevant memories and injects them into agent context;
  (2) `POST /chat` with zero-lexical-overlap message finds semantic memory;
  (3) `POST /chat` without `userId` continues to function normally (backward compatible);
  (4) `userId` echoed in response when provided.

**Checkpoint**: `POST /chat` supports semantic memory injection. `npm test` passes.

---

## Phase 4: User Story 2 — Deduplicated Memory Acquisition (Priority: P2)

**Goal**: Ensure `remember()` reliably deduplicates near-identical facts (similarity > 0.92) across subtle phrasing variations.

**Independent Test**: Call `remember()` with two semantically identical sentences phrased differently. Verify only one row is created in SQLite.

### Implementation for User Story 2

- [x] T012 [US2] Add deduplication boundary and edge-case tests in `src/memory/memory-store.test.ts`:
  (1) Paraphrased statements with similarity > 0.92 are suppressed;
  (2) Statements with similarity <= 0.92 are both retained;
  (3) Deduplication only applies within the same `userId` (User B storing the same fact is not blocked).

**Checkpoint**: Deduplication validated. `npm test` passes.

---

## Phase 5: User Story 3 — Selective Memory Deletion (Forget) (Priority: P3)

**Goal**: Ensure operators can delete outdated facts and verify cross-user isolation during deletion.

**Independent Test**: Store facts for User A and User B, delete User A's fact, assert it is removed for User A while User B's facts remain untouched.

### Implementation for User Story 3

- [x] T013 [US3] Add deletion and isolation tests in `src/memory/memory-store.test.ts`:
  (1) `forget()` returns `true` and deletes memory when matching `userId` and `id`;
  (2) `forget()` returns `false` when `memoryId` does not exist;
  (3) `forget()` returns `false` and does not delete when `userId` does not match the memory's owner.

**Checkpoint**: Deletion and isolation verified. `npm test` passes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, typecheck, and full test suite verification.

- [x] T014 Run `npm run typecheck` — zero errors
- [x] T015 Run `npm test` — all tests pass (unit, HTTP, MCP, memory)
- [x] T016 Run quickstart.md validation scenarios from `specs/008-semantic-memory/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verification only
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 — core semantic recall in `/chat` (MVP)
- **User Story 2 (Phase 4)**: Depends on Phase 2 — store-level deduplication tests
- **User Story 3 (Phase 5)**: Depends on Phase 2 — store-level deletion & isolation tests
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only
- **US2 (P2)**: Depends on Foundational only (can run in parallel with US1)
- **US3 (P3)**: Depends on Foundational only (can run in parallel with US1)

### Parallel Opportunities

- **T003 + T004**: `models/memory.ts` and `memory/embeddings.ts` can be written in parallel
- **T012 (US2) + T013 (US3)**: Store-level tests can run in parallel with US1 HTTP wiring

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup verification
2. Complete Phase 2: Interfaces + Embeddings + SqliteMemoryStore + Unit tests (T003–T006)
3. Complete Phase 3: HTTP integration with `userId` and context injection (T007–T011)
4. **STOP and VALIDATE**: `npm run typecheck && npm test` — MVP complete!

### Incremental Delivery

1. Setup + Foundational → Embeddings & Store working
2. Add US1 → Chat with semantic memory recall → **MVP!**
3. Add US2 → Deduplication edge cases verified
4. Add US3 → Deletion and tenant isolation verified
5. Polish → Full test suite verification
