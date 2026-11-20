# Research: SQLite Real Persistence (Feature 004)

## 1. `node:sqlite` — DatabaseSync API

**Decision**: Use `node:sqlite` `DatabaseSync` (synchronous, built-in, Node.js 22.5+).

**Rationale**: Zero external dependency; synchronous API keeps the store implementation simple and side-effect-free in the sense that it does not require async/await chains. All reads and writes complete before returning, which is safe for a single-process on-call agent.

**Key API surface**:

```ts
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");          // or a file path
db.exec(`CREATE TABLE IF NOT EXISTS ...`);        // DDL
const stmt = db.prepare(`SELECT * FROM t WHERE id = ?`);
const row  = stmt.get(id);                        // single row or undefined
const rows = stmt.all();                          // all rows
stmt.run(val1, val2);                             // INSERT / UPDATE / DELETE
db.close();                                       // optional cleanup
```

**Date handling**: SQLite stores dates as ISO-8601 text strings. The store layer MUST convert:
- JS `Date` → `toISOString()` string on write
- string → `new Date(str)` on read (for `triggeredAt`, `resolvedAt`, `openedAt`)
- `NULL` → `null` for nullable timestamps

**Alternatives considered**:
- `better-sqlite3` (npm): more mature, but adds an external dependency — rejected in favour of built-in.
- `node:sqlite` async API: not yet stable in Node 22; synchronous is the GA surface.

---

## 2. Prepared Statement Pattern

**Decision**: Prepare all statements once in the constructor; store as private readonly fields.

**Rationale**: Avoids re-compilation on every call; eliminates any risk of SQL concatenation.

**Pattern**:

```ts
class SqliteOpsStore {
  readonly #db: DatabaseSync;
  readonly #stmtGetAlert: StatementSync;

  constructor(dbPath: string) {
    this.#db = new DatabaseSync(dbPath);
    this.#runDDL();
    this.#stmtGetAlert = this.#db.prepare(
      `SELECT * FROM alerts WHERE id = ?`
    );
  }

  getAlert(id: string): AlertRecord | null {
    return (this.#stmtGetAlert.get(id) as AlertRecord | undefined) ?? null;
  }
}
```

---

## 3. Interface Extension for `listIncidents`

**Decision**: Add optional `status` parameter to `listIncidents` in `IOpsStore`.

```ts
listIncidents(status?: "open" | "resolved" | "all"): AlertRecord[];
```

Default: `"open"` — filters to `status IN ('open','investigating')`.

**`"open"` semantics**: Returns incidents where `status = 'open' OR status = 'investigating'` (both active states). This matches the operator's mental model of "what is currently active".

**SQL**:
```sql
-- status = "open" (default)
SELECT * FROM incidents WHERE status IN ('open', 'investigating') ORDER BY opened_at DESC

-- status = "resolved"
SELECT * FROM incidents WHERE status = 'resolved' ORDER BY resolved_at DESC

-- status = "all"
SELECT * FROM incidents ORDER BY opened_at DESC
```

---

## 4. Tool Description "6 Rules" (from spec assumptions)

1. **State the purpose** — one sentence on what the tool does.
2. **Explain when to invoke** — under what operational conditions/triggers.
3. **Enumerate all valid enum values** — list them explicitly in the description string.
4. **`.describe()` on every schema field** — every `z.string()`, `z.enum()`, etc.
5. **Imperative mood** — "Use when...", "Call to...", "Invoke when..."
6. **≤120 chars per field description** — keep concise and scanner-friendly.

---

## 5. Composition Root Strategy

**Decision**: Create a factory function in `src/agents/ops-store.ts` that reads `OPSPILOT_DB` from env and returns a `SqliteOpsStore` for runtime, or allows injection of any `IOpsStore` for tests.

```ts
// src/agents/ops-store.ts
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import path from "node:path";

const dbPath = process.env.OPSPILOT_DB
  ?? path.resolve(process.cwd(), "data/opspilot.db");

export const store: IOpsStore = new SqliteOpsStore(dbPath);
```

Tests import `SqliteOpsStore` directly with `":memory:"` — they do **not** import from `ops-store.ts`.

**Bench/Arena**: Bench uses `InMemoryOpsStore` (no file I/O) so scenarios are reproducible across runs without touching the filesystem.

---

## 6. Sequelize / Legacy Models

**Decision**: Leave existing `src/models/db.ts`, `alert.model.ts`, `service.model.ts`, `incident.model.ts` in place. They are not imported by the new SQLite path.

**Rationale**: Safe non-destructive change. Sequelize packages can be removed from `package.json` in a follow-up cleanup feature if desired. Doing it now would increase diff scope and risk without adding value to the feature.

---

## 7. `data/` in `.gitignore`

**Decision**: Append `data/` to `.gitignore`.

**Current `.gitignore`**: Does not include `data/`. The `data/opspilot.db` file MUST NOT be committed.

---

## 8. Seed Data — "Mercadinho" Scenario

The existing `BASELINE_SERVICES` (5 services) and `BASELINE_ALERTS` (6 alerts, 3+3) already match the spec. The new additions are:

**Runbooks** (3):
- `checkout` — steps for checkout service degradation
- `payments` — steps for payment API incidents
- `auth` — steps for authentication service issues

Service names in the seed are adapted to the existing IDs:
- `checkout` → maps to `order-processor` service (checkout flow)
- `payments` → maps to `payment-api`
- `auth` → maps to `auth-service`

Runbooks are stored in the `runbooks` table as `(service_id TEXT PRIMARY KEY, content TEXT NOT NULL)`.
