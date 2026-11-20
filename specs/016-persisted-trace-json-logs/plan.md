# Implementation Plan: Persisted Trace & Structured JSON Logs

**Branch**: `016-persisted-trace-json-logs` | **Date**: 2026-11-17 | **Spec**: [specs/016-persisted-trace-json-logs/spec.md](file:///c:/Users/luism/OneDrive/Documentos/P%C3%B3s%20gradua%C3%A7%C3%A3o/Handsome/me/modulo04-agentes-autonomos/ops-pilot/specs/016-persisted-trace-json-logs/spec.md)

**Input**: Feature specification from `/specs/016-persisted-trace-json-logs/spec.md`

## Summary

Implement end-to-end request correlation, durable SQLite trace persistence, structured metadata-only NDJSON logging, and historical trace retrieval:
1. **Request Correlation (`POST /chat`)**: Assign a unique `requestId` per execution (honoring trimmed incoming `X-Request-Id` header or generating a UUID v4 via `crypto.randomUUID()`), returning it in both the `X-Request-Id` HTTP response header and the `requestId` field in the JSON response body (`ChatResponseSchema`).
2. **SQLite Persistence (`requests` & `trace_events`)**: Create `src/models/request-trace.ts` and `SqliteRequestTraceStore` in `src/store/request-trace-store.ts` using `node:sqlite` (`DatabaseSync`, `OPSPILOT_DB` or `:memory:` in tests) to persist request metrics in `requests` and sequence-ordered trace events (`seq`, `type`, `node`, `content`, `timestamp`, serialized JSON `payload`) in `trace_events`.
3. **Metadata-Only Single-Line JSON Logger (`src/obs/logger.ts`)**: Implement pure allowlist formatting functions and an injectable `LogSink` logger emitting 1 single-line JSON object per event containing only operational metadata (`timestamp`, `level`, `event`, `requestId`, `conversationId`, `node`, `type`, `contentLength`, `tool`, `argKeys`, `route`, `fromModel`, `toModel`, and numeric metrics) while strictly excluding raw `message`, `content`, `answer`, prompt bodies, and tool `args` values.
4. **Trace Retrieval Endpoint (`GET /requests/:id`)**: Implement `src/http/requests.controller.ts` mounted at `/requests` in `src/http/server.ts`, returning HTTP 200 with the persisted request record, reconstructed `metrics`, and sequence-ordered `trace` array, or HTTP 404 (`request_not_found`) when unknown.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM (`strict: true`)  
**Primary Dependencies**: `express` (`^5.2.1`), `zod` (`^4.5.4`), `node:sqlite` (`DatabaseSync`), `node:crypto`, `@langchain/langgraph` (`^1.4.14`), `@langchain/core` (`^1.2.9`)  
**Storage**: SQLite via built-in `node:sqlite` (`DatabaseSync`), path from `OPSPILOT_DB` (default `./data/opspilot.db`), `":memory:"` in tests  
**Testing**: Native Node.js test runner (`node:test`) executed via `tsx` (`supertest` for HTTP integration tests)  
**Target Platform**: Node.js server environment (Linux / Windows)  
**Project Type**: Agent reasoning engine and web service API (MVC)  
**Performance Goals**: Minimal persistence/logging overhead on `/chat` completion; O(1) indexed lookup on `requests.id` and `trace_events(request_id, seq)` for `GET /requests/:id`  
**Constraints**: Metadata-only single-line JSON logs (zero raw content/message/answer/args); deterministic trace ordering on same-millisecond events; strict Zod boundary validation; `npm run typecheck` and `npm test` green  
**Scale/Scope**: Observability module (`src/obs/logger.ts`), request/trace domain & SQLite store (`src/models/request-trace.ts`, `src/store/request-trace-store.ts`), HTTP controllers, schemas, and router wiring (`src/http/chat.controller.ts`, `src/http/requests.controller.ts`, `src/http/schemas.ts`, `src/http/server.ts`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status | Verification |
|---|---|---|---|
| **I. Pure Functions & MVC Architecture** | Clear MVC layering: Model (`src/models/request-trace.ts`, `src/store/request-trace-store.ts`), Observability Service/Helpers (`src/obs/logger.ts` pure formatters), Controllers (`src/http/chat.controller.ts`, `src/http/requests.controller.ts`). Pure functions for ID resolution, payload extraction/reconstruction, and log line formatting | **PASS** | Verified pre-design & post-Phase 1 (`data-model.md`) |
| **II. Strict Boundary Validation with Zod** | `ChatResponseSchema`, `GetRequestParamsSchema`, `RequestTraceResponseSchema`, and `RequestNotFoundResponseSchema` enforced with Zod at HTTP boundaries | **PASS** | Verified in `contracts/observability-api.md` & `data-model.md` |
| **III. Test-First & Non-Negotiable Quality Gates** | Dedicated tests planned for logger (`src/obs/logger.test.ts`), SQLite store (`src/store/request-trace-store.test.ts`), `GET /requests/:id` (`src/http/requests.test.ts`), and `POST /chat` correlation (`src/http/chat.test.ts`) using `:memory:` and injectable sinks | **PASS** | `npm run typecheck` & `npm test` remain mandatory gates |
| **IV. Secret & Environment Safety** | Uses `OPSPILOT_DB` convention without reading `.env` directly; metadata-only logger prevents credential/payload leaks in logs | **PASS** | No `.env` reads; allowlist log fields enforced |
| **V. Agent-Centric Orchestration** | Captures full LangGraph `production-graph.ts` execution traces including `node` attribution and `modelUsed` metrics without altering deterministic agent behavior | **PASS** | Preserves all `TraceEvent` types and graph flow |

## Project Structure

### Documentation (this feature)

```text
specs/016-persisted-trace-json-logs/
├── spec.md                              # Feature specification
├── plan.md                              # This file (/speckit-plan command output)
├── research.md                          # Phase 0 technical decisions
├── data-model.md                        # Phase 1 SQLite DDL, entities, schemas & diagram
├── quickstart.md                        # Phase 1 validation scenarios
├── checklists/
│   └── requirements.md                  # Spec quality validation checklist
└── contracts/
    └── observability-api.md             # Phase 1 HTTP & NDJSON log contracts
```

### Source Code (repository root)

```text
src/
├── models/
│   └── request-trace.ts                 # Domain types & IRequestTraceStore interface
├── store/
│   ├── request-trace-store.ts           # SqliteRequestTraceStore (requests + trace_events DDL & queries)
│   └── request-trace-store.test.ts      # Unit tests for persistence & seq ordering (:memory:)
├── obs/
│   ├── logger.ts                        # Pure JSON metadata formatters + injectable sink logger
│   └── logger.test.ts                   # Unit tests verifying 1-line JSON & zero raw payload leakage
└── http/
    ├── schemas.ts                       # Add requestId to ChatResponseSchema + GetRequestParams/Response schemas
    ├── chat.controller.ts               # X-Request-Id/requestId handling, persist trace, emit JSON logs
    ├── requests.controller.ts           # GET /requests/:id router (200 record+trace, 404 not found)
    ├── requests.test.ts                 # Integration tests for GET /requests/:id & end-to-end /chat persistence
    ├── server.ts                        # Wire shared requestTraceStore & logger into /chat and /requests
    └── chat.test.ts                     # Extend integration tests for requestId body & X-Request-Id header
```

**Structure Decision**: Single-project MVC layout matching existing `src/models/*`, `src/store/*`, and `src/http/*` modules, adding `src/obs/logger.ts` for observability. `createApp()` wires a shared `SqliteRequestTraceStore` instance (or `options.requestTraceStore` in tests) to both `POST /chat` and `GET /requests/:id` so in-memory `:memory:` test runs share database state seamlessly.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations detected.*
