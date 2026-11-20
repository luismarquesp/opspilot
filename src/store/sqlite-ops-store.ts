import { DatabaseSync, type StatementSync } from "node:sqlite";
import {
  type IOpsStore,
  type ServiceRecord,
  type AlertRecord,
  type IncidentRecord,
  type RunbookRecord,
  BASELINE_SERVICES,
  BASELINE_ALERTS,
  BASELINE_RUNBOOKS,
} from "../models/store.js";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Row shapes returned by DatabaseSync (all columns come back as primitives)
// ---------------------------------------------------------------------------

interface ServiceRow {
  id: string;
  name: string;
  environment: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface AlertRow {
  id: string;
  service_id: string;
  service_name: string;
  title: string;
  severity: string;
  status: string;
  description: string;
  triggered_at: string;
  resolved_at: string | null;
}

interface IncidentRow {
  id: string;
  title: string;
  service: string;
  severity: string;
  status: string;
  summary: string | null;
  opened_at: string;
  resolved_at: string | null;
}

interface RunbookRow {
  service_id: string;
  content: string;
}

interface MaxIdRow {
  max_num: number | null;
}

// ---------------------------------------------------------------------------
// Mappers: DB row → domain record
// ---------------------------------------------------------------------------

function toServiceRecord(row: ServiceRow): ServiceRecord {
  return {
    id: row.id,
    name: row.name,
    environment: row.environment,
    status: row.status as ServiceRecord["status"],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toAlertRecord(row: AlertRow): AlertRecord {
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    title: row.title,
    severity: row.severity as AlertRecord["severity"],
    status: row.status as AlertRecord["status"],
    description: row.description,
    triggeredAt: new Date(row.triggered_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
  };
}

function toIncidentRecord(row: IncidentRow): IncidentRecord {
  return {
    id: row.id,
    title: row.title,
    service: row.service,
    severity: row.severity as IncidentRecord["severity"],
    status: row.status as IncidentRecord["status"],
    summary: row.summary ?? null,
    openedAt: new Date(row.opened_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
  };
}

// ---------------------------------------------------------------------------
// SqliteOpsStore
// ---------------------------------------------------------------------------

export class SqliteOpsStore implements IOpsStore {
  readonly #db: DatabaseSync;

  // --- services ---
  readonly #stmtListServices: StatementSync;
  readonly #stmtGetService: StatementSync;
  readonly #stmtInsertService: StatementSync;

  // --- alerts ---
  readonly #stmtListAlertsFiring: StatementSync;
  readonly #stmtListAlertsResolved: StatementSync;
  readonly #stmtListAlertsAll: StatementSync;
  readonly #stmtGetAlert: StatementSync;
  readonly #stmtInsertAlert: StatementSync;

  // --- incidents ---
  readonly #stmtListIncidentsOpen: StatementSync;
  readonly #stmtListIncidentsResolved: StatementSync;
  readonly #stmtListIncidentsAll: StatementSync;
  readonly #stmtGetIncident: StatementSync;
  readonly #stmtInsertIncident: StatementSync;
  readonly #stmtResolveIncident: StatementSync;
  readonly #stmtMaxIncidentId: StatementSync;
  readonly #stmtDeleteIncidents: StatementSync;

  // --- runbooks ---
  readonly #stmtGetRunbook: StatementSync;
  readonly #stmtInsertRunbook: StatementSync;

  // --- reset helpers ---
  readonly #stmtDeleteServices: StatementSync;
  readonly #stmtDeleteAlerts: StatementSync;
  readonly #stmtDeleteRunbooks: StatementSync;

  constructor(dbPath: string = process.env.OPSPILOT_DB ?? path.resolve(process.cwd(), "data/opspilot.db")) {
    // Ensure the parent directory exists (for file-based databases)
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.#db = new DatabaseSync(dbPath);
    this.#db.exec("PRAGMA busy_timeout = 5000;");

    this.#runDDL();

    // --- Prepare all statements after DDL ---
    this.#stmtListServices = this.#db.prepare(`SELECT * FROM services ORDER BY name`);
    this.#stmtGetService = this.#db.prepare(`SELECT * FROM services WHERE id = ?`);
    this.#stmtInsertService = this.#db.prepare(
      `INSERT OR IGNORE INTO services (id, name, environment, status) VALUES (?, ?, ?, ?)`
    );

    this.#stmtListAlertsFiring = this.#db.prepare(
      `SELECT * FROM alerts WHERE status = 'firing' ORDER BY triggered_at DESC`
    );
    this.#stmtListAlertsResolved = this.#db.prepare(
      `SELECT * FROM alerts WHERE status = 'resolved' ORDER BY resolved_at DESC`
    );
    this.#stmtListAlertsAll = this.#db.prepare(`SELECT * FROM alerts ORDER BY triggered_at DESC`);
    this.#stmtGetAlert = this.#db.prepare(`SELECT * FROM alerts WHERE id = ?`);
    this.#stmtInsertAlert = this.#db.prepare(
      `INSERT OR IGNORE INTO alerts
         (id, service_id, service_name, title, severity, status, description, triggered_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    this.#stmtListIncidentsOpen = this.#db.prepare(
      `SELECT * FROM incidents WHERE status IN ('open','investigating') ORDER BY opened_at DESC`
    );
    this.#stmtListIncidentsResolved = this.#db.prepare(
      `SELECT * FROM incidents WHERE status = 'resolved' ORDER BY resolved_at DESC`
    );
    this.#stmtListIncidentsAll = this.#db.prepare(`SELECT * FROM incidents ORDER BY opened_at DESC`);
    this.#stmtGetIncident = this.#db.prepare(`SELECT * FROM incidents WHERE id = ?`);
    this.#stmtInsertIncident = this.#db.prepare(
      `INSERT INTO incidents (id, title, service, severity, status, summary, opened_at, resolved_at)
       VALUES (?, ?, ?, ?, 'open', NULL, ?, NULL)`
    );
    this.#stmtResolveIncident = this.#db.prepare(
      `UPDATE incidents SET status = 'resolved', resolved_at = ? WHERE id = ?`
    );
    this.#stmtMaxIncidentId = this.#db.prepare(
      `SELECT MAX(CAST(REPLACE(id, 'inc-', '') AS INTEGER)) AS max_num FROM incidents`
    );
    this.#stmtDeleteIncidents = this.#db.prepare(`DELETE FROM incidents`);

    this.#stmtGetRunbook = this.#db.prepare(`SELECT * FROM runbooks WHERE service_id = ?`);
    this.#stmtInsertRunbook = this.#db.prepare(
      `INSERT OR IGNORE INTO runbooks (service_id, content) VALUES (?, ?)`
    );

    this.#stmtDeleteServices = this.#db.prepare(`DELETE FROM services`);
    this.#stmtDeleteAlerts = this.#db.prepare(`DELETE FROM alerts`);
    this.#stmtDeleteRunbooks = this.#db.prepare(`DELETE FROM runbooks`);

    this.#seedData();
  }

  // -------------------------------------------------------------------------
  // DDL — idempotent
  // -------------------------------------------------------------------------

  #runDDL(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS services (
        id          TEXT NOT NULL PRIMARY KEY,
        name        TEXT NOT NULL,
        environment TEXT NOT NULL DEFAULT 'production',
        status      TEXT NOT NULL DEFAULT 'healthy'
                         CHECK(status IN ('healthy','degraded','down')),
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id           TEXT NOT NULL PRIMARY KEY,
        service_id   TEXT NOT NULL,
        service_name TEXT NOT NULL,
        title        TEXT NOT NULL,
        severity     TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
        status       TEXT NOT NULL CHECK(status IN ('firing','resolved')),
        description  TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        resolved_at  TEXT
      );

      CREATE TABLE IF NOT EXISTS incidents (
        id          TEXT NOT NULL PRIMARY KEY,
        title       TEXT NOT NULL,
        service     TEXT NOT NULL,
        severity    TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
        status      TEXT NOT NULL DEFAULT 'open'
                         CHECK(status IN ('open','investigating','resolved')),
        summary     TEXT,
        opened_at   TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS runbooks (
        service_id TEXT NOT NULL PRIMARY KEY,
        content    TEXT NOT NULL
      );
    `);
  }

  // -------------------------------------------------------------------------
  // Seed — idempotent (INSERT OR IGNORE)
  // -------------------------------------------------------------------------

  #seedData(): void {
    for (const s of BASELINE_SERVICES) {
      this.#stmtInsertService.run(s.id, s.name, s.environment, s.status);
    }
    for (const a of BASELINE_ALERTS) {
      this.#stmtInsertAlert.run(
        a.id,
        a.serviceId,
        a.serviceName,
        a.title,
        a.severity,
        a.status,
        a.description,
        a.triggeredAt.toISOString(),
        a.resolvedAt ? a.resolvedAt.toISOString() : null
      );
    }
    for (const r of BASELINE_RUNBOOKS) {
      this.#stmtInsertRunbook.run(r.serviceId, r.content);
    }
  }

  // -------------------------------------------------------------------------
  // Public API — seed / reset
  // -------------------------------------------------------------------------

  seed(): void {
    this.#seedData();
  }

  reset(): void {
    this.#stmtDeleteIncidents.run();
    this.#stmtDeleteAlerts.run();
    this.#stmtDeleteRunbooks.run();
    this.#stmtDeleteServices.run();
  }

  // -------------------------------------------------------------------------
  // Services
  // -------------------------------------------------------------------------

  listServices(): ServiceRecord[] {
    return (this.#stmtListServices.all() as unknown as ServiceRow[]).map(toServiceRecord);
  }

  getService(id: string): ServiceRecord | null {
    const row = this.#stmtGetService.get(id) as unknown as ServiceRow | undefined;
    return row ? toServiceRecord(row) : null;
  }

  // -------------------------------------------------------------------------
  // Alerts
  // -------------------------------------------------------------------------

  listAlerts(status: "firing" | "resolved" | "all" = "firing"): AlertRecord[] {
    if (status === "firing") return (this.#stmtListAlertsFiring.all() as unknown as AlertRow[]).map(toAlertRecord);
    if (status === "resolved") return (this.#stmtListAlertsResolved.all() as unknown as AlertRow[]).map(toAlertRecord);
    return (this.#stmtListAlertsAll.all() as unknown as AlertRow[]).map(toAlertRecord);
  }

  getAlert(id: string): AlertRecord | null {
    const row = this.#stmtGetAlert.get(id) as unknown as AlertRow | undefined;
    return row ? toAlertRecord(row) : null;
  }

  // -------------------------------------------------------------------------
  // Incidents
  // -------------------------------------------------------------------------

  openIncident(input: {
    title: string;
    service: string;
    severity: "info" | "warning" | "critical";
  }): IncidentRecord {
    const maxRow = this.#stmtMaxIncidentId.get() as unknown as MaxIdRow;
    const nextNum = (maxRow.max_num ?? 100) + 1;
    const id = `inc-${nextNum}`;
    const openedAt = new Date().toISOString();

    this.#stmtInsertIncident.run(id, input.title, input.service, input.severity, openedAt);

    const row = this.#stmtGetIncident.get(id) as unknown as IncidentRow;
    return toIncidentRecord(row);
  }

  resolveIncident(id: string): IncidentRecord | null {
    const existing = this.#stmtGetIncident.get(id) as unknown as IncidentRow | undefined;
    if (!existing) return null;

    const resolvedAt = new Date().toISOString();
    this.#stmtResolveIncident.run(resolvedAt, id);

    const updated = this.#stmtGetIncident.get(id) as unknown as IncidentRow;
    return toIncidentRecord(updated);
  }

  listIncidents(status: "open" | "resolved" | "all" = "open"): IncidentRecord[] {
    if (status === "open") return (this.#stmtListIncidentsOpen.all() as unknown as IncidentRow[]).map(toIncidentRecord);
    if (status === "resolved") return (this.#stmtListIncidentsResolved.all() as unknown as IncidentRow[]).map(toIncidentRecord);
    return (this.#stmtListIncidentsAll.all() as unknown as IncidentRow[]).map(toIncidentRecord);
  }

  // -------------------------------------------------------------------------
  // Runbooks
  // -------------------------------------------------------------------------

  getRunbook(serviceId: string): RunbookRecord | null {
    const row = this.#stmtGetRunbook.get(serviceId) as unknown as RunbookRow | undefined;
    if (!row) return null;
    return { serviceId: row.service_id, content: row.content };
  }
}
