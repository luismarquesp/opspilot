import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./server.js";
import { SqliteRequestTraceStore } from "../store/request-trace-store.js";
import { SqliteConversationStore } from "../store/conversation-store.js";
import { createLogger } from "../obs/logger.js";
import { ModelUnavailableError } from "../agents/errors.js";
import type { ReasoningStrategy } from "../agents/types.js";

test("GET /stats Integration Tests (017-requests-stats-endpoint)", async (t) => {
  await t.test("returns zeroed stats when no requests exist", async () => {
    const requestTraceStore = new SqliteRequestTraceStore(":memory:");
    try {
      const app = createApp({ requestTraceStore });
      const res = await request(app).get("/stats");

      assert.equal(res.status, 200);
      assert.equal(res.body.since, "24h");
      assert.equal(res.body.total, 0);
      assert.equal(res.body.errors, 0);
      assert.equal(res.body.erros, 0);
      assert.equal(res.body.cost, 0);
      assert.equal(res.body.custo, 0);
      assert.equal(res.body.p50, 0);
      assert.equal(res.body.p95, 0);
      assert.deepEqual(res.body.byRoute, {});
      assert.deepEqual(res.body.porRota, {});
      assert.deepEqual(res.body.byModel, {});
      assert.deepEqual(res.body.porModelo, {});
    } finally {
      requestTraceStore.close();
    }
  });

  await t.test("aggregates live /chat successes, :free models (=0), and 503 errors with since=24h and since=1h", async () => {
    const requestTraceStore = new SqliteRequestTraceStore(":memory:");
    const conversationStore = new SqliteConversationStore(":memory:");

    const freeStrategy: ReasoningStrategy = {
      name: "react",
      run: async () => ({
        answer: "Free model answer",
        trace: [{ type: "answer", node: "react", content: "Free model answer", timestamp: 100 }],
        metrics: {
          llmCalls: 1,
          latencyMs: 50,
          promptTokens: 500_000,
          completionTokens: 100_000,
          totalTokens: 600_000,
          modelUsed: "meta-llama/llama-3.3-70b-instruct:free",
        },
      }),
    };

    const paidStrategy: ReasoningStrategy = {
      name: "plan-and-execute",
      run: async () => ({
        answer: "Paid model answer",
        trace: [{ type: "answer", node: "plan-and-execute", content: "Paid model answer", timestamp: 100 }],
        metrics: {
          llmCalls: 2,
          latencyMs: 120,
          promptTokens: 1_000_000,
          completionTokens: 0,
          totalTokens: 1_000_000,
          modelUsed: "openai/gpt-4o-mini",
        },
      }),
    };

    const failingStrategy: ReasoningStrategy = {
      name: "reflection",
      run: async () => {
        throw new ModelUnavailableError("Outage", ["primary"]);
      },
    };

    try {
      // Seed an old request from 48h ago (excluded by since=24h)
      requestTraceStore.requests.save({
        id: "old-req-48h",
        route: "react",
        strategy: "react",
        modelUsed: "anthropic/claude-3.5-sonnet",
        promptTokens: 2_000_000,
        latencyMs: 9999,
        status: "ok",
        createdAt: new Date(Date.now() - 48 * 3_600_000).toISOString(),
      });

      // Seed a request from 3h ago (included in since=24h, excluded from since=1h)
      requestTraceStore.requests.save({
        id: "mid-req-3h",
        route: "react",
        strategy: "react",
        modelUsed: "openai/gpt-4o-mini",
        promptTokens: 1_000_000,
        completionTokens: 0,
        latencyMs: 400,
        status: "ok",
        createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      });

      const app = createApp({
        strategyRegistry: {
          react: freeStrategy,
          "plan-and-execute": paidStrategy,
          reflection: failingStrategy,
        },
        conversationStore,
        requestTraceStore,
        logger: createLogger(() => {}),
      });

      const resFree = await request(app)
        .post("/chat")
        .send({ message: "Alerta 1", strategy: "react" });
      assert.equal(resFree.status, 200);

      const resPaid = await request(app)
        .post("/chat")
        .send({ message: "Alerta 2", strategy: "plan-and-execute" });
      assert.equal(resPaid.status, 200);

      const resErr = await request(app)
        .post("/chat")
        .send({ message: "Alerta 3", strategy: "reflection" });
      assert.equal(resErr.status, 503);

      // Query since=24h (should include mid-req-3h + 3 live requests = 4 total, 1 error)
      const stats24h = await request(app).get("/stats?since=24h");
      assert.equal(stats24h.status, 200);
      assert.equal(stats24h.body.since, "24h");
      assert.equal(stats24h.body.total, 4);
      assert.equal(stats24h.body.errors, 1);
      assert.equal(stats24h.body.erros, 1);
      // Cost: mid-req-3h (0.15) + resPaid (0.15) + resFree (:free = 0) + resErr (0) = 0.30
      assert.equal(stats24h.body.cost, 0.3);
      assert.equal(stats24h.body.custo, 0.3);
      assert.ok(typeof stats24h.body.p50 === "number");
      assert.ok(typeof stats24h.body.p95 === "number");
      assert.ok(stats24h.body.p95 >= stats24h.body.p50);

      assert.equal(stats24h.body.byRoute["react"].total, 2);
      assert.equal(stats24h.body.byRoute["plan-and-execute"].total, 1);
      assert.equal(stats24h.body.byRoute["reflection"].errors, 1);
      assert.equal(stats24h.body.porRota["react"].total, 2);

      assert.equal(stats24h.body.byModel["meta-llama/llama-3.3-70b-instruct:free"].total, 1);
      assert.equal(stats24h.body.byModel["meta-llama/llama-3.3-70b-instruct:free"].cost, 0);
      assert.equal(stats24h.body.byModel["openai/gpt-4o-mini"].total, 2);
      assert.equal(stats24h.body.byModel["openai/gpt-4o-mini"].cost, 0.3);
      assert.equal(stats24h.body.porModelo["meta-llama/llama-3.3-70b-instruct:free"].custo, 0);

      // Query since=1h (excludes mid-req-3h -> 3 live requests, cost 0.15)
      const stats1h = await request(app).get("/stats?since=1h");
      assert.equal(stats1h.status, 200);
      assert.equal(stats1h.body.since, "1h");
      assert.equal(stats1h.body.total, 3);
      assert.equal(stats1h.body.errors, 1);
      assert.equal(stats1h.body.cost, 0.15);
    } finally {
      requestTraceStore.close();
      conversationStore.close();
    }
  });

  await t.test("returns HTTP 400 validation_error for invalid since parameter", async () => {
    const requestTraceStore = new SqliteRequestTraceStore(":memory:");
    try {
      const app = createApp({ requestTraceStore });

      const res1 = await request(app).get("/stats?since=bogus");
      assert.equal(res1.status, 400);
      assert.equal(res1.body.error, "validation_error");

      const res2 = await request(app).get("/stats?since=");
      assert.equal(res2.status, 400);
      assert.equal(res2.body.error, "validation_error");
    } finally {
      requestTraceStore.close();
    }
  });
});
