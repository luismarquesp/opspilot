---

description: "Actionable, dependency-ordered task list for Persisted Trace & Structured JSON Logs"
---

# Tasks: Persisted Trace & Structured JSON Logs

**Input**: Design documents from `specs/016-persisted-trace-json-logs/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/observability-api.md`, `quickstart.md`)

**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/observability-api.md`, `quickstart.md`

**Tests**: Automated tests are included for all stories per the OpsPilot Constitution (Principle III: Test-First & Non-Negotiable Quality Gates) using `node:test` via `tsx`, `:memory:` SQLite, and injectable log sinks.

**Organization**: Tasks are grouped by user story in priority order to enable independent implementation, testing, and incremental delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`, `US4`)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/` at repository root (`src/models/`, `src/store/`, `src/obs/`, `src/http/`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline verification before starting implementation changes.

- [X] T001 Verify baseline TypeScript compilation and test suite in `package.json` by running `npm run typecheck` and `npm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core domain types, store interface, and HTTP boundary Zod schemas that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Define `RequestRecord`, `RequestWithTrace`, `SaveRequestTraceInput`, and `IRequestTraceStore` domain interfaces in `src/models/request-trace.ts`
- [X] T003 [P] Update `ChatResponseSchema` with `requestId` and add `GetRequestParamsSchema`, `RequestTraceResponseSchema`, and `RequestNotFoundResponseSchema` in `src/http/schemas.ts`

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - End-to-End Request Correlation via `requestId` and `X-Request-Id` (Priority: P1) 🎯 MVP

**Goal**: Assign a unique `requestId` to every `POST /chat` execution (honoring non-empty incoming `X-Request-Id` or generating a UUID v4) and return it in both the JSON response body and the `X-Request-Id` HTTP response header.

**Independent Test**: Send `POST /chat` with and without an `X-Request-Id` header in `src/http/chat.test.ts` and verify matching `res.body.requestId` and `res.headers["x-request-id"]`.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T004 [P] [US1] Add integration tests in `src/http/chat.test.ts` verifying auto-generated `requestId` and echoed `X-Request-Id` header/body correlation on `POST /chat`

### Implementation for User Story 1

- [X] T005 [US1] Implement pure `resolveRequestId` helper and set `X-Request-Id` response header plus `requestId` body field in `src/http/chat.controller.ts`

**Checkpoint**: User Story 1 (MVP) is fully functional and testable independently.

---

## Phase 4: User Story 2 - Durable SQLite Persistence of Request Metrics & Trace Events (Priority: P1)

**Goal**: Persist every completed `/chat` request's summary and metrics in the SQLite `requests` table and all emitted trace events (`seq`, `type`, `node`, `timestamp`, `content`, JSON `payload`) in the `trace_events` table.

**Independent Test**: Run `src/store/request-trace-store.test.ts` against `:memory:` SQLite to verify DDL creation, metrics storage, payload serialization/reconstruction across all trace event types, and deterministic `seq` ordering.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T006 [P] [US2] Create unit tests for `SqliteRequestTraceStore` in `src/store/request-trace-store.test.ts` covering `requests` metrics persistence, `trace_events` payload serialization, and `seq` ordering

### Implementation for User Story 2

- [X] T007 [US2] Implement `SqliteRequestTraceStore` with `requests` and `trace_events` DDL, pure payload helpers (`extractTracePayload`, `reconstructTraceEvent`), and `getDefaultRequestTraceStore` in `src/store/request-trace-store.ts`
- [X] T008 [US2] Integrate `requestTraceStore.saveRequest` into `POST /chat` execution flow in `src/http/chat.controller.ts`

**Checkpoint**: User Stories 1 and 2 are complete; every `/chat` execution correlates via `requestId` and persists metrics + trace events to SQLite.

---

## Phase 5: User Story 3 - Historical Trace & Metrics Retrieval via `GET /requests/:id` (Priority: P1)

**Goal**: Expose `GET /requests/:id` returning HTTP 200 with the persisted request record, reconstructed `metrics`, and chronologically ordered `trace` array (`seq ASC`), or HTTP 404 when the request ID does not exist.

**Independent Test**: Run `src/http/requests.test.ts` to verify `POST /chat` followed by `GET /requests/:id` returns HTTP 200 with matching metrics and ordered trace events, and `GET /requests/unknown-id` returns HTTP 404.

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T009 [P] [US3] Create integration tests for `GET /requests/:id` (200 ordered trace + metrics and 404 not found) in `src/http/requests.test.ts`

### Implementation for User Story 3

- [X] T010 [US3] Implement `createRequestsRouter` handling `GET /requests/:id` with Zod validation and 404 translation in `src/http/requests.controller.ts`
- [X] T011 [US3] Mount `/requests` router and share `requestTraceStore` instance between `/chat` and `/requests` in `src/http/server.ts`

**Checkpoint**: User Stories 1, 2, and 3 are complete and independently testable via HTTP endpoints.

---

## Phase 6: User Story 4 - Privacy-Safe Single-Line JSON Metadata Logging (`src/obs/logger.ts`) (Priority: P2)

**Goal**: Emit 1 single-line JSON log entry per trace event and request lifecycle event via `src/obs/logger.ts` containing only operational metadata and zero raw payload fields (`content`, `message`, `answer`, `args`).

**Independent Test**: Run `src/obs/logger.test.ts` with an injected sink to verify 1 valid JSON line per event, correlation by `requestId`, and complete absence of sentinel strings from `message`, `content`, `answer`, and `args`.

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US4] Create unit tests in `src/obs/logger.test.ts` verifying single-line NDJSON output and strict exclusion of `content`, `message`, `answer`, and `args` values

### Implementation for User Story 4

- [X] T013 [US4] Implement pure metadata allowlist formatters (`formatTraceLogLine`, `formatRequestLogLine`, `sanitizeLogMetadata`) and `createLogger` with injectable `LogSink` in `src/obs/logger.ts`
- [X] T014 [US4] Wire logger into `src/http/chat.controller.ts` and `src/http/server.ts` to emit 1 JSON metadata line per trace event and request completion/failure

**Checkpoint**: All user stories (US1–US4) are implemented and independently verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final type safety verification, full test regression, and quickstart validation.

- [X] T015 Run `npm run typecheck` across the repository to verify zero TypeScript errors
- [X] T016 Run `npm test` to verify all unit and integration test suites pass
- [X] T017 Validate end-to-end scenarios against `specs/016-persisted-trace-json-logs/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — executes first (`T001`).
- **Foundational (Phase 2)**: Depends on Setup completion (`T001`) — BLOCKS all user stories (`T002`, `T003`).
- **User Story 1 (Phase 3 - P1 MVP)**: Depends on Foundational completion (`T002`, `T003`).
- **User Story 2 (Phase 4 - P1)**: Depends on Foundational completion (`T002`, `T003`) and integrates with `chat.controller.ts` after US1 (`T005`).
- **User Story 3 (Phase 5 - P1)**: Depends on US2 store implementation (`T007`) and Foundational schemas (`T003`).
- **User Story 4 (Phase 6 - P2)**: `src/obs/logger.ts` (`T012`, `T013`) depends only on Foundational (`T002`) and can be built in parallel with US2/US3; controller/server wiring (`T014`) integrates after US1–US3 controller updates (`T008`, `T011`).
- **Polish (Phase 7)**: Depends on all user stories being complete (`T001`–`T014`).

### User Story Dependencies

- **US1 (P1)**: Independent MVP once Phase 2 finishes.
- **US2 (P1)**: SQLite store (`T006`, `T007`) is independent of US1; controller hook (`T008`) follows `T005`.
- **US3 (P1)**: Depends on `IRequestTraceStore` / `SqliteRequestTraceStore` (`T007`).
- **US4 (P2)**: Standalone logger module (`T012`, `T013`) is independent; HTTP wiring (`T014`) completes after `T008` and `T011`.

### Parallel Opportunities

- **Phase 2**: `T002` (`src/models/request-trace.ts`) and `T003` (`src/http/schemas.ts`) target separate files and can run in parallel.
- **Cross-Story Module Work**: Once Phase 2 completes, `T006`/`T007` (`src/store/request-trace-store*`), `T012`/`T013` (`src/obs/logger*`), and `T004`/`T005` (`src/http/chat.*`) operate on disjoint files and can proceed in parallel.
- **Within Stories**: Test tasks marked `[P]` (`T004`, `T006`, `T009`, `T012`) can be authored in parallel with non-conflicting definitions.

---

## Parallel Example: Foundational & Core Modules

```bash
# Phase 2 — run in parallel:
Task: "Define RequestRecord, RequestWithTrace, SaveRequestTraceInput, and IRequestTraceStore domain interfaces in src/models/request-trace.ts"
Task: "Update ChatResponseSchema with requestId and add GetRequestParamsSchema, RequestTraceResponseSchema, and RequestNotFoundResponseSchema in src/http/schemas.ts"

# After Phase 2 — test authoring across US1, US2, and US4 in parallel:
Task: "Add integration tests in src/http/chat.test.ts verifying auto-generated requestId and echoed X-Request-Id header/body correlation on POST /chat"
Task: "Create unit tests for SqliteRequestTraceStore in src/store/request-trace-store.test.ts covering requests metrics persistence, trace_events payload serialization, and seq ordering"
Task: "Create unit tests in src/obs/logger.test.ts verifying single-line NDJSON output and strict exclusion of content, message, answer, and args values"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (`T001`).
2. Complete Phase 2: Foundational types and schemas (`T002`–`T003`).
3. Complete Phase 3: User Story 1 (`T004`–`T005`).
4. **STOP and VALIDATE**: Confirm `POST /chat` returns matching `requestId` in body and `X-Request-Id` header.

### Incremental Delivery

1. Setup + Foundational → Foundation ready (`T001`–`T003`).
2. Add US1 (`T004`–`T005`) → End-to-end `requestId` correlation (MVP).
3. Add US2 (`T006`–`T008`) → Durable SQLite persistence in `requests` and `trace_events`.
4. Add US3 (`T009`–`T011`) → `GET /requests/:id` retrieval with ordered trace and 404 handling.
5. Add US4 (`T012`–`T014`) → Metadata-only single-line JSON logs via `src/obs/logger.ts`.
6. Complete Phase 7 (`T015`–`T017`) → Final `npm run typecheck`, `npm test`, and quickstart validation.

---

## Notes

- `[P]` tasks operate on separate files with no unresolved dependencies.
- `[US#]` labels map each task directly to its User Story in `spec.md`.
- Every task follows test-first discipline with `:memory:` SQLite and injectable sinks so `npm test` remains deterministic and fast.
