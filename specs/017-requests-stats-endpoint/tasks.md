---

description: "Actionable task list for GET /stats?since=24h"
---

# Tasks: Requests Telemetry & Cost Aggregation (`GET /stats?since=24h`)

**Input**: Design documents from `specs/017-requests-stats-endpoint/`

## Phase 1: Foundational & Pure Aggregation Helpers

- [X] T001 Define `StatsBucket`, `RequestsStatsResult`, `listRequests`, and `getStats` in `src/models/request-trace.ts`
- [X] T002 Implement `InvalidStatsWindowError`, `parseSinceWindow`, `calculateModelCost`, `calculatePercentile`, and `computeRequestsStats` pure helpers in `src/obs/stats.ts`

## Phase 2: Store & Error Telemetry Persistence

- [X] T003 Add `listRequests`, `getStats`, and `requests.stats` implementation to `SqliteRequestTraceStore` in `src/store/request-trace-store.ts`
- [X] T004 Persist `status: "error"` records in `POST /chat` error handling in `src/http/chat.controller.ts`

## Phase 3: HTTP Endpoint & Boundary Validation

- [X] T005 Add `StatsQuerySchema`, `StatsBucketSchema`, and `StatsResponseSchema` in `src/http/schemas.ts`
- [X] T006 Implement `createStatsRouter` for `GET /stats` in `src/http/stats.controller.ts` and mount `/stats` in `src/http/server.ts`

## Phase 4: Tests & Quality Gates

- [X] T007 Add unit tests for `:free=0` cost calculation, `p50`/`p95` percentiles, window filtering, and route/model grouping in `src/store/request-trace-store.test.ts`
- [X] T008 Add HTTP integration tests for `GET /stats` (`since=24h`, `since=1h`, empty store, errors, `:free=0`, `400 validation_error`) in `src/http/stats.test.ts`
- [X] T009 Run `npm run typecheck` and `npm test` to verify zero errors and all tests green
