# Implementation Plan: Requests Telemetry & Cost Aggregation (`GET /stats?since=24h`)

**Branch**: `017-requests-stats-endpoint` | **Date**: 2026-11-18 | **Spec**: [specs/017-requests-stats-endpoint/spec.md](file:///c:/Users/luism/OneDrive/Documentos/P%C3%B3s%20gradua%C3%A7%C3%A3o/Handsome/me/modulo04-agentes-autonomos/ops-pilot/specs/017-requests-stats-endpoint/spec.md)

## Summary

Implement `GET /stats?since=24h` over the SQLite `requests` table:
1. Pure telemetry aggregation and cost calculation module (`src/obs/stats.ts`): `parseSinceWindow`, `calculateModelCost` (`:free` = 0), `calculatePercentile` (`p50`/`p95`), and `computeRequestsStats` grouping by route and model.
2. Extend `IRequestTraceStore` (`src/models/request-trace.ts`) and `SqliteRequestTraceStore` (`src/store/request-trace-store.ts`) with `listRequests` and `getStats(since, nowMs)`.
3. Persist failed `/chat` executions (`504`/`503`/`500`) in `src/http/chat.controller.ts` with `status: "error"` so error counts reflect live failures.
4. Add Zod boundary schemas (`StatsQuerySchema`, `StatsBucketSchema`, `StatsResponseSchema`) in `src/http/schemas.ts`, implement `createStatsRouter` in `src/http/stats.controller.ts`, and mount `/stats` in `src/http/server.ts`.

## Constitution Check

- **I. Pure Functions & MVC Architecture**: Pure calculation functions in `src/obs/stats.ts`, persistence in `src/store/request-trace-store.ts`, HTTP dispatch in `src/http/stats.controller.ts`, domain error `InvalidStatsWindowError` translated at the boundary. **PASS**.
- **II. Strict Boundary Validation with Zod**: `StatsQuerySchema` and `StatsResponseSchema` validate inputs and outputs. **PASS**.
- **III. Test-First & Quality Gates**: Unit tests in `src/store/request-trace-store.test.ts` and HTTP integration tests in `src/http/stats.test.ts`; `npm run typecheck` and `npm test` verified green. **PASS**.
- **IV. Secret & Environment Safety**: No `.env` reads. **PASS**.
- **V. Agent-Centric Orchestration**: Aggregates real strategy routes (`react`, `plan-and-execute`, `reflection`) and `modelUsed` telemetry. **PASS**.
