# Data Model: SQLite Real Persistence (Feature 004)

## Entity Catalog

### 1. Service

Represents a production microservice monitored by OpsPilot.

| Column       | SQLite Type | Constraints                                              | Notes                          |
|--------------|-------------|----------------------------------------------------------|--------------------------------|
| `id`         | `TEXT`      | `PRIMARY KEY`                                            | Slug-style, e.g. `payment-api` |
| `name`       | `TEXT`      | `NOT NULL`                                               | Human-readable display name    |
| `environment`| `TEXT`      | `NOT NULL DEFAULT 'production'`                          | e.g. `production`, `staging`   |
| `status`     | `TEXT`      | `NOT NULL CHECK(status IN ('healthy','degraded','down'))` | Current health state           |
| `created_at` | `TEXT`      | `NOT NULL DEFAULT (datetime('now'))`                     | ISO-8601 UTC                   |
| `updated_at` | `TEXT`      | `NOT NULL DEFAULT (datetime('now'))`                     | ISO-8601 UTC                   |

**TypeScript mapping**:
```ts
export interface ServiceRecord {
  id: string;
  name: string;
  environment: string;
  status: "healthy" | "degraded" | "down";
  createdAt?: Date;
  updatedAt?: Date;
}
```

---

### 2. Alert

A monitoring signal emitted when a service metric crosses a threshold.

| Column         | SQLite Type | Constraints                                                  | Notes                                  |
|----------------|-------------|--------------------------------------------------------------|----------------------------------------|
| `id`           | `TEXT`      | `PRIMARY KEY`                                                | e.g. `alt-001`                         |
| `service_id`   | `TEXT`      | `NOT NULL`                                                   | Foreign key → services.id (logical)    |
| `service_name` | `TEXT`      | `NOT NULL`                                                   | Denormalized for query convenience     |
| `title`        | `TEXT`      | `NOT NULL`                                                   | Short alert title                      |
| `severity`     | `TEXT`      | `NOT NULL CHECK(severity IN ('info','warning','critical'))`  | Signal urgency level                   |
| `status`       | `TEXT`      | `NOT NULL CHECK(status IN ('firing','resolved'))`            | Current signal state                   |
| `description`  | `TEXT`      | `NOT NULL`                                                   | Full alert description                 |
| `triggered_at` | `TEXT`      | `NOT NULL`                                                   | ISO-8601 UTC when alert fired          |
| `resolved_at`  | `TEXT`      | nullable                                                     | ISO-8601 UTC when resolved; NULL if firing |

**TypeScript mapping**:
```ts
export interface AlertRecord {
  id: string;
  serviceId: string;
  serviceName: string;
  title: string;
  severity: "info" | "warning" | "critical";
  status: "firing" | "resolved";
  description: string;
  triggeredAt: Date;
  resolvedAt: Date | null;
}
```

---

### 3. Incident

An operator-declared operational event requiring investigation and resolution.

| Column       | SQLite Type | Constraints                                                             | Notes                           |
|--------------|-------------|-------------------------------------------------------------------------|---------------------------------|
| `id`         | `TEXT`      | `PRIMARY KEY`                                                           | e.g. `inc-101`                  |
| `title`      | `TEXT`      | `NOT NULL`                                                              | Concise incident summary        |
| `service`    | `TEXT`      | `NOT NULL`                                                              | Affected service slug           |
| `severity`   | `TEXT`      | `NOT NULL CHECK(severity IN ('info','warning','critical'))`             | Incident severity               |
| `status`     | `TEXT`      | `NOT NULL CHECK(status IN ('open','investigating','resolved'))` `DEFAULT 'open'` | Lifecycle state    |
| `summary`    | `TEXT`      | nullable                                                                | Post-incident summary (optional)|
| `opened_at`  | `TEXT`      | `NOT NULL`                                                              | ISO-8601 UTC; set on creation   |
| `resolved_at`| `TEXT`      | nullable                                                                | ISO-8601 UTC; set on resolution |

**TypeScript mapping**:
```ts
export interface IncidentRecord {
  id: string;
  title: string;
  service: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "investigating" | "resolved";
  summary: string | null;
  openedAt: Date;
  resolvedAt: Date | null;
}
```

**State transitions**:

```
open ──→ investigating ──→ resolved
  └────────────────────────────────→ resolved  (direct)
```

`resolveIncident(id)` transitions any non-resolved status → `resolved` and sets `resolved_at = NOW()`.

---

### 4. Runbook

Structured remediation steps for a specific service, authored ahead of time.

| Column      | SQLite Type | Constraints    | Notes                                   |
|-------------|-------------|----------------|-----------------------------------------|
| `service_id`| `TEXT`      | `PRIMARY KEY`  | Matches services.id (one runbook/service)|
| `content`   | `TEXT`      | `NOT NULL`     | Markdown-formatted remediation guide    |

**TypeScript mapping** (new, not in current codebase):
```ts
export interface RunbookRecord {
  serviceId: string;
  content: string;
}
```

---

## Interface Delta — `IOpsStore`

The current `IOpsStore` in `src/models/store.ts` requires the following changes:

```ts
// BEFORE
listIncidents(): Promise<IncidentRecord[]> | IncidentRecord[];

// AFTER
listIncidents(
  status?: "open" | "resolved" | "all"
): Promise<IncidentRecord[]> | IncidentRecord[];
```

New methods added to the interface:
```ts
getRunbook(serviceId: string): Promise<RunbookRecord | null> | RunbookRecord | null;
```

---

## Seed Data — "Mercadinho" Canonical Scenario

### Services (5, unchanged from BASELINE_SERVICES)
| id                | name                         | environment  | status   |
|-------------------|------------------------------|--------------|----------|
| `payment-api`     | Payment API                  | production   | degraded |
| `auth-service`    | Authentication Service       | production   | healthy  |
| `order-processor` | Order Processing Worker      | production   | degraded |
| `database-cluster`| Primary MySQL Cluster        | production   | degraded |
| `notification-hub`| Notification Dispatcher      | production   | healthy  |

### Alerts (6: 3 firing + 3 resolved, unchanged from BASELINE_ALERTS)
| id      | service_id          | severity | status   |
|---------|---------------------|----------|----------|
| alt-001 | payment-api         | critical | firing   |
| alt-002 | database-cluster    | critical | firing   |
| alt-003 | order-processor     | warning  | firing   |
| alt-004 | auth-service        | warning  | resolved |
| alt-005 | notification-hub    | info     | resolved |
| alt-006 | payment-api         | info     | resolved |

### Runbooks (3 — new)
| service_id        | content summary                                                    |
|-------------------|--------------------------------------------------------------------|
| `order-processor` | Checkout queue backlog runbook (consumer lag, scale-up steps)      |
| `payment-api`     | Payment API degradation runbook (5xx errors, circuit breaker, etc) |
| `auth-service`    | Auth service runbook (cache restart, token validation recovery)     |

---

## Column Naming Convention

SQLite columns use **snake_case** (`service_id`, `triggered_at`). The TypeScript layer maps to **camelCase** (`serviceId`, `triggeredAt`) in a thin adapter inside `SqliteOpsStore`.
