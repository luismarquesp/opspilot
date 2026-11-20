# Research: Persistent Conversation Store and Multi-Turn Chat

**Feature**: 007-persistent-conversation | **Date**: 2026-09-29

---

## 1. SQLite Message Table Schema Design

**Decision**: Use an auto-incrementing `INTEGER PRIMARY KEY` for the `id` column, with `conversation_id TEXT NOT NULL` as a regular indexed column, and `role TEXT NOT NULL CHECK(role IN ('user','assistant'))`.

**Rationale**: The existing `SqliteOpsStore` uses text-based primary keys (e.g. `inc-101`), but for chronologically-ordered messages, SQLite's `INTEGER PRIMARY KEY` (which aliases `rowid`) provides natural insertion order for free — `ORDER BY id ASC` gives chronological ordering without needing a timestamp-based sort. This is simpler and more efficient for the `lastMessages` sliding-window query. The `conversation_id` column gets an index for fast per-conversation lookups.

**Alternatives considered**:
- UUID string PKs (like existing store): rejected because message ordering matters and UUIDs don't sort chronologically.
- Timestamp-based PKs: rejected because `DatabaseSync` is synchronous within a single process, making rowid strictly monotonic — simpler than managing timestamp precision.

---

## 2. Conversation ID Generation Strategy

**Decision**: Use `conv-<timestamp>-<random4hex>` format via `Date.now().toString(36)` + 4 random hex chars. The `create()` method generates IDs; when `conversationId` is provided by the client in `/chat`, skip `create()` and use the provided ID directly.

**Rationale**: The prefix `conv-` is consistent with the `inc-` prefix pattern for incidents. The timestamp component provides rough chronological ordering and human-readable debuggability. The random suffix avoids collisions in the (theoretical) sub-millisecond scenario. No UUID dependency needed.

**Alternatives considered**:
- `crypto.randomUUID()`: works but provides no ordering/debugging information in the ID itself.
- Sequential integers (`conv-1`, `conv-2`): rejected because conversations have no logical sequence the way incidents do; ID collisions across restarts are harder to manage.

---

## 3. History Injection into LangChain Agent Prompt

**Decision**: Compose historical messages as LangChain `HumanMessage`/`AIMessage` objects prepended to the `messages` array passed to `agent.invoke()`. The `ReasoningStrategy.run()` method signature gains an optional `history?: Array<{role: string, content: string}>` parameter. The chat controller is responsible for fetching history and passing it to the strategy.

**Rationale**: LangChain's `createReactAgent` accepts `{ messages: BaseMessage[] }` as input. Prepending prior conversation turns as properly-typed messages means the LLM naturally sees the dialogue context before the current user message — no custom prompt template changes needed. This is the standard LangChain multi-turn pattern.

**Alternatives considered**:
- System message injection (formatting history as a text block in a system prompt): rejected because it conflates system instructions with conversation history and loses the structured message format that LLMs expect for multi-turn dialogue.
- Custom memory module (`BufferWindowMemory`): rejected because it adds a LangChain memory dependency that would auto-manage state, whereas the spec requires explicit `ConversationStore` control and `historyMessages` metric reporting.

---

## 4. Conversation Store Integration Point

**Decision**: `ConversationStore` is injected into `ChatControllerOptions` and `AppOptions`, following the same dependency-injection pattern used for `strategyRegistry` and `reflectionOptions`. The store is constructed once in the composition root and passed through.

**Rationale**: The controller already accepts configurable options. Adding `conversationStore?: IConversationStore` is consistent with the existing pattern and allows tests to inject `:memory:` instances.

**Alternatives considered**:
- Global singleton (like `src/agents/ops-store.ts`): would work for production but makes testing harder — the existing ops-store singleton approach was a pragmatic choice for tools but controllers already support DI.
- Middleware-based injection: unnecessary complexity for a single controller.

---

## 5. StrategyMetrics Extension

**Decision**: Add `historyMessages: number` as an optional field to `StrategyMetricsSchema` via `.extend()`. The controller sets this value after strategy execution, not the strategy itself — the strategy doesn't need to know about history count.

**Rationale**: The metric is a boundary concern (how many messages were fetched from the store), not a strategy concern. Keeping it at the controller layer avoids coupling strategies to the conversation store.

**Alternatives considered**:
- Having the strategy report history count: rejected because strategies shouldn't know about persistence or conversation management.
- Separate response-level field outside metrics: rejected to maintain the established `metrics` grouping pattern.

---

## 6. Error Handling on Strategy Failure

**Decision**: The user message is appended to the store **before** strategy invocation (to preserve the question). The assistant response is appended **only on success**. If the strategy throws (timeout, crash), the user message remains in history but no assistant entry is persisted — the conversation is left in a state where re-asking is natural.

**Rationale**: Persisting the user message before execution ensures the question is durable even on failure. Not persisting a failed response avoids polluting history with error artifacts. On the next request, `lastMessages` will naturally include the unanswered question, giving the agent context about what was asked.

**Alternatives considered**:
- Appending both before and after atomically (transaction): more complex and the assistant message content isn't available until after execution completes.
- Not persisting user message on failure (rollback): loses the user's question, which breaks multi-turn continuity.

---

## 7. Testing Strategy

**Decision**: Two test levels: (1) `conversation-store.test.ts` — unit tests for `SqliteConversationStore` using `:memory:` covering `create`, `append`, `lastMessages` (limit, ordering, isolation between conversations). (2) Extended `chat.test.ts` — integration tests using fake strategy + in-memory conversation store covering multi-turn flow, `conversationId` in response, `historyMessages` metrics, validation of optional `conversationId` field.

**Rationale**: Follows the established pattern where `sqlite-ops-store.test.ts` tests the store layer independently and `chat.test.ts` tests the full HTTP integration. Uses `:memory:` SQLite consistently with the rest of the test suite.

**Alternatives considered**:
- Separate `conversation.test.ts` integration file: unnecessary given that `chat.test.ts` already covers the HTTP layer and just needs additional test cases.
