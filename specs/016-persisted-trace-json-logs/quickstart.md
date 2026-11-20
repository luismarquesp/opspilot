# Quickstart Validation Guide: Persisted Trace & Structured JSON Logs

**Feature Branch**: `016-persisted-trace-json-logs`  
**Date**: 2026-11-17  

This guide describes end-to-end validation scenarios proving request correlation (`requestId` and `X-Request-Id`), durable SQLite persistence (`requests` and `trace_events`), historical trace retrieval (`GET /requests/:id`), and metadata-only NDJSON logging (`src/obs/logger.ts`).

---

## Prerequisites

1. Node.js 22 LTS installed.
2. Dependencies installed via `npm install`.
3. Baseline checks pass:
   ```bash
   npm run typecheck
   npm test
   ```

---

## Scenario 1: `POST /chat` Returns Matching `requestId` in Body and `X-Request-Id` Header

### Steps
1. Send a `POST /chat` request without an `X-Request-Id` header.
2. Send a second `POST /chat` request providing `X-Request-Id: custom-trace-001`.

### Expected Outcome
- Request 1 returns HTTP `200` with a generated `requestId` (UUID) in `res.body.requestId` and the exact same value in `res.headers["x-request-id"]`.
- Request 2 returns HTTP `200` with `"custom-trace-001"` in both `res.body.requestId` and `res.headers["x-request-id"]`.
- See [observability-api.md](contracts/observability-api.md) for payload structure.

---

## Scenario 2: SQLite Persistence & Ordered Retrieval via `GET /requests/:id`

### Steps
1. Execute `POST /chat` so multiple trace events (e.g., `route`, `thought`, `action`, `observation`, `answer`) are emitted across graph nodes.
2. Capture `requestId` from the response.
3. Call `GET /requests/<requestId>`.
4. Call `GET /requests/unknown-request-id`.

### Expected Outcome
- `requests` table holds 1 row for `<requestId>` with persisted metrics (`latency_ms`, `llm_calls`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `history_messages`, `model_used`, `context_breakdown`).
- `trace_events` table holds N rows linked to `<requestId>` with sequential `seq` (`0..N-1`), `node`, `type`, `timestamp`, `content`, and JSON `payload`.
- `GET /requests/<requestId>` returns HTTP `200` with the request metadata, reconstructed `metrics`, and `trace` array ordered identically to the original emission sequence (`seq ASC`), including typed attributes (`tool`, `args`, `route`, `reason`, `fromModel`, `toModel`).
- `GET /requests/unknown-request-id` returns HTTP `404` with `{ "error": "request_not_found", "requestId": "unknown-request-id" }`.
- See [data-model.md](data-model.md) for schema and reconstruction rules.

---

## Scenario 3: `src/obs/logger.ts` Emits 1 Single-Line JSON Entry Per Event (Metadata Only)

### Steps
1. Run unit and integration tests covering `src/obs/logger.ts` with an injectable log sink capturing emitted lines, passing trace events and request records that contain recognizable sentinel text in `message`, `content`, `answer`, and `args`.
   ```bash
   node --import tsx --test "src/obs/logger.test.ts"
   ```

### Expected Outcome
- Exactly 1 line is emitted per logged event, and each line contains no embedded newline characters.
- Every line parses cleanly with `JSON.parse(line)`.
- Each line includes correlation metadata (`timestamp`, `level`, `event`, `requestId`, `node`, `type`, `contentLength`, `tool`/`argKeys`/`route`/`fromModel`/`toModel` as applicable, or numeric metrics).
- Zero sentinel strings from raw `message`, `content`, `answer`, or `args` appear anywhere in the emitted JSON lines.

---

## Scenario 4: Full Quality Gate Verification

```bash
npm run typecheck
npm test
```

### Expected Outcome
- TypeScript compilation (`tsc --noEmit`) completes with 0 errors.
- All existing and new unit/integration tests (`src/obs/logger.test.ts`, `src/store/request-trace-store.test.ts`, `src/http/requests.test.ts`, `src/http/chat.test.ts`) pass with 0 failures.
