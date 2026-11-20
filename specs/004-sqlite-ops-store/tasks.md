# Tasks: SQLite Real Persistence (OpsStore) — Feature 004

**Branch**: `004-sqlite-ops-store` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**User Stories**:
- US1 (P1): Persistent Incident State Across Restarts
- US2 (P2): Pre-loaded Scenario for Demos and Bench
- US3 (P2): Filtered Incident Listing for the Agent
- US4 (P3): Runbook Retrieval for Automated Remediation

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Housekeeping and environment plumbing required before any feature code.

- [x] T001 Add `data/` to `.gitignore` (root `.gitignore`, append one line)
- [x] T002 Add `OPSPILOT_DB` to `src/config/env.ts` — replace `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_DIALECT` fields with `OPSPILOT_DB: z.string().default(path.resolve(process.cwd(), "data/opspilot.db"))` (keep other fields that are actually used)
- [x] T003 Remove `mysql`, `mysql2`, `sequelize` from `dependencies` in `package.json` (run `npm uninstall mysql mysql2 sequelize` afterwards)
- [x] T004 Create directory `src/store/` (empty — will hold `sqlite-ops-store.ts`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the `IOpsStore` interface and seed constants so all user-story phases can build on a stable contract.

> ⚠️ **CRITICAL**: All US phases depend on these changes. Complete before any US work.

- [x] T005 Add `RunbookRecord` interface and `BASELINE_RUNBOOKS` constant to `src/models/store.ts`
  - `RunbookRecord { serviceId: string; content: string }`
  - 3 runbooks: `order-processor` (checkout), `payment-api` (payments), `auth-service` (auth) — full markdown remediation content
- [x] T006 Extend `IOpsStore` in `src/models/store.ts`
  - `listIncidents(status?: "open" | "resolved" | "all"): Promise<IncidentRecord[]> | IncidentRecord[]`
  - `getRunbook(serviceId: string): Promise<RunbookRecord | null> | RunbookRecord | null`
- [x] T007 Implement `listIncidents` and `getRunbook` on `InMemoryOpsStore` in `src/models/store.ts`
  - `listIncidents("open")` → filter `status === "open" || status === "investigating"`
  - `listIncidents("resolved")` → filter `status === "resolved"`
  - `listIncidents("all")` or undefined → all incidents
  - `getRunbook(serviceId)` → search `BASELINE_RUNBOOKS` array; return `null` if not found
- [x] T008 Run `npm run typecheck` — must pass with zero errors before proceeding

**Checkpoint**: Interface contract is locked; `InMemoryOpsStore` passes `npm test`. ✅

---

## Phase 3: User Story 1 — Persistent Incident State (P1) 🏆 MVP

**Goal**: Incidents opened via the agent survive process restarts; data lives in SQLite file.

**Independent Test**: Open incident → restart process → list incidents → incident appears.

### Implementation

- [x] T009 [US1] Create `src/store/sqlite-ops-store.ts` — class skeleton
- [x] T010 [US1] Implement `#runDDL()` in `src/store/sqlite-ops-store.ts`
- [x] T011 [US1] Implement `#seedData()` in `src/store/sqlite-ops-store.ts`
- [x] T012 [US1] Implement prepared statements + `listAlerts`, `getAlert` in `src/store/sqlite-ops-store.ts`
- [x] T013 [US1] Implement `listServices`, `getService` in `src/store/sqlite-ops-store.ts`
- [x] T014 [US1] Implement `openIncident` in `src/store/sqlite-ops-store.ts`
- [x] T015 [US1] Implement `resolveIncident` in `src/store/sqlite-ops-store.ts`
- [x] T016 [US1] Implement `listIncidents` in `src/store/sqlite-ops-store.ts`
- [x] T017 [US1] Implement `seed()` (public) and `reset()` in `src/store/sqlite-ops-store.ts`
- [x] T018 [US1] Update `src/agents/ops-store.ts` — inject `SqliteOpsStore` as default
- [x] T019 [US1] Write `src/store/sqlite-ops-store.test.ts` — core store tests
- [x] T020 [US1] Run `npm run typecheck` and `npm test` — both must pass

**Checkpoint**: `SqliteOpsStore` is fully functional; `npm test` green; persistent storage works end-to-end. ✅

---

## Phase 4: User Story 2 — Pre-loaded Seed Scenario (P2)

**Goal**: Idempotent seed with full "Mercadinho" dataset available in every test run and bench run.

**Independent Test**: Create fresh `:memory:` store → assert exactly 5 services, 6 alerts, 3 runbooks → create store again → same counts (idempotency).

### Implementation

- [x] T021 [US2] Extend `src/store/sqlite-ops-store.test.ts` — seed idempotency tests
- [x] T022 [P] [US2] Verify `InMemoryOpsStore.seed()` also uses `BASELINE_RUNBOOKS` (update `src/models/store.test.ts`)
- [x] T023 [US2] Run `npm test` — all suites must pass

**Checkpoint**: Seed scenario is reproducible; bench (`npm run bench`) starts with full dataset every run. ✅

---

## Phase 5: User Story 3 — Filtered Incident Listing (P2)

**Goal**: Agent can list open-only, resolved-only, or all incidents via `list_incidents` tool.

**Independent Test**: Open 2 incidents, resolve 1 → `list_incidents({status:"open"})` returns 1; `list_incidents({status:"resolved"})` returns 1; `list_incidents({status:"all"})` returns 2.

### Implementation

- [x] T024 [US3] Extend `src/store/sqlite-ops-store.test.ts` — `listIncidents` filter tests
- [x] T025 [US3] Add `list_incidents` tool to `src/agents/tools.ts`
- [x] T026 [US3] Revise existing tool descriptions in `src/agents/tools.ts` to satisfy 6 rules
- [x] T027 [US3] Update `opsTools` array in `src/agents/tools.ts` to include `listIncidents`
- [x] T028 [US3] Update `src/agents/tools.test.ts` — add `list_incidents` tool tests
- [x] T029 [US3] Run `npm run typecheck` and `npm test` — both must pass

**Checkpoint**: `list_incidents` tool is functional; agent can filter incidents by status. ✅

---

## Phase 6: User Story 4 — Runbook Retrieval (P3)

**Goal**: Agent can retrieve a service's runbook during an incident via `consultar_runbook` tool.

**Independent Test**: Call `consultar_runbook({service:"payment-api"})` → runbook markdown returned; call with `"unknown-svc"` → structured error, no exception.

### Implementation

- [x] T030 [US4] Implement `getRunbook` in `src/store/sqlite-ops-store.ts`
- [x] T031 [US4] Extend `src/store/sqlite-ops-store.test.ts` — runbook tests
- [x] T032 [US4] Add `consultar_runbook` tool to `src/agents/tools.ts`
- [x] T033 [US4] Update `opsTools` array in `src/agents/tools.ts` to include `consultarRunbook`
- [x] T034 [US4] Extend `src/agents/tools.test.ts` — `consultar_runbook` tool tests
- [x] T035 [US4] Run `npm run typecheck` and `npm test` — both must pass

**Checkpoint**: All 4 user stories are complete and independently testable. ✅

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and documentation alignment.

- [x] T036 [P] Update `src/models/store.test.ts` — ensure `InMemoryOpsStore` tests cover new `listIncidents` and `getRunbook` methods (update existing suite, do not remove existing tests)
- [x] T037 [P] Update `.env.example` — remove DB_* MySQL vars, add `# OPSPILOT_DB=./data/opspilot.db`
- [x] T038 Run complete `npm test` and `npm run typecheck` — both must be green with zero warnings
- [x] T039 Validate `quickstart.md` steps manually: start `npm run dev`, open incident via curl, restart, confirm persistence
- [x] T040 Verify `data/` does not appear in `git status` untracked files (gitignore works)

---

## Dependencies & Execution Order

*(unchanged — see original for reference)*

---

## Notes

- `[P]` tasks = different files or independent concerns, safe to parallelize
- `[USN]` label maps each task to its user story for traceability
- All store tests use `new SqliteOpsStore(":memory:")` — never touch the filesystem
- `InMemoryOpsStore` is kept intact for `bench.ts`/arena reproducibility
- Legacy Sequelize model files were deleted (blocked typecheck after mysql/mysql2/sequelize uninstall)
- `src/index.ts` cleaned up to remove deleted imports
