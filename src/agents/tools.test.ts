import test from "node:test";
import assert from "node:assert/strict";
import {
  listAlerts,
  openIncident,
  resolveIncident,
  listIncidents,
  consultarRunbook,
  checkProviderStatusTool,
  forgetPreference,
  createForgetPreferenceTool,
  ListAlertsSchema,
  OpenIncidentSchema,
  ResolveIncidentSchema,
  ListIncidentsSchema,
  ConsultarRunbookSchema,
  CheckProviderStatusSchema,
  ForgetPreferenceSchema,
  opsTools,
} from "./tools.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";

// Note: tools import `store` from ops-store.ts which uses OPSPILOT_DB env var.
// In the test environment (no OPSPILOT_DB set) this would default to a file path.
// We override OPSPILOT_DB to :memory: before the module loads — but since
// ops-store.ts is a module singleton, we patch env before import.
// Since imports are already resolved here, we rely on the fact that
// OPSPILOT_DB is not set in test env → ops-store.ts reads it as undefined and
// uses the default file path in data/. This is acceptable for integration tests.
// Store tests (sqlite-ops-store.test.ts) use :memory: directly.

test("Operational Tools — Schemas & Tool Contracts", async (t) => {
  await t.test("ListAlertsSchema defaults to 'firing'", () => {
    const result = ListAlertsSchema.parse({});
    assert.equal(result.status, "firing");
  });

  await t.test("ListAlertsSchema accepts all valid status values", () => {
    for (const s of ["firing", "resolved", "all"] as const) {
      const r = ListAlertsSchema.parse({ status: s });
      assert.equal(r.status, s);
    }
  });

  await t.test("OpenIncidentSchema rejects title shorter than 3 chars", () => {
    assert.throws(() => {
      OpenIncidentSchema.parse({ title: "x", service: "payment-api", severity: "critical" });
    });
  });

  await t.test("OpenIncidentSchema rejects empty service", () => {
    assert.throws(() => {
      OpenIncidentSchema.parse({ title: "Valid title", service: "", severity: "critical" });
    });
  });

  await t.test("OpenIncidentSchema rejects unknown severity", () => {
    assert.throws(() => {
      OpenIncidentSchema.parse({ title: "Valid title", service: "payment-api", severity: "unknown" });
    });
  });

  await t.test("OpenIncidentSchema accepts sev1/sev2/sev3 aliases", () => {
    for (const sev of ["sev1", "sev2", "sev3"] as const) {
      const r = OpenIncidentSchema.parse({ title: "Valid", service: "svc", severity: sev });
      assert.equal(r.severity, sev);
    }
  });

  await t.test("ResolveIncidentSchema rejects empty id", () => {
    assert.throws(() => ResolveIncidentSchema.parse({ id: "" }));
  });

  await t.test("ListIncidentsSchema defaults to 'open'", () => {
    const r = ListIncidentsSchema.parse({});
    assert.equal(r.status, "open");
  });

  await t.test("ListIncidentsSchema accepts open/resolved/all", () => {
    for (const s of ["open", "resolved", "all"] as const) {
      const r = ListIncidentsSchema.parse({ status: s });
      assert.equal(r.status, s);
    }
  });

  await t.test("ConsultarRunbookSchema rejects empty service", () => {
    assert.throws(() => ConsultarRunbookSchema.parse({ service: "" }));
  });
});

test("Operational Tools — list_alerts integration", async (t) => {
  await t.test("list_alerts returns firing alerts array", async () => {
    const raw = await listAlerts.invoke({ status: "firing" });
    const alerts = JSON.parse(raw);
    assert.ok(Array.isArray(alerts));
    assert.ok(alerts.every((a: { status: string }) => a.status === "firing"));
  });

  await t.test("list_alerts returns resolved alerts", async () => {
    const raw = await listAlerts.invoke({ status: "resolved" });
    const alerts = JSON.parse(raw);
    assert.ok(Array.isArray(alerts));
    assert.ok(alerts.every((a: { status: string }) => a.status === "resolved"));
  });

  await t.test("list_alerts('all') returns non-empty array", async () => {
    const raw = await listAlerts.invoke({ status: "all" });
    const alerts = JSON.parse(raw);
    assert.ok(Array.isArray(alerts));
    assert.ok(alerts.length >= 6);
  });
});

test("Operational Tools — open_incident + resolve_incident integration", async (t) => {
  await t.test("open_incident creates a valid incident with normalized severity", async () => {
    const raw = await openIncident.invoke({
      title: "Payment API 5xx degradation",
      service: "payment-api",
      severity: "critical",
    });
    const incident = JSON.parse(raw);
    assert.ok(incident.id);
    assert.equal(incident.service, "payment-api");
    assert.equal(incident.severity, "critical");
    assert.equal(incident.status, "open");
  });

  await t.test("open_incident normalizes sev1 → critical", async () => {
    const raw = await openIncident.invoke({
      title: "Auth service down",
      service: "auth-service",
      severity: "sev1",
    });
    const incident = JSON.parse(raw);
    assert.equal(incident.severity, "critical");
  });

  await t.test("resolve_incident marks incident as resolved", async () => {
    const createdRaw = await openIncident.invoke({
      title: "DB Deadlocks investigating",
      service: "database-cluster",
      severity: "critical",
    });
    const created = JSON.parse(createdRaw);

    const resolvedRaw = await resolveIncident.invoke({ id: created.id });
    const resolved = JSON.parse(resolvedRaw);
    assert.equal(resolved.id, created.id);
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolvedAt);
  });

  await t.test("resolve_incident handles non-existent incident gracefully", async () => {
    const raw = await resolveIncident.invoke({ id: "inc-9999" });
    const result = JSON.parse(raw);
    assert.ok(result.error);
    assert.match(result.error, /not found/i);
  });
});

test("Operational Tools — list_incidents integration (US3)", async (t) => {
  await t.test("list_incidents default returns an array", async () => {
    const raw = await listIncidents.invoke({ status: "open" });
    const incidents = JSON.parse(raw);
    assert.ok(Array.isArray(incidents));
  });

  await t.test("list_incidents('all') returns non-empty array after opens", async () => {
    await openIncident.invoke({ title: "Test incident for all", service: "notification-hub", severity: "info" });
    const raw = await listIncidents.invoke({ status: "all" });
    const incidents = JSON.parse(raw);
    assert.ok(Array.isArray(incidents));
    assert.ok(incidents.length >= 1);
  });

  await t.test("list_incidents('resolved') returns only resolved incidents", async () => {
    const raw = await listIncidents.invoke({ status: "resolved" });
    const incidents = JSON.parse(raw);
    assert.ok(Array.isArray(incidents));
    assert.ok(incidents.every((i: { status: string }) => i.status === "resolved"));
  });
});

test("Operational Tools — consultar_runbook integration (US4)", async (t) => {
  await t.test("consultar_runbook returns runbook for payment-api", async () => {
    const raw = await consultarRunbook.invoke({ service: "payment-api" });
    const result = JSON.parse(raw);
    assert.ok(result.serviceId, "must have serviceId");
    assert.ok(result.content, "must have content");
    assert.equal(result.serviceId, "payment-api");
  });

  await t.test("consultar_runbook returns runbook for auth-service", async () => {
    const raw = await consultarRunbook.invoke({ service: "auth-service" });
    const result = JSON.parse(raw);
    assert.ok(result.serviceId);
    assert.ok(result.content);
  });

  await t.test("consultar_runbook returns structured error for unknown service", async () => {
    const raw = await consultarRunbook.invoke({ service: "unknown-svc-xyz" });
    const result = JSON.parse(raw);
    assert.ok(result.error, "must have error field");
    assert.match(result.error, /not found/i);
  });
});

test("Operational Tools — check_provider_status (US1+US2+US3)", async (t) => {
  await t.test("CheckProviderStatusSchema defaults to 'github'", () => {
    const r = CheckProviderStatusSchema.parse({});
    assert.equal(r.provider, "github");
  });

  await t.test("CheckProviderStatusSchema accepts github and cloudflare", () => {
    assert.equal(CheckProviderStatusSchema.parse({ provider: "github" }).provider, "github");
    assert.equal(CheckProviderStatusSchema.parse({ provider: "cloudflare" }).provider, "cloudflare");
  });

  await t.test("CheckProviderStatusSchema rejects unknown provider", () => {
    assert.throws(() => CheckProviderStatusSchema.parse({ provider: "aws" }));
  });

  await t.test("opsTools array contains check_provider_status and forget_preference", () => {
    assert.equal(opsTools.length, 7);
    assert.ok(opsTools.some((t) => t.name === "check_provider_status"));
    assert.ok(opsTools.some((t) => t.name === "forget_preference"));
  });

  await t.test("check_provider_status tool invocation returns a string (uses real fetch — may fail in offline env)", async () => {
    // This test exercises the tool wiring; the result may be a status string or a graceful error
    // depending on network availability. It must NEVER throw.
    let threw = false;
    let result: string | undefined;
    try {
      result = await checkProviderStatusTool.invoke({ provider: "github" });
    } catch {
      threw = true;
    }
    assert.equal(threw, false, "Tool must never throw");
    assert.ok(typeof result === "string", "Tool must return a string");
  });
});

test("Operational Tools — forget_preference (US2)", async (t) => {
  await t.test("ForgetPreferenceSchema parses valid query and userId", () => {
    const res = ForgetPreferenceSchema.parse({ queryOrId: "auth-service", userId: "u-1" });
    assert.equal(res.queryOrId, "auth-service");
    assert.equal(res.userId, "u-1");
  });

  await t.test("ForgetPreferenceSchema accepts optional userId", () => {
    const res = ForgetPreferenceSchema.parse({ queryOrId: "auth-service" });
    assert.equal(res.queryOrId, "auth-service");
    assert.equal(res.userId, undefined);
  });

  await t.test("natural language query recalls and deletes matching preference", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      await memoryStore.remember("user-1", "O usuário é responsável pelo auth-service");
      const tool = createForgetPreferenceTool(memoryStore);

      const result = await tool.invoke({ queryOrId: "auth-service", userId: "user-1" });
      assert.match(String(result), /esquecida com sucesso/i);

      const remaining = await memoryStore.list("user-1");
      assert.equal(remaining.length, 0);
    } finally {
      memoryStore.close();
    }
  });

  await t.test("numeric ID deletes memory directly", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const stored = await memoryStore.remember("user-1", "O usuário cuida de pagamentos");
      const tool = createForgetPreferenceTool(memoryStore);

      const result = await tool.invoke({ queryOrId: String(stored.id), userId: "user-1" });
      assert.match(String(result), /esquecida com sucesso/i);

      const remaining = await memoryStore.list("user-1");
      assert.equal(remaining.length, 0);
    } finally {
      memoryStore.close();
    }
  });

  await t.test("non-matching query returns informative message without error", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const tool = createForgetPreferenceTool(memoryStore);

      const result = await tool.invoke({ queryOrId: "inexistente", userId: "user-1" });
      assert.match(String(result), /Nenhuma preferência correspondente encontrada/i);
    } finally {
      memoryStore.close();
    }
  });

  await t.test("non-matching numeric ID returns informative message without error", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const tool = createForgetPreferenceTool(memoryStore);

      const result = await tool.invoke({ queryOrId: "9999", userId: "user-1" });
      assert.match(String(result), /Nenhuma preferência encontrada com ID 9999/i);
    } finally {
      memoryStore.close();
    }
  });
});

