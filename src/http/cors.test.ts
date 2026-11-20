import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./server.js";
import { SqliteRequestTraceStore } from "../store/request-trace-store.js";
import { SqliteConversationStore } from "../store/conversation-store.js";
import { createLogger } from "../obs/logger.js";
import type { ReasoningStrategy } from "../agents/types.js";

test("Express CORS Middleware Integration Tests (018-war-room-web / US4)", async (t) => {
  const reactStrategy: ReasoningStrategy = {
    name: "react",
    run: async (input) => ({
      answer: `Diagnostico para: ${input}`,
      trace: [
        { type: "route", node: "router", route: "react", reason: "Consulta direta", content: "react", timestamp: 10 },
        { type: "answer", node: "react", content: `Diagnostico para: ${input}`, timestamp: 20 },
      ],
      metrics: {
        llmCalls: 1,
        latencyMs: 25,
        promptTokens: 120,
        completionTokens: 40,
        totalTokens: 160,
        modelUsed: "meta-llama/llama-3.3-70b-instruct:free",
      },
    }),
  };

  await t.test("handles OPTIONS /chat preflight with 204 and exposes X-Request-Id", async () => {
    const requestTraceStore = new SqliteRequestTraceStore(":memory:");
    const conversationStore = new SqliteConversationStore(":memory:");
    try {
      const app = createApp({
        strategyRegistry: { react: reactStrategy },
        conversationStore,
        requestTraceStore,
        logger: createLogger(() => {}),
      });

      const res = await request(app)
        .options("/chat")
        .set("Origin", "http://localhost:5173")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "Content-Type, X-Request-Id");

      assert.equal(res.status, 204);
      assert.equal(res.headers["access-control-allow-origin"], "http://localhost:5173");
      assert.match(res.headers["access-control-allow-methods"] ?? "", /POST/);
      assert.match(res.headers["access-control-allow-methods"] ?? "", /OPTIONS/);
      assert.match(res.headers["access-control-allow-headers"] ?? "", /X-Request-Id/i);
      assert.match(res.headers["access-control-expose-headers"] ?? "", /X-Request-Id/i);
    } finally {
      conversationStore.close();
      requestTraceStore.close();
    }
  });

  await t.test("handles OPTIONS /stats preflight with 204", async () => {
    const requestTraceStore = new SqliteRequestTraceStore(":memory:");
    try {
      const app = createApp({
        requestTraceStore,
        logger: createLogger(() => {}),
      });

      const res = await request(app)
        .options("/stats")
        .set("Origin", "http://localhost:5173")
        .set("Access-Control-Request-Method", "GET");

      assert.equal(res.status, 204);
      assert.equal(res.headers["access-control-allow-origin"], "http://localhost:5173");
      assert.match(res.headers["access-control-expose-headers"] ?? "", /X-Request-Id/i);
    } finally {
      requestTraceStore.close();
    }
  });

  await t.test("attaches CORS and Access-Control-Expose-Headers: X-Request-Id on GET /stats and POST /chat", async () => {
    const requestTraceStore = new SqliteRequestTraceStore(":memory:");
    const conversationStore = new SqliteConversationStore(":memory:");
    try {
      const app = createApp({
        strategyRegistry: { react: reactStrategy },
        conversationStore,
        requestTraceStore,
        logger: createLogger(() => {}),
      });

      const statsRes = await request(app)
        .get("/stats?since=24h")
        .set("Origin", "http://localhost:5173");

      assert.equal(statsRes.status, 200);
      assert.equal(statsRes.headers["access-control-allow-origin"], "http://localhost:5173");
      assert.match(statsRes.headers["access-control-expose-headers"] ?? "", /X-Request-Id/i);

      const chatRes = await request(app)
        .post("/chat")
        .set("Origin", "http://localhost:5173")
        .set("X-Request-Id", "cors-req-001")
        .send({ message: "Verificar latencia", strategy: "react" });

      assert.equal(chatRes.status, 200);
      assert.equal(chatRes.headers["access-control-allow-origin"], "http://localhost:5173");
      assert.match(chatRes.headers["access-control-expose-headers"] ?? "", /X-Request-Id/i);
      assert.equal(chatRes.headers["x-request-id"], "cors-req-001");
      assert.equal(chatRes.body.requestId, "cors-req-001");
    } finally {
      conversationStore.close();
      requestTraceStore.close();
    }
  });
});

test("POST /chat HTTP 202 Approval Flow Integration Tests (018-war-room-web / US2)", async (t) => {
  await t.test("returns HTTP 202 pending_approval without running strategy, then handles reject and approve decisions", async () => {
    const requestTraceStore = new SqliteRequestTraceStore(":memory:");
    const conversationStore = new SqliteConversationStore(":memory:");
    let executions = 0;

    const gatedStrategy: ReasoningStrategy = {
      name: "react",
      run: async (input) => {
        executions += 1;
        return {
          answer: `Executado apos aprovacao: ${input}`,
          trace: [
            {
              type: "action",
              node: "react",
              tool: "open_incident",
              args: { service: "payment-api", severity: "critical" },
              content: "open_incident",
              timestamp: 15,
            },
            {
              type: "answer",
              node: "react",
              content: `Executado apos aprovacao: ${input}`,
              timestamp: 25,
            },
          ],
          metrics: {
            llmCalls: 1,
            latencyMs: 30,
            promptTokens: 90,
            completionTokens: 35,
            totalTokens: 125,
            modelUsed: "meta-llama/llama-3.3-70b-instruct:free",
          },
        };
      },
    };

    try {
      const app = createApp({
        strategyRegistry: { react: gatedStrategy },
        conversationStore,
        requestTraceStore,
        logger: createLogger(() => {}),
      });

      // Step 1: Request requiring human confirmation returns HTTP 202
      const pendingRes = await request(app)
        .post("/chat")
        .set("Origin", "http://localhost:5173")
        .set("X-Request-Id", "req-202-pending")
        .send({
          message: "Abrir incidente crítico para payment-api",
          strategy: "react",
          requireApproval: true,
          action: "open_incident",
          tool: "open_incident",
          args: { service: "payment-api", severity: "critical" },
        });

      assert.equal(pendingRes.status, 202);
      assert.equal(pendingRes.headers["x-request-id"], "req-202-pending");
      assert.equal(pendingRes.headers["access-control-allow-origin"], "http://localhost:5173");
      assert.equal(pendingRes.body.status, "pending_approval");
      assert.equal(pendingRes.body.requestId, "req-202-pending");
      assert.match(pendingRes.body.approvalId, /^apr-/);
      assert.equal(pendingRes.body.action, "open_incident");
      assert.equal(pendingRes.body.tool, "open_incident");
      assert.deepEqual(pendingRes.body.args, { service: "payment-api", severity: "critical" });
      assert.ok(pendingRes.body.conversationId);
      assert.equal(executions, 0);

      // Step 2: Rejecting skips strategy execution cleanly
      const rejectRes = await request(app)
        .post("/chat")
        .set("Origin", "http://localhost:5173")
        .send({
          message: "Abrir incidente crítico para payment-api",
          conversationId: pendingRes.body.conversationId,
          approvalId: pendingRes.body.approvalId,
          decision: "reject",
          approved: false,
        });

      assert.equal(rejectRes.status, 200);
      assert.equal(rejectRes.body.approved, false);
      assert.equal(rejectRes.body.approvalId, pendingRes.body.approvalId);
      assert.match(rejectRes.body.answer, /negada/i);
      assert.equal(executions, 0);

      // Step 3: Approving executes strategy and returns 200 OK
      const approveRes = await request(app)
        .post("/chat")
        .set("Origin", "http://localhost:5173")
        .send({
          message: "Abrir incidente crítico para payment-api",
          strategy: "react",
          conversationId: pendingRes.body.conversationId,
          approvalId: pendingRes.body.approvalId,
          decision: "approve",
          approved: true,
        });

      assert.equal(approveRes.status, 200);
      assert.equal(approveRes.body.approved, true);
      assert.equal(approveRes.body.approvalId, pendingRes.body.approvalId);
      assert.match(approveRes.body.answer, /Executado apos aprovacao/);
      assert.equal(executions, 1);
      assert.ok(Array.isArray(approveRes.body.trace));
      assert.ok(approveRes.body.trace.length >= 2);
    } finally {
      conversationStore.close();
      requestTraceStore.close();
    }
  });
});
