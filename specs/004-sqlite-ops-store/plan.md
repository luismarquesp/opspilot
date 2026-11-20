# Implementation Plan: SQLite Real Persistence (OpsStore)

**Branch**: `004-sqlite-ops-store` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-sqlite-ops-store/spec.md`

---

## Summary

Replace the JSON-file-backed `InMemoryOpsStore` as the runtime persistence layer with a new `SqliteOpsStore` class that implements the existing `IOpsStore` interface using Node.js 22's built-in `node:sqlite` (`DatabaseSync`). The SQLite database path is controlled by `OPSPILOT_DB` (default `./data/opspilot.db`); tests use `":memory:"`. Two new agent tools are added (`list_incidents`, `consultar_runbook`) and all existing tool descriptions are revised to meet the 6-rule standard.

---

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22 LTS, ESM strict

**Primary Dependencies**: `node:sqlite` (built-in, zero npm dependency), `zod` (already present), `@langchain/core` (already present)

**Storage**: SQLite file via `DatabaseSync`; `":memory:"` in tests

**Testing**: `node:test` via `tsx` (`npm test`)

**Target Platform**: Linux/Windows server (single-process Node.js)

**Project Type**: Web service (Express) + autonomous agent

**Performance Goals**: Single on-call agent; no concurrent multi-process DB access required

**Constraints**: All SQL via prepared statements; no string-concatenated SQL; `npm run typecheck` and `npm test` always green

**Scale/Scope**: One SQLite file per deployment; tens of incidents/alerts — no bulk throughput requirement

---

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Pure Functions & MVC | ✅ PASS | `SqliteOpsStore` is a Model-layer class; tools are Controller boundary; no side effects leak into services |
| II. Strict Boundary Validation (Zod) | ✅ PASS | All new tool inputs validated with Zod schemas; store row-level data mapping in store layer only |
| III. Test-First & Quality Gates | ✅ PASS | New store tests with `:memory:`; existing tool tests migrated; both quality gates run |
| IV. Secret & Environment Safety | ✅ PASS | `OPSPILOT_DB` read from `process.env`; no secrets in DB path |
| V. Agent-Centric Orchestration | ✅ PASS | SQLite store injected into agent via `ops-store.ts`; tools updated; agent composition unchanged |
| Database: SQLite / node:sqlite | ✅ PASS | Matches updated constitution v1.1.0 |

No violations requiring justification.

---

## Project Structure

### Documentation (this feature)

```text
specs/004-sqlite-ops-store/
├── plan.md              ← this file
├── research.md          ← Phase 0 ✅
├── data-model.md        ← Phase 1 ✅
├── quickstart.md        ← Phase 1 ✅
├── contracts/
│   └── tools.md         ← Phase 1 ✅
├── checklists/
│   └── requirements.md  ← from /speckit-specify
└── tasks.md             ← Phase 2 output (/speckit-tasks)
```

### Source Code Changes

```text
src/
├── models/
│   └── store.ts              [MODIFY] Add status param to listIncidents; add getRunbook; add RunbookRecord
├── store/
│   └── sqlite-ops-store.ts   [NEW]    SqliteOpsStore implementing IOpsStore
├── agents/
│   ├── ops-store.ts          [MODIFY] Export SqliteOpsStore instance (OPSPILOT_DB)
│   └── tools.ts              [MODIFY] Revise descriptions; add list_incidents + consultar_runbook; update opsTools
├── config/
│   └── env.ts                [MODIFY] Replace DB_* MySQL fields with OPSPILOT_DB
└── (no changes to http/, index.ts, arena.ts, bench.ts)

.gitignore                    [MODIFY] Append data/
package.json                  [MODIFY] Remove mysql, mysql2, sequelize (no longer needed)
```

---

## Detailed Change Descriptions

### `src/models/store.ts` — Interface & Seed Data

- Add `RunbookRecord` interface `{ serviceId: string; content: string }`.
- Extend `IOpsStore`: `listIncidents(status?: "open" | "resolved" | "all")` and `getRunbook(serviceId: string)`.
- Keep `InMemoryOpsStore`; implement `listIncidents` with filter logic and stub `getRunbook` returning `null` (bench/test fallback).
- Keep `BASELINE_SERVICES` and `BASELINE_ALERTS` as-is.
- Add `BASELINE_RUNBOOKS: readonly RunbookRecord[]` (3 entries: order-processor, payment-api, auth-service).

### `src/store/sqlite-ops-store.ts` — New File

Full `SqliteOpsStore` class:
- Constructor: `new DatabaseSync(dbPath)`, run DDL, run idempotent seed.
- Private methods: `#runDDL()`, `#seedData()`.
- All prepared statements declared as `readonly` private fields.
- Implements all `IOpsStore` methods including `listIncidents(status?)` and `getRunbook(serviceId)`.
- Column mapping: snake_case (DB) ↔ camelCase (TypeScript).
- `seed()` uses `INSERT OR IGNORE` for idempotency.
- `reset()` deletes all rows from all tables.

### `src/agents/ops-store.ts` — Composition Root

Replace current content:
```ts
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import path from "node:path";
const dbPath = process.env.OPSPILOT_DB ?? path.resolve(process.cwd(), "data/opspilot.db");
export const store: IOpsStore = new SqliteOpsStore(dbPath);
```

### `src/agents/tools.ts` — Tool Revisions + New Tools

- Revise `listAlerts`, `openIncident`, `resolveIncident` descriptions to satisfy 6 rules.
- Add `listIncidents` tool (schema: `status: "open"|"resolved"|"all"`, default `"open"`).
- Add `consultarRunbook` tool (schema: `service: string`).
- Export `opsTools = [listAlerts, openIncident, resolveIncident, listIncidents, consultarRunbook]`.

### `src/config/env.ts` — Env Schema

- Remove `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_DIALECT` fields.
- Add `OPSPILOT_DB: z.string().default(path.resolve("data/opspilot.db"))`.

### `.gitignore` — Append `data/`

### `package.json` — Remove Sequelize deps

Remove from `dependencies`: `mysql`, `mysql2`, `sequelize`.

---

## Test Plan

| File | Test Suite | Coverage |
|------|------------|---------|
| `src/store/sqlite-ops-store.test.ts` [NEW] | SqliteOpsStore `:memory:` | DDL idempotency, seed idempotency, listAlerts filters, listServices, openIncident, resolveIncident, listIncidents (open/resolved/all), getRunbook found/not-found, CHECK constraint violation |
| `src/agents/tools.test.ts` [MODIFY] | Operational Tools | All 5 tools; inject `:memory:` store; existing assertions preserved |
| `src/models/store.test.ts` [MODIFY] | InMemoryOpsStore | Add listIncidents filter + getRunbook stub tests |

---

## Complexity Tracking

No constitution violations — section not applicable.
