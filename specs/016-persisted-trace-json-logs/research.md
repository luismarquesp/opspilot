# Research: Persisted Trace & Structured JSON Logs

**Feature Branch**: `016-persisted-trace-json-logs`  
**Date**: 2026-11-17  

## Technical Questions & Decisions

### 1. End-to-End Request Correlation (`requestId` & `X-Request-Id`)

- **Context**: Operators and upstream gateways calling `POST /chat` need a deterministic correlation identifier across HTTP headers, response payloads, structured JSON logs, and persisted database records. Clients may also forward an existing `X-Request-Id` from an upstream proxy or CLI run.
- **Decision**:
  - Extract the incoming header via `req.get("X-Request-Id")?.trim()` at the entry of the `/chat` handler.
  - If the trimmed header is a non-empty string, adopt it as `requestId`; otherwise generate a fresh UUID v4 via `crypto.randomUUID()`.
  - Call `res.setHeader("X-Request-Id", requestId)` immediately upon resolving `requestId`, ensuring that both `200 OK` responses and error responses (`400`, `422`, `500`, `503`, `504`) carry the correlation header.
  - Include `requestId` in the `POST /chat` JSON response body and extend `ChatResponseSchema` in `src/http/schemas.ts` with `requestId: z.string().min(1)`.
- **Rationale**: Setting the header early guarantees correlation even on early exits or model/timeout failures, while reusing valid incoming `X-Request-Id` values supports distributed tracing across callers without introducing custom headers.
- **Alternatives Considered**:
  - *Generating a prefixed random hex string (like `req-...`)*: Rejected in favor of standard `crypto.randomUUID()`, which is universally recognized by log aggregators and avoids collisions under concurrent load while still permitting caller-supplied IDs.
  - *Setting `X-Request-Id` via Express middleware globally without controller integration*: Rejected because `chat.controller.ts` also returns `requestId` in the response body, logs events with it, and persists it in SQLite; resolving it via a pure helper (`resolveRequestId`) called by the controller keeps correlation logic explicit and testable.

---

### 2. SQLite Schema & Persistence (`requests` and `trace_events`)

- **Context**: OpsPilot uses Node.js 22 built-in `node:sqlite` (`DatabaseSync`), configured by `OPSPILOT_DB` (default `./data/opspilot.db`, and `":memory:"` in automated tests). We must persist both request-level metrics (`requests`) and node-attributed trace events with typed payloads (`trace_events`) without interfering with existing tables (`services`, `alerts`, `incidents`, `runbooks`, `messages`, `conversation_summaries`, `memories`).
- **Decision**:
  - Create `src/models/request-trace.ts` for domain types and `IRequestTraceStore` interface, and `src/store/request-trace-store.ts` implementing `SqliteRequestTraceStore`.
  - **`requests` table**:
    - `id TEXT PRIMARY KEY` (stores `requestId`)
    - `conversation_id TEXT NOT NULL`
    - `user_id TEXT` (nullable)
    - `strategy TEXT NOT NULL` (`react`, `plan-and-execute`, `reflection`)
    - `status TEXT NOT NULL DEFAULT 'completed'`
    - `latency_ms INTEGER NOT NULL`
    - `llm_calls INTEGER NOT NULL`
    - `prompt_tokens INTEGER NOT NULL DEFAULT 0`
    - `completion_tokens INTEGER NOT NULL DEFAULT 0`
    - `total_tokens INTEGER NOT NULL DEFAULT 0`
    - `history_messages INTEGER NOT NULL DEFAULT 0`
    - `model_used TEXT` (nullable)
    - `context_breakdown TEXT` (nullable JSON string)
    - `created_at TEXT NOT NULL` (ISO-8601 timestamp)
  - **`trace_events` table**:
    - `id INTEGER PRIMARY KEY AUTOINCREMENT`
    - `request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE`
    - `seq INTEGER NOT NULL` (0-based monotonic index within the request)
    - `type TEXT NOT NULL`
    - `node TEXT NOT NULL`
    - `content TEXT NOT NULL`
    - `timestamp INTEGER NOT NULL` (epoch ms from the `TraceEvent`)
    - `payload TEXT NOT NULL` (serialized JSON of event-specific properties: `tool`, `args`, `route`, `reason`, `fromModel`, `toModel`)
    - `created_at TEXT NOT NULL`
    - Index `idx_trace_events_request_seq ON trace_events (request_id, seq ASC)`
  - **Shared Store Scoping**: In `createApp(options)` (`src/http/server.ts`), resolve a single `requestTraceStore` instance (either `options.requestTraceStore` or a per-app/default `SqliteRequestTraceStore` instance) and pass it to both `createChatHandler` and `createRequestsRouter`, ensuring `POST /chat` and `GET /requests/:id` always share the same SQLite database (including `:memory:` during tests).
- **Rationale**: Storing `seq` explicitly guarantees deterministic ordering even when multiple LangGraph events share the same millisecond `timestamp`. Storing event-specific fields inside a structured JSON `payload` column keeps the relational schema clean across all `TraceEvent` variants (`action`, `route`, `fallback`, `thought`, `observation`, `plan`, `critique`, `answer`, `summarize`) and allows exact reconstruction on read.
- **Alternatives Considered**:
  - *Separate columns for every trace event variant (`tool`, `args`, `route`, `reason`, `from_model`, `to_model`)*: Rejected because sparse columns clutter the schema and require DDL migrations whenever a new trace event variant is introduced.
  - *Ordering solely by `timestamp ASC`*: Rejected because fast synchronous/in-memory steps frequently emit multiple trace events within the same millisecond (`Date.now()`), causing ambiguous ordering.

---

### 3. Single-Line JSON Metadata-Only Logger (`src/obs/logger.ts`)

- **Context**: Observability pipelines consume single-line JSON (NDJSON) written to stdout. Logs must enable filtering by `requestId`, `conversationId`, `node`, `type`/`event`, and latency/token counts while strictly preventing leakage of user messages, model answers, prompt contents, summaries, or raw tool arguments.
- **Decision**:
  - Implement `src/obs/logger.ts` with pure formatting and sanitization helpers:
    - `sanitizeLogMetadata(raw)`: strips any forbidden payload keys (`content`, `message`, `userMessage`, `answer`, `prompt`, `args`, `summary`, `observation`, `fact`, `history`, `memories`, `reason` if verbose/untrusted — note: keep safe descriptors or allowlist strictly!). Better yet, construct log records via an **explicit allowlist** per event type so raw payloads can never leak even if extra fields exist on an object.
    - `formatTraceLogLine(event, context)`: builds a JSON object containing `{ timestamp, level: "info", event: "trace_event", requestId, conversationId, userId?, seq?, type: event.type, node: event.node, contentLength: event.content.length, ...safeEventMeta }` where `safeEventMeta` extracts only:
      - for `action`: `tool: event.tool`, `argKeys: Object.keys(event.args)` (keys only, never values)
      - for `route`: `route: event.route`
      - for `fallback`: `fromModel: event.fromModel`, `toModel: event.toModel`
    - `formatRequestLogLine(record)`: builds a JSON object containing `{ timestamp, level: "info", event: "request_completed", requestId, conversationId, userId?, strategy, status, latencyMs, llmCalls, promptTokens, completionTokens, totalTokens, historyMessages, modelUsed?, traceCount }` (and `formatRequestErrorLogLine` for `503`/`504`/`500` errors with `statusCode` and `errorCode`, never raw exception stack traces or user prompts).
  - Serialize via `JSON.stringify(entry)` (producing strictly 1 line with zero embedded newlines) and emit through an injectable `LogSink = (line: string) => void` (defaulting to `(line) => console.log(line)` or `process.stdout.write(`${line}\n`)`).
- **Rationale**: Building log payloads via strict allowlists (rather than relying solely on blocklists) guarantees that raw message text, prompts, answers, and tool argument values never appear in logs. Pure formatting helpers paired with an injectable `LogSink` satisfy the Constitution's Pure Functions and Test-First principles without touching global stdout in unit tests.
- **Alternatives Considered**:
  - *General-purpose logging libraries (e.g., `pino`, `winston`)*: Rejected to keep zero extra runtime dependencies, adhere to strict metadata-only allowlist serialization, and preserve lightweight pure functions.
  - *Logging full `TraceEvent` objects with redacted `content`*: Rejected because `args` in `action` events or `content` in `observation`/`answer` events could still contain PII, secrets, or large multi-line text; extracting only `contentLength` and `argKeys` is strictly metadata-only.

---

### 4. Trace & Metrics Retrieval Endpoint (`GET /requests/:id`)

- **Context**: SREs and integration tests need an HTTP endpoint to inspect persisted request metrics and the ordered execution trace for a given `requestId`.
- **Decision**:
  - Create `src/http/requests.controller.ts` exporting `createRequestsRouter(store)`.
  - Mount `app.use("/requests", createRequestsRouter(requestTraceStore))` in `src/http/server.ts`.
  - Validate `req.params` with `GetRequestParamsSchema` (`{ id: z.string().trim().min(1) }`), returning `400 validation_error` on malformed params.
  - Call `store.getRequestWithTrace(id)`:
    - If `null`, return `404` with `{ error: "request_not_found", requestId: id }`.
    - Otherwise validate/return `200` with `{ id, requestId, conversationId, ...(userId ? { userId } : {}), strategy, status, createdAt, metrics, trace }`, where `trace` is the ordered array of `TraceEvent` objects reconstructed from `trace_events` ordered by `seq ASC`.
- **Rationale**: Mirrors the existing MVC pattern used by `createMemoryRouter` in `src/http/memory.controller.ts` and validates both parameters and response shapes with Zod schemas at the boundary.
- **Alternatives Considered**:
  - *Adding `GET /requests/:id` directly inside `chat.controller.ts`*: Rejected because separating `/requests` into `src/http/requests.controller.ts` keeps controllers single-responsibility and cleanly modularized.
