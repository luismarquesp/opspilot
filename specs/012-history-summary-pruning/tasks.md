# Tasks: History Pruning & Rolling Summary

**Feature**: 012-history-summary-pruning | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify clean build status before adding pruning and summary components.

- [X] T001 Verify existing project builds cleanly: run `npm run typecheck` and `npm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, domain interfaces, and Zod trace schemas that all stories depend on.

**⚠️ CRITICAL**: Must complete before summarizer and controller wiring can begin.

- [X] T002 [P] Define `ConversationSummary` interface and add `getSummary`, `setSummary`, and `getEvictedUnsummarizedMessages` to `IConversationStore` in `src/models/conversation.ts`
- [X] T003 [P] Add `"summarize"` to `TraceEventTypeSchema` in `src/agents/types.ts`
- [X] T004 [P] Add `summary` field to `ContextBreakdownSchema` in `src/agents/types.ts` and `ContextBreakdownInput` in `src/context/tokens.ts`
- [X] T005 Implement `conversation_summaries` table DDL, `getSummary`, `setSummary`, and `getEvictedUnsummarizedMessages` in `src/store/conversation-store.ts`
- [X] T006 Write unit tests for `conversation_summaries` DDL, CRUD, and boundary pruning query in `src/store/conversation-store.test.ts`

**Checkpoint**: `npm run typecheck` and `node --import tsx --test "src/store/conversation-store.test.ts"` pass.

---

## Phase 3: User Story 1 — Chunked Pruning & Summarizer Engine (Priority: P1) 🎯 MVP

**Goal**: Implement `ConversationSummarizer` with prompt preserving decisions, facts, and open pending tasks in ~150 tokens, supporting fake/mock LLMs for deterministic testing.

**Independent Test**:
Call `summarizer.summarize(previousSummary, chunkOf8)` with mock model. Verify output preserves decisions, facts, and pending items in ~150 tokens.

### Implementation for User Story 1

- [X] T007 [US1] Implement `IConversationSummarizer`, `CONVERSATION_SUMMARIZER_PROMPT`, and `ConversationSummarizer` class in `src/context/summarizer.ts` with custom model support and error fallback
- [X] T008 [US1] Write unit tests in `src/context/summarizer.test.ts`:
  (1) Distills decisions, facts, and pending items into concise summary;
  (2) Merges smoothly with existing previous summary;
  (3) Model failure or timeout falls back gracefully to previous summary without throwing.
- [X] T009 [US1] Update `estimateContextBreakdown` in `src/context/tokens.ts` and unit tests in `src/context/tokens.test.ts` to calculate `contextBreakdown.summary`

**Checkpoint**: `node --import tsx --test "src/context/summarizer.test.ts"` passes.

---

## Phase 4: User Story 2 — Context Injection & 8-Message Active Window (Priority: P1)

**Goal**: Keep active raw message history window at 8 messages in `/chat`, inject rolling summary before raw history in agent context, and account for summary tokens in metrics breakdown.

**Independent Test**:
Send messages to `/chat`. Verify active raw history never exceeds 8 messages, and when summary is present, it is injected as `[Resumo da Conversa Anterior]` ahead of history.

### Implementation for User Story 2

- [X] T010 [US2] Update `createReactStrategy` in `src/agents/react.ts` to accept optional `summary?: string` in `StrategyOptions` and prepend `[Resumo da Conversa Anterior]\n${summary}\n\n` before history messages
- [X] T011 [US2] Update `createChatHandler` in `src/http/chat.controller.ts`:
  (1) Limit raw history to 8 messages (`conversationStore.lastMessages(conversationId, 8)`);
  (2) Check `getEvictedUnsummarizedMessages(conversationId, 8)`;
  (3) When evicted unsummarized messages count >= 8, trigger summarizer on chunk of 8, persist updated summary, and emit `"summarize"` trace event;
  (4) When count < 8, skip summarization;
  (5) Pass active summary to strategy and compute `contextBreakdown.summary`.
- [X] T012 [US2] Write integration tests in `src/http/chat.test.ts`:
  (1) Verify active raw history is capped at 8 messages;
  (2) Verify summary is injected into agent context;
  (3) Verify `metrics.contextBreakdown.summary` is populated.

**Checkpoint**: `node --import tsx --test "src/http/chat.test.ts"` passes.

---

## Phase 5: User Story 3 — Trace Event `"summarize"` & Threshold Verification (Priority: P2)

**Goal**: Verify that the `"summarize"` event is emitted in `trace` if and only if summarization occurred during that turn (refeito só quando 8 novas mensagens saem da janela, nunca a cada request).

**Independent Test**:
In an automated test, send 16 sequential messages with fake summarizer. Verify `"summarize"` event is absent on turns 1..15, present on turn 16, absent on turns 17..23, and present on turn 24.

### Implementation for User Story 3

- [X] T013 [US3] Write integration tests in `src/http/chat.test.ts` for exact threshold triggering and trace event emission:
  (1) Messages 1 to 15: exactly 0 `"summarize"` events in trace;
  (2) Message 16: exactly 1 `"summarize"` event in trace;
  (3) Messages 17 to 23: exactly 0 `"summarize"` events in trace;
  (4) Message 24: exactly 1 `"summarize"` event in trace with merged summary.

**Checkpoint**: Threshold integration tests pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, typecheck, and full test suite verification.

- [X] T014 Run `npm run typecheck` — zero errors
- [X] T015 Run `npm test` — all test suites pass (unit, HTTP, MCP, memory, context, reflection, pruning)
- [X] T016 Run quickstart validation scenarios from `specs/012-history-summary-pruning/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verification only
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 — `src/context/summarizer.ts` (MVP core)
- **User Story 2 (Phase 4)**: Depends on Phase 3 — strategy & `/chat` controller wiring
- **User Story 3 (Phase 5)**: Depends on Phase 4 — threshold verification test
- **Polish (Phase 6)**: Depends on all user stories complete

### Parallel Opportunities

- **T002 + T003 + T004**: Types and schemas can be updated in parallel
- **T007 + T009**: Summarizer and token breakdown can be developed in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup verification
2. Complete Phase 2: Schema + DB DDL + Store methods (T002–T006)
3. Complete Phase 3: Summarizer class + Unit tests (T007–T009)
4. **STOP and VALIDATE**: Store and summarizer unit tests pass!

### Incremental Delivery

1. Setup + Foundational → Table and store ready
2. Add US1 → Summarizer engine and prompt working (MVP!)
3. Add US2 → 8-message window and context injection in `/chat`
4. Add US3 → Trace event `"summarize"` and threshold testing
5. Polish → Full test suite verification (`npm test` & `npm run typecheck`)
