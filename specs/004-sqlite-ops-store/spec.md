# Feature Specification: SQLite Real Persistence (OpsStore)

**Feature Branch**: `004-sqlite-ops-store`

**Created**: 2026-09-16

**Status**: Draft

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Persistent Incident State Across Restarts (Priority: P1)

As an on-call engineer using OpsPilot, I want incidents I open to survive a server restart so that I never lose operational context when the process is recycled.

**Why this priority**: Without durable storage every process restart wipes all open incidents, making the system unreliable in real on-call scenarios. This is the fundamental gap the feature closes.

**Independent Test**: Start OpsPilot, open an incident via the agent, stop and restart the process, then list incidents — the previously opened incident MUST appear.

**Acceptance Scenarios**:

1. **Given** a fresh database, **When** the agent opens an incident for service "checkout", **Then** the incident is persisted to the SQLite file and returned with a unique ID, title, service, severity, status "open", and openedAt timestamp.
2. **Given** a running instance with an open incident, **When** the process restarts and `list_incidents` is called, **Then** the incident appears with all original fields intact.
3. **Given** an open incident, **When** `resolve_incident` is called with its ID, **Then** the incident status changes to "resolved" and `resolved_at` is recorded; subsequent listing with `status=open` no longer shows it.

---

### User Story 2 – Pre-loaded Scenario for Demos and Bench (Priority: P2)

As a developer running evaluations or demoing OpsPilot, I want a realistic baseline dataset (the "Mercadinho" scenario) to be automatically present so that I can immediately ask the agent meaningful operational questions without manual setup.

**Why this priority**: Tests and the bench/arena require a reproducible, deterministic starting point. Idempotent seeding ensures re-runs never accumulate duplicate data.

**Independent Test**: Call `npm run bench` or `npm test` against a fresh `:memory:` database — the seed data (5 services, 6 alerts, 3 runbooks) MUST be present at the start of every test run without any manual intervention.

**Acceptance Scenarios**:

1. **Given** a brand-new database, **When** the store is initialized, **Then** 5 services, 6 alerts (3 firing, 3 resolved), and 3 runbooks (checkout, payments, auth) are present.
2. **Given** an already-seeded database, **When** the store initializes again (idempotent seed), **Then** no duplicate rows are created (same IDs, `INSERT OR IGNORE` semantics).
3. **Given** a `:memory:` database used in tests, **When** a test calls `reset()` followed by `seed()`, **Then** the dataset returns to the canonical baseline state.

---

### User Story 3 – Filtered Incident Listing for the Agent (Priority: P2)

As the OpsPilot agent deciding whether to open a new incident, I want to list only open incidents (or only resolved ones) so that I can quickly understand the current operational state without wading through historical data.

**Why this priority**: Without filtering, the agent would receive the full incident history on every call, inflating context and reducing decision quality. Filtered listing is a prerequisite for reliable triage reasoning.

**Independent Test**: Open 2 incidents and resolve 1; call `list_incidents` with `status=open` — only the unresolved incident is returned; call with `status=resolved` — only the resolved one is returned; call with `status=all` — both are returned.

**Acceptance Scenarios**:

1. **Given** a mix of open and resolved incidents, **When** `list_incidents(status="open")` is called (the default), **Then** only incidents with status "open" or "investigating" are returned.
2. **Given** at least one resolved incident, **When** `list_incidents(status="resolved")` is called, **Then** only resolved incidents with a non-null `resolved_at` are returned.
3. **Given** incidents of all statuses, **When** `list_incidents(status="all")` is called, **Then** every incident is returned regardless of status.

---

### User Story 4 – Runbook Retrieval for Automated Remediation (Priority: P3)

As the OpsPilot agent during an incident, I want to look up a service's runbook to get structured remediation guidance, reducing mean time to recovery.

**Why this priority**: The runbook tool is new surface area; it enables the agent to self-serve remediation steps instead of relying solely on LLM generation, improving reliability of automated responses.

**Independent Test**: Call `consultar_runbook("checkout")` — the full runbook markdown for the checkout service is returned; call with an unknown service — a clear "not found" response is returned.

**Acceptance Scenarios**:

1. **Given** a seeded database, **When** `consultar_runbook("checkout")` is called, **Then** the runbook content for the checkout service is returned.
2. **Given** a seeded database, **When** `consultar_runbook("payments")` is called, **Then** the runbook content for the payments service is returned.
3. **Given** an unknown service name, **When** `consultar_runbook("unknown-svc")` is called, **Then** a structured "not found" response is returned (no exception thrown).

---

### Edge Cases

- What happens when `OPSPILOT_DB` points to a directory that doesn't exist yet? → The store MUST create parent directories automatically on first write.
- What happens when two concurrent writes hit the same SQLite file? → `DatabaseSync` is synchronous and single-process; concurrent in-process access is serialized naturally. The spec does not cover multi-process concurrent access.
- What happens when an invalid `status` value is passed to `list_incidents`? → Zod validation at the tool boundary rejects it before reaching the store.
- What happens when `resolve_incident` is called with an ID that doesn't exist? → The store returns `null`; the tool converts this to a structured error JSON without throwing.
- What happens when a CHECK constraint is violated (e.g., invalid severity stored directly)? → SQLite raises an error that propagates as a domain error at the boundary layer.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a `SqliteOpsStore` class that implements the existing `IOpsStore` interface, backed by a SQLite file specified via the `OPSPILOT_DB` environment variable (default `./data/opspilot.db`) or `":memory:"` for tests.
- **FR-002**: The store MUST create its database file and all four tables (`services`, `alerts`, `incidents`, `runbooks`) using idempotent DDL (`CREATE TABLE IF NOT EXISTS`) on construction, without requiring any external migration tool.
- **FR-003**: Every table with enumerated domain fields MUST enforce valid values via SQLite `CHECK` constraints (e.g., `severity IN ('info','warning','critical')`, `status IN ('open','investigating','resolved')`).
- **FR-004**: The store MUST execute an idempotent seed (`INSERT OR IGNORE`) on initialization, loading the canonical "Mercadinho" scenario: 5 services, 6 alerts (3 firing, 3 resolved), and 3 runbooks (checkout, payments, auth).
- **FR-005**: All store queries MUST use prepared statements; dynamic SQL string concatenation is prohibited.
- **FR-006**: The `IOpsStore` interface MUST be extended or a new method added so callers can call `listIncidents(status?: "open" | "resolved" | "all")` — defaulting to `"open"` — and the underlying query MUST use parameterized filters.
- **FR-007**: A new agent tool `list_incidents` MUST be implemented and exposed, accepting a `status` parameter with values `open | resolved | all` (default `open`), with a description following the 6 tool-description rules.
- **FR-008**: A new agent tool `consultar_runbook` MUST be implemented and exposed, accepting a `service` identifier, returning the runbook content or a structured "not found" response, with a description following the 6 tool-description rules.
- **FR-009**: The composition root MUST inject `SqliteOpsStore` as the default store for `npm run dev` and `npm run arena`; `InMemoryOpsStore` remains available for the bench and for tests (injected via `:memory:` SQLite or in-memory map, depending on test needs).
- **FR-010**: Existing tool descriptions in `src/agents/tools.ts` MUST be revised to satisfy the 6 tool-description rules: explain *when* to use the tool, use `describe()` on every schema field, and enumerate all accepted enum values explicitly.
- **FR-011**: The `data/` directory MUST be added to `.gitignore` so the SQLite database file is never committed.
- **FR-012**: All new and updated store behaviors MUST be covered by tests using a `:memory:` SQLite database, including: seed idempotency, `openIncident`, `listIncidents` with each filter value, `resolveIncident`, and CHECK constraint rejection.

### Key Entities

- **Service**: A production service identified by ID; attributes include name, environment (`production` | `staging`), and health status (`healthy` | `degraded` | `down`).
- **Alert**: A monitoring signal tied to a service; attributes include title, severity (`info` | `warning` | `critical`), operational status (`firing` | `resolved`), trigger timestamp, and optional resolution timestamp.
- **Incident**: An operator-declared operational event; attributes include title, associated service, severity, lifecycle status (`open` | `investigating` | `resolved`), optional summary, open timestamp, and optional resolution timestamp.
- **Runbook**: Structured remediation guidance for a service; attributes include service identifier and markdown content.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An incident opened by the agent persists and is retrievable after a process restart — verifiable by integration test or manual restart sequence.
- **SC-002**: Running `npm test` with a `:memory:` database produces zero failures, including all new store tests and all existing tool tests that are migrated to the SQLite store.
- **SC-003**: Running `npm run typecheck` produces zero TypeScript errors after all changes.
- **SC-004**: The seed operation is idempotent: running it twice on the same database never produces more rows than the canonical baseline count (5 services, 6 alerts, 3 runbooks).
- **SC-005**: The agent can answer "what incidents are open?" within one tool call, returning only the open subset of incidents, without manual filtering in the agent prompt.
- **SC-006**: The agent can retrieve a runbook for any seeded service in a single tool call, enabling self-served remediation guidance during an incident.

---

## Assumptions

- Node.js 22 LTS is the runtime; `node:sqlite` (`DatabaseSync`) is available as a built-in module — no npm package installation required.
- The `data/` directory will be created by the store at runtime if it does not exist; no manual directory creation is expected from operators.
- The "Mercadinho" scenario (service names, alert descriptions, runbook content) is the canonical demo dataset and will be embedded as constants alongside the store, mirroring the existing `BASELINE_SERVICES` and `BASELINE_ALERTS` pattern.
- The `InMemoryOpsStore` is retained for the bench harness so that bench scenarios remain reproducible without touching the file system.
- Multi-process concurrent access to the SQLite file is out of scope; OpsPilot runs as a single Node.js process.
- The 6 tool-description rules referenced in FR-007, FR-008, and FR-010 are: (1) state the purpose, (2) explain *when* to invoke, (3) enumerate all valid enum values, (4) describe every schema field with `.describe()`, (5) use imperative mood, (6) keep descriptions under ~120 characters per field.
