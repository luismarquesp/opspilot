# Feature Specification: Persistent Conversation Store and Multi-Turn Chat

**Feature Branch**: `007-persistent-conversation`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "Conversa persistente: - ConversationStore (append/lastMessages/create) + tabela messages como no SqliteOpsStore - /chat: conversationId opcional, devolvido na resposta - 12 últimas mensagens no prompt via composição; métrica historyMessages - testes: \":memory:\" + fake"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Continuing Operational Inquiries Across Turns (Priority: P1)

As an on-call engineer troubleshooting an active alert, I want OpsPilot to maintain conversation continuity across multiple turns using an optional `conversationId`, so that I can ask follow-up questions, reference previous diagnostic output, and guide remediation without repeating context.

**Why this priority**: Incident resolution is an inherently iterative dialogue. Without multi-turn persistence, operators must repeatedly copy-paste previous diagnoses, which slows down resolution during critical production outages.

**Independent Test**: Send a `POST /chat` request without a `conversationId` to initiate a session, receive an assigned `conversationId` in the response, and then issue a second `POST /chat` referencing that `conversationId`. Verify that the second response reflects conversational awareness of the first turn.

**Acceptance Scenarios**:

1. **Given** a new operational inquiry without a `conversationId`, **When** the client submits `POST /chat` with `{"message": "Check payment-api error rate"}`, **Then** the server creates a new conversation, generates a non-empty `conversationId`, persists the user prompt and agent response, and returns status 200 with the `conversationId` included in the response.
2. **Given** an existing active `conversationId`, **When** the client submits `POST /chat` with `{"conversationId": "conv-123", "message": "Now check database deadlocks"}`, **Then** the server persists the new turn under `conv-123`, includes prior conversation history in the agent's prompt context, and returns status 200 with `conversationId: "conv-123"`.
3. **Given** any successful `/chat` invocation, **When** the client inspects the response payload, **Then** both the user question and the final answer are durable in the store.

---

### User Story 2 - Durable Conversation Storage Across Process Restarts (Priority: P2)

As a site reliability engineer or platform operator, I want conversation history to be stored durably in the local database alongside operational entities, so that active troubleshooting sessions survive service restarts or pod redeployments.

**Why this priority**: OpsPilot instances may be recycled during deployments or infrastructure autoscaling. Durable storage ensures ongoing incident discussions are not erased midway through an incident investigation.

**Independent Test**: Create a conversation with several messages using the persistent store, reinitialize the store instance pointing to the same database file (or examine the database), and retrieve the latest messages. Verify that all messages are present with correct timestamps and ordering.

**Acceptance Scenarios**:

1. **Given** a database file on disk, **When** `ConversationStore.create()` and `ConversationStore.append()` are called, **Then** records are written to a `messages` table with primary key, conversation identifier, role (`user` or `assistant`), content, and timestamp.
2. **Given** a restarted application pointing to an existing database, **When** `ConversationStore.lastMessages(conversationId)` is called, **Then** previously saved messages for that conversation are returned in chronological order.
3. **Given** multiple distinct conversation identifiers, **When** retrieving messages for one conversation, **Then** messages belonging to other conversations are never leaked or mixed together.

---

### User Story 3 - Bounded Context Window & History Telemetry (Priority: P3)

As an operations lead, I want OpsPilot to incorporate up to the 12 most recent messages from conversation history into the reasoning prompt and report the number of injected history messages in execution metrics, so that LLM context limits are respected and prompt composition is transparent.

**Why this priority**: Unbounded conversation history causes prompt token bloat, increased latency, higher costs, and eventual context overflow. A 12-message sliding window balances sufficient situational memory with cost and latency control.

**Independent Test**: Populate a conversation with 16 messages (8 back-and-forth turns), submit a new chat message referencing that conversation, and inspect the telemetry metrics in the response. Verify that exactly 12 prior messages are composed into the prompt and that `metrics.historyMessages` reports `12`.

**Acceptance Scenarios**:

1. **Given** a conversation with 4 historical messages, **When** a new message is submitted to `/chat`, **Then** all 4 messages are included in the prompt composition and the response contains `metrics.historyMessages: 4`.
2. **Given** a conversation with more than 12 historical messages (e.g. 20 messages), **When** a new message is submitted to `/chat`, **Then** only the 12 most recent messages are composed into the prompt (oldest of the 12 to newest) and the response contains `metrics.historyMessages: 12`.
3. **Given** a new conversation with 0 prior messages, **When** the first message is submitted, **Then** `metrics.historyMessages` equals `0`.

---

### User Story 4 - Deterministic Offline Integration Testing (Priority: P4)

As an engineer running the automated test suite, I want to test all persistent conversation scenarios using an in-memory database (`:memory:`) and a deterministic fake reasoning strategy, so that test suites run swiftly and reliably without network access or LLM fees.

**Why this priority**: Reliable CI depends on hermetic, sub-second test execution. Using `:memory:` SQLite and mock reasoning guarantees reproducible assertions on multi-turn history, metrics, and schema validation.

**Independent Test**: Execute `npm test` to run integration tests that verify conversation creation, turn progression, sliding window truncation (12 messages), and error boundaries using an in-memory database and deterministic fake strategies.

**Acceptance Scenarios**:

1. **Given** an in-memory test database, **When** running multi-turn chat test scenarios with a fake strategy, **Then** all assertions on `conversationId`, `metrics.historyMessages`, and message persistence pass completely offline.
2. **Given** invalid request payloads (e.g. empty message or invalid types), **When** posted with or without a `conversationId`, **Then** the endpoint rejects the request with HTTP 400 Bad Request before database writes occur.

---

### Edge Cases

- **Non-Existent Conversation ID**: When a client provides a `conversationId` that does not exist in the database, the system will initialize that conversation with the provided ID (or create a new session under that ID) without throwing an unhandled error, starting with `historyMessages: 0`.
- **Empty or Whitespace-Only Message**: Submitting `{"message": "   ", "conversationId": "conv-1"}` must be rejected with HTTP 400 at boundary validation without appending an empty message to the store.
- **Agent or Strategy Execution Failure**: If the underlying reasoning strategy throws an error (e.g. timeout 504 or runtime 500), the incoming user message must not corrupt subsequent conversation state, and the server must handle the failure gracefully.
- **Message Chronology in Sliding Window**: When selecting the last 12 messages, messages must be ordered chronologically (from oldest to newest among the 12) when presented to prompt composition.
- **Concurrent Requests in Same Conversation**: In-process SQLite `DatabaseSync` serializes synchronous database writes safely; conversation message records will have unique sequential or monotonic identifiers.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a `ConversationStore` interface (e.g. `IConversationStore`) and an implementation backed by SQLite using `node:sqlite` (`DatabaseSync`), supporting the operations: `create`, `append`, and `lastMessages`.
- **FR-002**: The conversation store MUST create a `messages` table using idempotent DDL (`CREATE TABLE IF NOT EXISTS`) upon initialization.
- **FR-003**: The `messages` table schema MUST include columns: `id` (primary key), `conversation_id` (indexed or queried text identifier), `role` (text with constraint checking `role IN ('user', 'assistant')`), `content` (non-null text), and `created_at` (timestamp text).
- **FR-004**: `ConversationStore.create()` MUST generate and return a unique conversation identifier (e.g. prefixed identifier like `conv-<uuid>` or `conv-<timestamp>-<rand>`), or accept an optional identifier.
- **FR-005**: `ConversationStore.append()` MUST persist a single message record linking `conversationId`, `role` (`"user"` or `"assistant"`), `content`, and creation timestamp.
- **FR-006**: `ConversationStore.lastMessages(conversationId, limit)` MUST retrieve up to `limit` (defaulting to 12) messages for the given conversation, sorted chronologically from oldest to newest.
- **FR-007**: The HTTP endpoint `POST /chat` MUST accept an optional `conversationId` (string) field in the request body, validated using Zod.
- **FR-008**: When `conversationId` is omitted from `POST /chat`, the endpoint MUST invoke `create()` to generate a new conversation identifier and return it in the response payload.
- **FR-009**: When `conversationId` is provided in `POST /chat`, the endpoint MUST use that identifier and return it in the response payload.
- **FR-010**: Before invoking the reasoning strategy, the endpoint MUST retrieve up to the 12 most recent historical messages for the conversation via `lastMessages(conversationId, 12)` and compose them into the prompt/input context.
- **FR-011**: The endpoint MUST record both the incoming user message and the resulting agent answer in the conversation store under the active `conversationId`.
- **FR-012**: The `POST /chat` response schema (`ChatResponseSchema`) MUST include `conversationId: string` and extend `metrics` to include `historyMessages: number` reflecting the exact count of historical messages injected into prompt context.
- **FR-013**: The persistent conversation store MUST support configuration with `":memory:"` for automated tests and default to the application SQLite path (`OPSPILOT_DB` or `./data/opspilot.db`).
- **FR-014**: Automated integration tests MUST cover single-turn initiation, multi-turn continuation, context truncation at 12 messages, `metrics.historyMessages` accuracy, and validation rejections using `:memory:` and deterministic mock strategies.

### Key Entities

- **ConversationMessage**: Represents an individual dialogue turn, containing:
  - `id`: Unique message identifier (string).
  - `conversationId`: Reference to the conversation session (string).
  - `role`: Origin of the message (`"user"` or `"assistant"`).
  - `content`: Text content of the message.
  - `createdAt`: Date/timestamp when the message was recorded.
- **ConversationStore**: Persistence interface managing conversation lifecycle and message history retrieval (`create`, `append`, `lastMessages`).
- **ChatRequest**: HTTP boundary model containing `message` (required string), `conversationId` (optional string), `strategy` (optional string), and `reflect` (optional boolean).
- **ChatResponse**: HTTP boundary model returning `conversationId` (string), `answer` (string), `trace` (array of events), and `metrics` (including `llmCalls`, `latencyMs`, and `historyMessages`).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful `/chat` responses return a valid `conversationId` and an integer `metrics.historyMessages`.
- **SC-002**: Multi-turn dialogue maintains context across subsequent requests referencing the same `conversationId`, with `historyMessages` incrementing predictably until capped at 12.
- **SC-003**: In conversations with more than 12 prior messages, prompt context is strictly bounded to the 12 most recent messages (`metrics.historyMessages === 12`).
- **SC-004**: Conversation messages persist durably in SQLite and can be retrieved across independent store instances pointing to the same database.
- **SC-005**: All automated unit and integration tests run offline against `:memory:` SQLite and complete with 100% pass rate in under 10 seconds.
- **SC-006**: Both `npm run typecheck` and `npm test` pass with zero errors.

---

## Assumptions

- SQLite with Node.js 22 built-in `node:sqlite` (`DatabaseSync`) continues to serve as the unified storage engine without third-party ORMs.
- The `messages` table can reside in the same database file specified by `OPSPILOT_DB` (alongside `services`, `alerts`, `incidents`, `runbooks`) or in a dedicated SQLite database following the same architectural patterns.
- Prompt composition injects historical messages as structured context (e.g. chat history messages or formatted conversational dialogue prefix) into the reasoning strategy invocation.
- If an unknown or unseeded `conversationId` is passed, the system gracefully treats it as a valid conversation identifier, persisting subsequent turns under that ID without throwing an error.
- Telemetry `metrics.historyMessages` reflects only the count of prior messages retrieved from storage and supplied to the strategy, excluding the current turn's prompt and answer.
