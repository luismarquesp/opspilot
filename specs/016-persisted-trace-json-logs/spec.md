# Feature Specification: Persisted Trace & Structured JSON Logs

**Feature Branch**: `016-persisted-trace-json-logs`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "Trace persistido + logs JSON:
- /chat: requestId no corpo e no header X-Request-Id.
- SQLite: requests (métricas) e trace_events (node, payloads)
- src/obs/logger.ts: 1 linha JSON por evento, só metadados
- GET/requests/:id registro + trace ordenado"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - End-to-End Request Correlation via `requestId` and `X-Request-Id` (Priority: P1) 🎯 MVP

As an on-call engineer or upstream client interacting with OpsPilot, I want every `POST /chat` response to return a unique `requestId` in both the JSON response body and the `X-Request-Id` HTTP response header, so that I can correlate client calls, operational logs, and persisted execution traces unambiguously.

**Why this priority**: Request correlation is the foundational anchor connecting HTTP responses, structured JSON logs, and persisted database records during live incident triage.

**Independent Test**:
Send a `POST /chat` request without an `X-Request-Id` header and verify that the response contains a non-empty `requestId` string in the JSON body and an identical `X-Request-Id` HTTP response header. Send another request supplying an incoming `X-Request-Id` header and verify that the exact trimmed value is echoed in both the JSON body and the response header.

**Acceptance Scenarios**:

1. **Given** a valid `POST /chat` request with no `X-Request-Id` header, **When** the request completes, **Then** the system generates a unique `requestId` and returns it in both the JSON response body (`requestId`) and the `X-Request-Id` response header.
2. **Given** a valid `POST /chat` request with a non-empty `X-Request-Id` request header, **When** the request completes, **Then** the system preserves and returns that exact trimmed identifier in both the response body `requestId` and the `X-Request-Id` response header.
3. **Given** any completed `POST /chat` response, **When** inspecting headers and body, **Then** `response.body.requestId` strictly equals `response.headers["x-request-id"]`.

---

### User Story 2 - Durable SQLite Persistence of Request Metrics & Trace Events (Priority: P1)

As an SRE auditing OpsPilot behavior after an incident or benchmark run, I want every `/chat` execution to persist its request summary and execution metrics in a `requests` SQLite table and all emitted reasoning/routing events in a `trace_events` SQLite table, so that operational history and agent decision paths survive process restarts.

**Why this priority**: Without durable persistence, execution traces and latency/token metrics disappear after the HTTP response or process shutdown, preventing post-mortem analysis and auditing.

**Independent Test**:
Execute a `/chat` request against an initialized store (either file-backed via `OPSPILOT_DB` or `:memory:` in tests). Query the SQLite `requests` and `trace_events` tables directly and verify that a `requests` row exists with accurate metrics and that all trace events are stored in `trace_events` linked by `request_id` with their `node`, `type`, `timestamp`, `content`, and structured `payload`.

**Acceptance Scenarios**:

1. **Given** a `/chat` execution finishes, **When** persisted to SQLite, **Then** the `requests` table stores a record containing `requestId`, `conversationId`, optional `userId`, selected strategy/route, status, and execution metrics (`latencyMs`, `llmCalls`, `promptTokens`, `completionTokens`, `totalTokens`, `historyMessages`, `modelUsed`, `contextBreakdown`, and creation timestamp).
2. **Given** a `/chat` execution produces trace events across multiple nodes (e.g., `context`, `router`, `react`/`plan-and-execute`/`reflection`, `response`), **When** persisted to SQLite, **Then** every trace event is stored in `trace_events` with its `request_id`, deterministic sequence order (`seq`), `type`, `node`, `timestamp`, `content`, and serialized `payload` containing event-specific attributes (`tool`, `args`, `route`, `reason`, `fromModel`, `toModel`).
3. **Given** multiple `/chat` requests run sequentially or concurrently, **When** persisted, **Then** each request's metrics and trace events are isolated under its own `requestId` without overwriting or mixing events across requests.

---

### User Story 3 - Historical Trace & Metrics Retrieval via `GET /requests/:id` (Priority: P1)

As an on-call lead or automated observability dashboard, I want to query `GET /requests/:id` to retrieve the persisted request record and its ordered execution trace, so that I can inspect exactly how OpsPilot handled any past request using only its `requestId`.

**Why this priority**: Completes the observability loop by making persisted traces and metrics directly inspectable over the API without requiring manual SQLite queries.

**Independent Test**:
Complete a `POST /chat` request and capture the returned `requestId`. Issue `GET /requests/:id` with that ID and verify HTTP 200 containing the request metadata, reconstructed `metrics`, and the full `trace` array in exact emission order. Then issue `GET /requests/non-existent-id` and verify HTTP 404.

**Acceptance Scenarios**:

1. **Given** a previously persisted `requestId`, **When** calling `GET /requests/:id`, **Then** the API returns HTTP 200 with the request record (`requestId`, `conversationId`, `userId`, `strategy`, `status`, `createdAt`), its `metrics` object, and its `trace` array ordered chronologically by execution sequence (`seq ASC`).
2. **Given** persisted trace events that include event-specific attributes (`action` with `tool` and `args`, `route` with `route` and `reason`, `fallback` with `fromModel`, `toModel`, and `reason`), **When** retrieved via `GET /requests/:id`, **Then** each returned trace event accurately reconstructs those typed fields alongside `type`, `node`, `content`, and `timestamp`.
3. **Given** an unknown or non-existent request ID, **When** calling `GET /requests/:id`, **Then** the API returns HTTP 404 with a structured JSON error payload.

---

### User Story 4 - Privacy-Safe Single-Line JSON Metadata Logging (`src/obs/logger.ts`) (Priority: P2)

As a platform security and observability engineer, I want `src/obs/logger.ts` to emit exactly one structured JSON line per event containing only safe operational metadata, so that log aggregators can parse and filter events by `requestId`, `node`, `type`, and metrics without leaking sensitive prompts, user messages, model answers, or raw tool arguments into log streams.

**Why this priority**: Production log pipelines require machine-parseable NDJSON lines for correlation and alerting while enforcing strict data minimization to prevent leaking incident payloads or secrets.

**Independent Test**:
Invoke the logger with an injectable sink across request lifecycle and trace events containing sensitive strings inside `message`, `content`, `answer`, and `args`. Verify that each logged call produces a single line terminated cleanly (one valid JSON object per line) containing metadata fields (`timestamp`, `level`, `requestId`, `conversationId`, `type`/`event`, `node`, `tool`, `route`, `fromModel`, `toModel`, `contentLength`, numeric metrics) and that none of the sensitive raw payload values appear in the serialized JSON output.

**Acceptance Scenarios**:

1. **Given** a trace event or request lifecycle event emitted during execution, **When** logged through `src/obs/logger.ts`, **Then** it outputs exactly one single-line JSON string (NDJSON, no embedded unescaped newlines) per event.
2. **Given** events containing user messages, observations, assistant answers, or tool arguments, **When** formatted into a log entry, **Then** raw payload fields (`content`, `message`, `answer`, `args`, `prompt`) are omitted and replaced only with safe metadata (such as `contentLength`, `tool`, `route`, `fromModel`, `toModel`, `node`, and metrics counts).
3. **Given** an execution with N trace events plus request lifecycle logging, **When** inspecting captured log lines, **Then** every line parses as valid JSON and correlates back to the execution via `requestId`.

---

## Edge Cases

- **Unknown Request Lookup**: Calling `GET /requests/:id` for a non-existent or empty ID returns HTTP 404 with a structured error payload (`{ error: "not_found", ... }`).
- **Incoming `X-Request-Id` Normalization**: If the incoming `X-Request-Id` header is present and non-empty after trimming, it is used as `requestId`; if absent or whitespace-only, a fresh unique ID (e.g., UUID) is generated.
- **Same-Millisecond Trace Ordering**: Multiple trace events emitted within the same millisecond (`Date.now()`) preserve exact emission order via an explicit monotonic sequence index (`seq`) in `trace_events`, ensuring `GET /requests/:id` always returns events in deterministic order.
- **Log Sanitization Guarantee**: Even if a trace event carries multi-line text, stack traces, or structured objects in `content` or `args`, `src/obs/logger.ts` excludes raw payload text and emits strictly single-line metadata JSON.
- **Database Coexistence & Test Isolation**: The `requests` and `trace_events` tables are created idempotently in the configured SQLite database (`OPSPILOT_DB`, default `./data/opspilot.db`) and work seamlessly with `:memory:` in automated tests without conflicting with existing operational, conversation, or memory tables.
- **Non-blocking / Failure Resilience**: Errors during optional observability steps or missing optional fields (such as `userId` or `modelUsed`) do not break `/chat` response contracts when defaults apply, and failed requests (e.g., 503/504/500) still carry `X-Request-Id` for correlation when applicable.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `POST /chat` MUST assign a unique `requestId` to every execution, using the incoming `X-Request-Id` header if present and non-empty (trimmed), or generating a new unique identifier (e.g., UUID) otherwise.
- **FR-002**: `POST /chat` MUST return `requestId` in the JSON response body (`ChatResponseSchema`) AND set the `X-Request-Id` HTTP response header to the exact same value.
- **FR-003**: System MUST create and maintain a `requests` table in SQLite storing request-level metadata and metrics (`request_id`, `conversation_id`, `user_id`, `strategy`, `status`, `latency_ms`, `llm_calls`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `history_messages`, `model_used`, `context_breakdown`, `created_at`).
- **FR-004**: System MUST create and maintain a `trace_events` table in SQLite storing every trace event linked to `request_id`, including sequence index (`seq`), `type`, `node`, `timestamp`, `content`, and serialized JSON `payload` for event-specific attributes (`tool`, `args`, `route`, `reason`, `fromModel`, `toModel`).
- **FR-005**: System MUST implement `src/obs/logger.ts` using pure formatting helpers and a configurable sink (defaulting to stdout/console) that emits exactly one JSON line per logged event.
- **FR-006**: Log entries emitted by `src/obs/logger.ts` MUST contain metadata only (`timestamp`, `level`, `requestId`, `conversationId`, `event`/`type`, `node`, and safe non-sensitive descriptors such as `tool`, `route`, `fromModel`, `toModel`, `contentLength`, or numeric metrics) and MUST NOT include raw message text, `content`, `answer`, prompt bodies, or raw tool `args`.
- **FR-007**: System MUST expose `GET /requests/:id` returning HTTP 200 with the persisted request record, its reconstructed `metrics` object, and its `trace` array ordered by execution sequence (`seq ASC`).
- **FR-008**: `GET /requests/:id` MUST return HTTP 404 with a structured error body when no request record matches `:id`.
- **FR-009**: All boundary inputs and outputs (`POST /chat` response with `requestId`, `GET /requests/:id` route params and response) MUST be validated with Zod schemas.
- **FR-010**: Persistence and logging components MUST follow the project's MVC architecture and support in-memory SQLite (`:memory:`) and injectable log sinks for deterministic testing.

### Key Entities *(include if feature involves data)*

- **RequestRecord**: Persisted request summary and execution telemetry (`requestId`, `conversationId`, `userId`, `strategy`, `status`, `metrics`, `createdAt`).
- **PersistedTraceEvent**: Stored trace event linked to a `requestId` with sequence order `seq`, `node`, `type`, `timestamp`, `content`, and type-specific `payload` attributes.
- **StructuredLogEntry**: Single-line JSON metadata record emitted by `src/obs/logger.ts` containing correlation identifiers, event classification, node attribution, and safe numeric/descriptor metadata.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful `POST /chat` responses include matching `requestId` in the JSON response body and `X-Request-Id` HTTP response header.
- **SC-002**: 100% of completed `/chat` executions persist their request metrics and all emitted trace events in SQLite, retrievable via `GET /requests/:id` in exact emission order.
- **SC-003**: 100% of log lines produced by `src/obs/logger.ts` are valid single-line JSON objects containing zero raw prompt, message, answer, or tool argument payloads.
- **SC-004**: Requests to `GET /requests/:id` for non-existent IDs consistently return HTTP 404.
- **SC-005**: All automated unit and integration tests and quality gates (`npm run typecheck` and `npm test`) pass with zero errors.

---

## Assumptions

- SQLite storage uses the built-in `node:sqlite` (`DatabaseSync`) module with database path configured via `OPSPILOT_DB` (default `./data/opspilot.db`) and `:memory:` during automated tests.
- `GET /requests/:id` is an internal/operator observability endpoint and does not require additional authentication beyond the existing API surface.
- When incoming `X-Request-Id` is omitted or empty, standard UUID v4 generation (`crypto.randomUUID()`) provides sufficient uniqueness across requests.
- Existing trace event types (`thought`, `action`, `observation`, `plan`, `critique`, `answer`, `summarize`, `route`, `fallback`) and mandatory `node` attribution remain the canonical trace schema.
