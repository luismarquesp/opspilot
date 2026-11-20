import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./server.js";
import { SqliteRequestTraceStore } from "../store/request-trace-store.js";
import { SqliteConversationStore } from "../store/conversation-store.js";
import { createLogger } from "../obs/logger.js";
import type { ReasoningStrategy, StrategyResult } from "../agents/types.js";

test("GET /requests/:id & End-to-End Trace Persistence + NDJSON Logging (016)", async (t) => {
  await t.test("T009 (US2, US3, US4) — persists request metrics & ordered trace and logs metadata-only NDJSON", async () => {
    const requestTraceStore = new SqliteRequestTraceStore(":memory:");
    const conversationStore = new SqliteConversationStore(":memory:");
    const logLines: string[] = [];
    const logger = createLogger((line) => logLines.push(line));

    const userSecretPrompt = "CONFIDENTIAL_INCIDENT_MESSAGE_991";
    const secretObservation = "SENSITIVE_DB_HOST_10_0_0_42";
    const secretApiKeyArg = "sk-do-not-leak-in-logs";
    const secretAnswerText = "FINAL_CONFIDENTIAL_SUMMARY_777";

    const fakeResult: StrategyResult = {
      answer: secretAnswerText,
      trace: [
        {
          type: "thought",
          node: "react",
          content: "Thinking about alerts",
          timestamp: 1000,
        },
        {
          type: "action",
          node: "react",
          tool: "list_alerts",
          args: { status: "firing", apiKey: secretApiKeyArg },
          content: "Call list_alerts",
          timestamp: 1000,
        },
        {
          type: "observation",
          node: "react",
          content: secretObservation,
          timestamp: 1000,
        },
        {
          type: "answer",
          node: "react",
          content: secretAnswerText,
          timestamp: 1001,
        },
      ],
      metrics: {
        llmCalls: 2,
        latencyMs: 215,
        promptTokens: 450,
        completionTokens: 110,
        totalTokens: 560,
        modelUsed: "openai/gpt-4o-mini",
      },
    };

    const fakeStrategy: ReasoningStrategy = {
      name: "react",
      run: async () => fakeResult,
    };

    try {
      const app = createApp({
        strategyRegistry: { react: fakeStrategy },
        conversationStore,
        requestTraceStore,
        logger,
      });

      const chatRes = await request(app)
        .post("/chat")
        .set("X-Request-Id", "req-e2e-100")
        .send({
          userId: "sre-alice",
          strategy: "react",
          message: userSecretPrompt,
        });

      assert.equal(chatRes.status, 200);
      assert.equal(chatRes.body.requestId, "req-e2e-100");
      assert.equal(chatRes.headers["x-request-id"], "req-e2e-100");

      // Retrieve persisted record + ordered trace via GET /requests/:id
      const getRes = await request(app).get("/requests/req-e2e-100");

      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.id, "req-e2e-100");
      assert.equal(getRes.body.requestId, "req-e2e-100");
      assert.equal(getRes.body.conversationId, chatRes.body.conversationId);
      assert.equal(getRes.body.userId, "sre-alice");
      assert.equal(getRes.body.strategy, "react");
      assert.equal(getRes.body.route, "react");
      assert.equal(getRes.body.status, "ok");
      assert.equal(getRes.body.modelUsed, "openai/gpt-4o-mini");
      assert.equal(getRes.body.promptTokens, 450);
      assert.equal(getRes.body.metrics.promptTokens, 450);
      assert.equal(getRes.body.metrics.totalTokens, 560);
      assert.equal(getRes.body.metrics.modelUsed, "openai/gpt-4o-mini");
      assert.ok(getRes.body.metrics.contextBreakdown);

      // Verify trace order matches POST /chat trace (route + 4 strategy events = 5)
      assert.equal(getRes.body.trace.length, chatRes.body.trace.length);
      assert.equal(getRes.body.trace[0].type, "route");
      assert.equal(getRes.body.trace[0].node, "router");
      assert.equal(getRes.body.trace[0].seq, 0);
      assert.equal(getRes.body.trace[1].type, "thought");
      assert.equal(getRes.body.trace[1].seq, 1);
      assert.equal(getRes.body.trace[2].type, "action");
      assert.equal(getRes.body.trace[2].tool, "list_alerts");
      assert.deepEqual(getRes.body.trace[2].args, { status: "firing", apiKey: secretApiKeyArg });
      assert.equal(getRes.body.trace[2].seq, 2);
      assert.equal(getRes.body.trace[3].type, "observation");
      assert.equal(getRes.body.trace[3].content, secretObservation);
      assert.equal(getRes.body.trace[3].seq, 3);
      assert.equal(getRes.body.trace[4].type, "answer");
      assert.equal(getRes.body.trace[4].seq, 4);

      // Verify metadata-only single-line JSON logs (5 trace events + 1 done = 6 lines)
      assert.equal(logLines.length, chatRes.body.trace.length + 1);
      for (const line of logLines) {
        assert.equal(line.includes("\n"), false);
        assert.equal(line.includes(userSecretPrompt), false);
        assert.equal(line.includes(secretObservation), false);
        assert.equal(line.includes(secretApiKeyArg), false);
        assert.equal(line.includes(secretAnswerText), false);
        const parsed = JSON.parse(line) as Record<string, unknown>;
        assert.equal(parsed.requestId, "req-e2e-100");
      }

      const lastLog = JSON.parse(logLines[logLines.length - 1]) as Record<string, unknown>;
      assert.equal(lastLog.type, "done");
      assert.equal(lastLog.event, "request_completed");
      assert.equal(lastLog.node, "response");
      assert.equal(lastLog.route, "react");
      assert.equal(lastLog.tokens, 450);
    } finally {
      requestTraceStore.close();
      conversationStore.close();
    }
  });

  await t.test("T009 (US3) — GET /requests/:id returns HTTP 404 when requestId does not exist", async () => {
    const requestTraceStore = new SqliteRequestTraceStore(":memory:");
    try {
      const app = createApp({ requestTraceStore });

      const res = await request(app).get("/requests/does-not-exist-999");

      assert.equal(res.status, 404);
      assert.equal(res.body.error, "request_not_found");
      assert.equal(res.body.requestId, "does-not-exist-999");
    } finally {
      requestTraceStore.close();
    }
  });

  await t.test("T009 (US2, US3) — isolates multiple sequential requests by requestId", async () => {
    const requestTraceStore = new SqliteRequestTraceStore(":memory:");
    const conversationStore = new SqliteConversationStore(":memory:");

    const makeStrat = (name: "react" | "plan-and-execute", ans: string): ReasoningStrategy => ({
      name,
      run: async () => ({
        answer: ans,
        trace: [{ type: "answer", node: name, content: ans, timestamp: 200 }],
        metrics: { llmCalls: 1, latencyMs: 50, promptTokens: 77 },
      }),
    });

    try {
      const app = createApp({
        strategyRegistry: {
          react: makeStrat("react", "Answer A"),
          "plan-and-execute": makeStrat("plan-and-execute", "Answer B"),
        },
        conversationStore,
        requestTraceStore,
        logger: createLogger(() => {}),
      });

      const resA = await request(app)
        .post("/chat")
        .send({ message: "First", strategy: "react" });
      const resB = await request(app)
        .post("/chat")
        .send({ message: "Second", strategy: "plan-and-execute" });

      assert.equal(resA.status, 200);
      assert.equal(resB.status, 200);
      assert.notEqual(resA.body.requestId, resB.body.requestId);

      const getA = await request(app).get(`/requests/${resA.body.requestId}`);
      const getB = await request(app).get(`/requests/${resB.body.requestId}`);

      assert.equal(getA.status, 200);
      assert.equal(getA.body.strategy, "react");
      assert.equal(getA.body.trace[1].content, "Answer A");

      assert.equal(getB.status, 200);
      assert.equal(getB.body.strategy, "plan-and-execute");
      assert.equal(getB.body.trace[1].content, "Answer B");
    } finally {
      requestTraceStore.close();
      conversationStore.close();
    }
  });
});
