import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqliteRequestTraceStore } from "./request-trace-store.js";
import {
  calculateModelCost,
  calculatePercentile,
  parseSinceWindow,
  InvalidStatsWindowError,
} from "../obs/stats.js";
import type { TraceEvent } from "../agents/types.js";

test("SqliteRequestTraceStore — Requests & Trace Events Persistence (US2)", async (t) => {
  await t.test("saves request metrics and ordered trace_events with full payload reconstruction", () => {
    const store = new SqliteRequestTraceStore(":memory:");
    try {
      const trace: TraceEvent[] = [
        {
          type: "route",
          node: "router",
          route: "plan-and-execute",
          reason: "Multi-step mitigation requested",
          content: "Rota selecionada: plan-and-execute",
          timestamp: 1000,
        },
        {
          type: "thought",
          node: "plan-and-execute",
          content: "Checking firing alerts first",
          timestamp: 1000,
        },
        {
          type: "action",
          node: "plan-and-execute",
          tool: "list_alerts",
          args: { status: "firing" },
          content: "Call list_alerts",
          timestamp: 1000,
        },
        {
          type: "observation",
          node: "plan-and-execute",
          content: "[{\"id\":\"alt-001\"}]",
          timestamp: 1000,
        },
        {
          type: "fallback",
          node: "plan-and-execute",
          fromModel: "anthropic/claude-3.5-sonnet",
          toModel: "openai/gpt-4o-mini",
          reason: "429 rate limit",
          content: "Switched model",
          timestamp: 1001,
        },
        {
          type: "answer",
          node: "response",
          content: "Opened inc-101 for payment-api.",
          timestamp: 1002,
        },
      ];

      store.saveRequest({
        requestId: "req-123",
        conversationId: "conv-xyz",
        userId: "user-oncall",
        strategy: "plan-and-execute",
        status: "ok",
        metrics: {
          llmCalls: 3,
          latencyMs: 420,
          historyMessages: 2,
          promptTokens: 310,
          completionTokens: 90,
          totalTokens: 400,
          modelUsed: "openai/gpt-4o-mini",
          contextBreakdown: {
            system: 100,
            history: 50,
            summary: 0,
            memories: 40,
            userMessage: 20,
            totalEstimated: 210,
          },
        },
        trace,
      });

      const found = store.getRequestWithTrace("req-123");
      assert.ok(found);
      assert.equal(found.id, "req-123");
      assert.equal(found.requestId, "req-123");
      assert.equal(found.conversationId, "conv-xyz");
      assert.equal(found.userId, "user-oncall");
      assert.equal(found.strategy, "plan-and-execute");
      assert.equal(found.route, "plan-and-execute");
      assert.equal(found.status, "ok");
      assert.equal(found.metrics.llmCalls, 3);
      assert.equal(found.metrics.latencyMs, 420);
      assert.equal(found.metrics.promptTokens, 310);
      assert.equal(found.metrics.completionTokens, 90);
      assert.equal(found.metrics.totalTokens, 400);
      assert.equal(found.metrics.modelUsed, "openai/gpt-4o-mini");
      assert.deepEqual(found.metrics.contextBreakdown, {
        system: 100,
        history: 50,
        summary: 0,
        memories: 40,
        userMessage: 20,
        totalEstimated: 210,
      });

      assert.equal(found.trace.length, 6);
      assert.equal(found.trace[0].seq, 0);
      assert.equal(found.trace[0].type, "route");
      assert.equal(found.trace[0].node, "router");
      if (found.trace[0].type === "route") {
        assert.equal(found.trace[0].route, "plan-and-execute");
        assert.equal(found.trace[0].reason, "Multi-step mitigation requested");
      }

      assert.equal(found.trace[2].seq, 2);
      assert.equal(found.trace[2].type, "action");
      if (found.trace[2].type === "action") {
        assert.equal(found.trace[2].tool, "list_alerts");
        assert.deepEqual(found.trace[2].args, { status: "firing" });
      }

      assert.equal(found.trace[4].seq, 4);
      assert.equal(found.trace[4].type, "fallback");
      if (found.trace[4].type === "fallback") {
        assert.equal(found.trace[4].fromModel, "anthropic/claude-3.5-sonnet");
        assert.equal(found.trace[4].toModel, "openai/gpt-4o-mini");
        assert.equal(found.trace[4].reason, "429 rate limit");
      }

      assert.equal(found.trace[5].seq, 5);
      assert.equal(found.trace[5].type, "answer");
      assert.equal(found.trace[5].node, "response");
    } finally {
      store.close();
    }
  });

  await t.test("supports granular requests.save and traceEvents.save preserving deterministic seq order", () => {
    const store = new SqliteRequestTraceStore(":memory:");
    try {
      store.requests.save({
        id: "req-granular-1",
        userId: "u-9",
        route: "reflection",
        modelUsed: "openai/gpt-4o-mini",
        promptTokens: 250,
        latencyMs: 615,
        status: "ok",
      });

      // Intentionally save out of seq order with identical timestamps
      const ev2: TraceEvent = {
        type: "answer",
        node: "response",
        content: "Done.",
        timestamp: 5000,
      };
      const ev0: TraceEvent = {
        type: "route",
        node: "router",
        route: "reflection",
        reason: "Critical audit",
        content: "Route reflection",
        timestamp: 5000,
      };
      const ev1: TraceEvent = {
        type: "critique",
        node: "reflection",
        content: "Approved",
        timestamp: 5000,
      };

      store.traceEvents.save({ requestId: "req-granular-1", seq: 2, node: ev2.node, type: ev2.type, payload: ev2 });
      store.traceEvents.save({ requestId: "req-granular-1", seq: 0, node: ev0.node, type: ev0.type, payload: ev0 });
      store.traceEvents.save({ requestId: "req-granular-1", seq: 1, node: ev1.node, type: ev1.type, payload: ev1 });

      const result = store.getRequestWithTrace("req-granular-1");
      assert.ok(result);
      assert.equal(result.route, "reflection");
      assert.equal(result.promptTokens, 250);
      assert.equal(result.latencyMs, 615);
      assert.equal(result.status, "ok");

      assert.equal(result.trace.length, 3);
      assert.deepEqual(
        result.trace.map((e) => e.seq),
        [0, 1, 2]
      );
      assert.deepEqual(
        result.trace.map((e) => e.type),
        ["route", "critique", "answer"]
      );
      assert.deepEqual(
        result.trace.map((e) => e.node),
        ["router", "reflection", "response"]
      );
    } finally {
      store.close();
    }
  });

  await t.test("returns null for unknown requestId", () => {
    const store = new SqliteRequestTraceStore(":memory:");
    try {
      assert.equal(store.getRequest("non-existent"), null);
      assert.equal(store.getRequestWithTrace("non-existent"), null);
      assert.deepEqual(store.getTraceEvents("non-existent"), []);
    } finally {
      store.close();
    }
  });

  await t.test("persists durably on disk across store instances", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opspilot-reqtrace-"));
    const dbPath = path.join(tmpDir, "trace.db");

    let storeA: SqliteRequestTraceStore | undefined;
    let storeB: SqliteRequestTraceStore | undefined;
    try {
      storeA = new SqliteRequestTraceStore(dbPath);
      storeA.saveRequest({
        requestId: "req-disk-1",
        conversationId: "conv-disk",
        strategy: "react",
        metrics: { llmCalls: 1, latencyMs: 88, promptTokens: 55 },
        trace: [{ type: "answer", node: "react", content: "Persisted answer", timestamp: 999 }],
      });
      storeA.close();
      storeA = undefined;

      storeB = new SqliteRequestTraceStore(dbPath);
      const loaded = storeB.getRequestWithTrace("req-disk-1");
      assert.ok(loaded);
      assert.equal(loaded.id, "req-disk-1");
      assert.equal(loaded.metrics.promptTokens, 55);
      assert.equal(loaded.trace.length, 1);
      assert.equal(loaded.trace[0].content, "Persisted answer");
    } finally {
      storeA?.close();
      storeB?.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

test("Stats Aggregation & Pricing Helpers (017-requests-stats-endpoint)", async (t) => {
  await t.test("calculateModelCost returns 0 for :free models and computes USD cost for paid models", () => {
    assert.equal(calculateModelCost("meta-llama/llama-3.3-70b-instruct:free", 100_000, 50_000), 0);
    assert.equal(calculateModelCost("google/gemma-2-9b-it:FREE", 250_000, 25_000), 0);
    assert.equal(calculateModelCost("openai/gpt-4o-mini", 0, 0), 0);

    // openai/gpt-4o-mini: $0.15 / 1M input + $0.60 / 1M output
    const miniCost = calculateModelCost("openai/gpt-4o-mini", 1_000_000, 1_000_000);
    assert.equal(miniCost, 0.75);

    // anthropic/claude-3.5-sonnet: $3.00 / 1M input + $15.00 / 1M output
    const sonnetCost = calculateModelCost("anthropic/claude-3.5-sonnet", 100_000, 10_000);
    assert.equal(sonnetCost, 0.45);
  });

  await t.test("calculatePercentile computes accurate p50 and p95 latencies", () => {
    assert.equal(calculatePercentile([], 50), 0);
    assert.equal(calculatePercentile([42], 95), 42);

    const sample = Array.from({ length: 20 }, (_, i) => (i + 1) * 10); // 10..200
    assert.equal(calculatePercentile(sample, 50), 100);
    assert.equal(calculatePercentile(sample, 95), 190);
  });

  await t.test("parseSinceWindow handles relative durations and rejects invalid windows", () => {
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);
    const w24h = parseSinceWindow("24h", now);
    assert.equal(w24h.since, "24h");
    assert.equal(w24h.cutoffMs, now - 24 * 3_600_000);

    const w30m = parseSinceWindow("30m", now);
    assert.equal(w30m.cutoffMs, now - 30 * 60_000);

    assert.throws(() => parseSinceWindow("invalid-window", now), InvalidStatsWindowError);
    assert.throws(() => parseSinceWindow("0h", now), InvalidStatsWindowError);
  });

  await t.test("store.getStats filters by since window and groups by route & model", () => {
    const store = new SqliteRequestTraceStore(":memory:");
    try {
      const now = Date.UTC(2026, 10, 18, 12, 0, 0);
      const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();

      // Within 24h: 2 paid react ok, 1 :free plan-and-execute ok, 1 error
      store.requests.save({
        id: "r1",
        route: "react",
        strategy: "react",
        modelUsed: "openai/gpt-4o-mini",
        promptTokens: 1_000_000,
        completionTokens: 0,
        latencyMs: 100,
        status: "ok",
        createdAt: iso(1),
      });
      store.requests.save({
        id: "r2",
        route: "react",
        strategy: "react",
        modelUsed: "openai/gpt-4o-mini",
        promptTokens: 1_000_000,
        completionTokens: 0,
        latencyMs: 300,
        status: "ok",
        createdAt: iso(2),
      });
      store.requests.save({
        id: "r3",
        route: "plan-and-execute",
        strategy: "plan-and-execute",
        modelUsed: "meta-llama/llama-3.3-70b-instruct:free",
        promptTokens: 500_000,
        completionTokens: 200_000,
        latencyMs: 500,
        status: "ok",
        createdAt: iso(5),
      });
      store.requests.save({
        id: "r4",
        route: "reflection",
        strategy: "reflection",
        modelUsed: "meta-llama/llama-3.3-70b-instruct:free",
        promptTokens: 0,
        latencyMs: 50,
        status: "error",
        createdAt: iso(10),
      });
      // Outside 24h (48h ago): should be excluded
      store.requests.save({
        id: "r-old",
        route: "react",
        strategy: "react",
        modelUsed: "anthropic/claude-3.5-sonnet",
        promptTokens: 5_000_000,
        latencyMs: 9999,
        status: "ok",
        createdAt: iso(48),
      });

      const stats24h = store.getStats("24h", now);
      assert.equal(stats24h.since, "24h");
      assert.equal(stats24h.total, 4);
      assert.equal(stats24h.errors, 1);
      assert.equal(stats24h.erros, 1);
      assert.equal(stats24h.cost, 0.3);
      assert.equal(stats24h.custo, 0.3);
      assert.equal(stats24h.p50, 100);
      assert.equal(stats24h.p95, 500);

      assert.equal(stats24h.byRoute["react"].total, 2);
      assert.equal(stats24h.byRoute["react"].cost, 0.3);
      assert.equal(stats24h.byRoute["plan-and-execute"].total, 1);
      assert.equal(stats24h.byRoute["plan-and-execute"].cost, 0);
      assert.equal(stats24h.byRoute["reflection"].errors, 1);

      assert.equal(stats24h.byModel["openai/gpt-4o-mini"].total, 2);
      assert.equal(stats24h.byModel["openai/gpt-4o-mini"].cost, 0.3);
      assert.equal(stats24h.byModel["meta-llama/llama-3.3-70b-instruct:free"].total, 2);
      assert.equal(stats24h.byModel["meta-llama/llama-3.3-70b-instruct:free"].cost, 0);
      assert.equal(stats24h.byModel["anthropic/claude-3.5-sonnet"], undefined);
    } finally {
      store.close();
    }
  });
});

