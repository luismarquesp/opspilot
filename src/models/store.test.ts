import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryOpsStore,
  BASELINE_SERVICES,
  BASELINE_ALERTS,
  BASELINE_RUNBOOKS,
} from "./store.js";

test("Ground-Truth Operations Store & Seeding Lifecycle", async (t) => {
  await t.test("validates baseline seed constants counts and status distribution", () => {
    assert.equal(BASELINE_SERVICES.length, 5, "Must have exactly 5 baseline services");
    assert.equal(BASELINE_ALERTS.length, 6, "Must have exactly 6 baseline alerts");
    assert.equal(BASELINE_RUNBOOKS.length, 3, "Must have exactly 3 baseline runbooks");

    const firing = BASELINE_ALERTS.filter((a) => a.status === "firing");
    const resolved = BASELINE_ALERTS.filter((a) => a.status === "resolved");

    assert.equal(firing.length, 3, "Must have exactly 3 firing alerts");
    assert.equal(resolved.length, 3, "Must have exactly 3 resolved alerts");

    const serviceIds = new Set(BASELINE_SERVICES.map((s) => s.id));
    for (const alert of BASELINE_ALERTS) {
      assert.ok(serviceIds.has(alert.serviceId), `Alert ${alert.id} references valid service ${alert.serviceId}`);
    }
  });

  await t.test("initializes InMemoryOpsStore with seeded data and queries accurately", () => {
    const store = new InMemoryOpsStore(true);

    const firingAlerts = store.listAlerts("firing");
    assert.equal(firingAlerts.length, 3);

    const resolvedAlerts = store.listAlerts("resolved");
    assert.equal(resolvedAlerts.length, 3);

    const allAlerts = store.listAlerts("all");
    assert.equal(allAlerts.length, 6);

    const services = store.listServices();
    assert.equal(services.length, 5);

    const paymentService = store.getService("payment-api");
    assert.ok(paymentService);
    assert.equal(paymentService.name, "Payment API");
  });

  await t.test("handles incident lifecycle from open to resolve", () => {
    const store = new InMemoryOpsStore(false);

    const inc = store.openIncident({
      title: "API rate limiting",
      service: "payment-api",
      severity: "warning",
    });

    assert.equal(inc.status, "open");
    assert.equal(store.listIncidents("all").length, 1);

    const resolved = store.resolveIncident(inc.id);
    assert.ok(resolved);
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolvedAt);

    const nonExistent = store.resolveIncident("inc-non-existent");
    assert.equal(nonExistent, null);
  });

  await t.test("listIncidents filters by status correctly", () => {
    const store = new InMemoryOpsStore(false);

    const i1 = store.openIncident({ title: "Inc 1", service: "payment-api", severity: "critical" });
    const i2 = store.openIncident({ title: "Inc 2", service: "auth-service", severity: "info" });
    store.resolveIncident(i2.id);

    const open = store.listIncidents("open");
    assert.equal(open.length, 1);
    assert.equal(open[0].id, i1.id);

    const resolved = store.listIncidents("resolved");
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].id, i2.id);

    const all = store.listIncidents("all");
    assert.equal(all.length, 2);
  });

  await t.test("listIncidents defaults to 'open'", () => {
    const store = new InMemoryOpsStore(false);
    store.openIncident({ title: "Test", service: "payment-api", severity: "info" });
    assert.equal(store.listIncidents().length, store.listIncidents("open").length);
  });

  await t.test("getRunbook returns runbook from BASELINE_RUNBOOKS", () => {
    const store = new InMemoryOpsStore(true);
    const rb = store.getRunbook("payment-api");
    assert.ok(rb, "payment-api runbook must exist");
    assert.equal(rb.serviceId, "payment-api");
    assert.ok(rb.content.length > 0);
  });

  await t.test("getRunbook returns null for unknown service", () => {
    const store = new InMemoryOpsStore(true);
    assert.equal(store.getRunbook("unknown-xyz"), null);
  });

  await t.test("resets and reseeds store reliably", () => {
    const store = new InMemoryOpsStore(true);
    store.reset();
    assert.equal(store.listServices().length, 0);
    assert.equal(store.listAlerts("all").length, 0);

    store.seed();
    assert.equal(store.listServices().length, 5);
    assert.equal(store.listAlerts("all").length, 6);
  });
});
