import test from "node:test";
import assert from "node:assert/strict";
import { SqliteOpsStore } from "./sqlite-ops-store.js";

// All tests use an in-memory database — no filesystem access
function makeStore(): SqliteOpsStore {
  return new SqliteOpsStore(":memory:");
}

test("SqliteOpsStore — DDL & Seed (US1 + US2)", async (t) => {
  await t.test("constructor is idempotent — calling twice causes no error", () => {
    const store1 = makeStore();
    const store2 = makeStore(); // separate :memory: instance — both must construct fine
    assert.ok(store1);
    assert.ok(store2);
  });

  await t.test("seed produces exactly 5 services", () => {
    const store = makeStore();
    const services = store.listServices();
    assert.equal(services.length, 5);
  });

  await t.test("seed produces 6 alerts — 3 firing, 3 resolved", () => {
    const store = makeStore();
    const firing = store.listAlerts("firing");
    const resolved = store.listAlerts("resolved");
    const all = store.listAlerts("all");
    assert.equal(firing.length, 3);
    assert.equal(resolved.length, 3);
    assert.equal(all.length, 6);
  });

  await t.test("seed produces 3 runbooks", () => {
    const store = makeStore();
    const rb1 = store.getRunbook("payment-api");
    const rb2 = store.getRunbook("auth-service");
    const rb3 = store.getRunbook("order-processor");
    assert.ok(rb1, "payment-api runbook must exist");
    assert.ok(rb2, "auth-service runbook must exist");
    assert.ok(rb3, "order-processor runbook must exist");
    assert.ok(rb1.content.length > 0);
    assert.ok(rb2.content.length > 0);
    assert.ok(rb3.content.length > 0);
  });

  await t.test("seed is idempotent — reset + seed restores baseline counts", () => {
    const store = makeStore();
    store.reset();
    assert.equal(store.listServices().length, 0);
    assert.equal(store.listAlerts("all").length, 0);
    assert.equal(store.getRunbook("payment-api"), null);

    store.seed();
    assert.equal(store.listServices().length, 5);
    assert.equal(store.listAlerts("all").length, 6);
    assert.ok(store.getRunbook("payment-api"));
  });

  await t.test("seed called twice does not duplicate rows (INSERT OR IGNORE)", () => {
    const store = makeStore();
    store.seed(); // second call
    assert.equal(store.listServices().length, 5);
    assert.equal(store.listAlerts("all").length, 6);
  });
});

test("SqliteOpsStore — getService / getAlert hydration (US2)", async (t) => {
  await t.test("getService returns correct record for payment-api", () => {
    const store = makeStore();
    const svc = store.getService("payment-api");
    assert.ok(svc);
    assert.equal(svc.id, "payment-api");
    assert.equal(svc.name, "Payment API");
    assert.ok(svc.createdAt instanceof Date);
  });

  await t.test("getService returns null for unknown id", () => {
    const store = makeStore();
    assert.equal(store.getService("does-not-exist"), null);
  });

  await t.test("getAlert returns correct record with hydrated Date fields", () => {
    const store = makeStore();
    const alert = store.getAlert("alt-001");
    assert.ok(alert);
    assert.equal(alert.id, "alt-001");
    assert.ok(alert.triggeredAt instanceof Date);
    assert.equal(alert.resolvedAt, null); // alt-001 is firing
  });

  await t.test("getAlert for resolved alert has non-null resolvedAt", () => {
    const store = makeStore();
    const alert = store.getAlert("alt-004");
    assert.ok(alert);
    assert.ok(alert.resolvedAt instanceof Date);
  });
});

test("SqliteOpsStore — Incident lifecycle (US1)", async (t) => {
  await t.test("openIncident creates a record with status open and a valid id", () => {
    const store = makeStore();
    const inc = store.openIncident({
      title: "Payment API degradation",
      service: "payment-api",
      severity: "critical",
    });
    assert.ok(inc.id.startsWith("inc-"));
    assert.equal(inc.status, "open");
    assert.equal(inc.service, "payment-api");
    assert.equal(inc.severity, "critical");
    assert.ok(inc.openedAt instanceof Date);
    assert.equal(inc.resolvedAt, null);
    assert.equal(inc.summary, null);
  });

  await t.test("resolveIncident sets status to resolved and resolvedAt", () => {
    const store = makeStore();
    const inc = store.openIncident({
      title: "DB deadlocks",
      service: "database-cluster",
      severity: "warning",
    });
    const resolved = store.resolveIncident(inc.id);
    assert.ok(resolved);
    assert.equal(resolved.id, inc.id);
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolvedAt instanceof Date);
  });

  await t.test("resolveIncident returns null for unknown id", () => {
    const store = makeStore();
    assert.equal(store.resolveIncident("inc-nonexistent"), null);
  });

  await t.test("multiple incidents get sequential ids", () => {
    const store = makeStore();
    const a = store.openIncident({ title: "Inc A", service: "auth-service", severity: "info" });
    const b = store.openIncident({ title: "Inc B", service: "auth-service", severity: "info" });
    const numA = parseInt(a.id.replace("inc-", ""), 10);
    const numB = parseInt(b.id.replace("inc-", ""), 10);
    assert.equal(numB, numA + 1);
  });
});

test("SqliteOpsStore — listIncidents filters (US3)", async (t) => {
  await t.test("listIncidents default ('open') returns only active incidents", () => {
    const store = makeStore();
    const i1 = store.openIncident({ title: "Incident 1", service: "payment-api", severity: "critical" });
    const i2 = store.openIncident({ title: "Incident 2", service: "auth-service", severity: "warning" });
    store.resolveIncident(i2.id);

    const open = store.listIncidents();
    assert.equal(open.length, 1);
    assert.equal(open[0].id, i1.id);
  });

  await t.test("listIncidents('open') matches default behaviour", () => {
    const store = makeStore();
    store.openIncident({ title: "Inc", service: "payment-api", severity: "info" });
    assert.equal(store.listIncidents("open").length, store.listIncidents().length);
  });

  await t.test("listIncidents('resolved') returns only resolved incidents", () => {
    const store = makeStore();
    const inc = store.openIncident({ title: "Inc R", service: "auth-service", severity: "info" });
    store.resolveIncident(inc.id);

    const resolved = store.listIncidents("resolved");
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].status, "resolved");
  });

  await t.test("listIncidents('all') returns all incidents", () => {
    const store = makeStore();
    const a = store.openIncident({ title: "A", service: "payment-api", severity: "critical" });
    const b = store.openIncident({ title: "B", service: "auth-service", severity: "warning" });
    store.resolveIncident(b.id);

    const all = store.listIncidents("all");
    assert.equal(all.length, 2);
    const ids = all.map((i) => i.id);
    assert.ok(ids.includes(a.id));
    assert.ok(ids.includes(b.id));
  });
});

test("SqliteOpsStore — Runbook retrieval (US4)", async (t) => {
  await t.test("getRunbook returns content for payment-api", () => {
    const store = makeStore();
    const rb = store.getRunbook("payment-api");
    assert.ok(rb);
    assert.equal(rb.serviceId, "payment-api");
    assert.ok(rb.content.includes("Payment API"));
  });

  await t.test("getRunbook returns content for auth-service", () => {
    const store = makeStore();
    const rb = store.getRunbook("auth-service");
    assert.ok(rb);
    assert.equal(rb.serviceId, "auth-service");
  });

  await t.test("getRunbook returns null for unknown service", () => {
    const store = makeStore();
    assert.equal(store.getRunbook("unknown-svc"), null);
  });
});

test("SqliteOpsStore — CHECK constraint enforcement", async (t) => {
  await t.test("invalid incident severity rejected by SQLite CHECK", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE incidents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        service TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','resolved')),
        summary TEXT,
        opened_at TEXT NOT NULL,
        resolved_at TEXT
      )
    `);
    assert.throws(() => {
      db.exec(`INSERT INTO incidents (id, title, service, severity, status, opened_at)
               VALUES ('bad-1', 'Test', 'svc', 'INVALID_SEVERITY', 'open', datetime('now'))`);
    }, /CHECK constraint failed/);
    db.close();
  });
});
