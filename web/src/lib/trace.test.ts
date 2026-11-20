import test from "node:test";
import assert from "node:assert/strict";
import type { TypedTraceEvent } from "../types/war-room.js";
import {
  describeTraceEvent,
  hasFallbackEvent,
  formatLatencyMs,
  formatTokenCount,
  formatCostUsd,
  mapApiErrorToMessage,
  parseChatApiResponse,
} from "./trace.js";

test("War Room Typed Trace & Response Parser Pure Helpers (018-war-room-web / US1)", async (t) => {
  await t.test("describeTraceEvent handles all 9 typed trace variants with node attribution and icon/label", () => {
    const events: TypedTraceEvent[] = [
      { type: "route", node: "router", route: "plan-and-execute", reason: "Multi-step outage", content: "plan-and-execute", timestamp: 1 },
      { type: "plan", node: "plan-and-execute", content: "1. List alerts 2. Check DB", timestamp: 2 },
      { type: "thought", node: "react", content: "Need to inspect alert queue", timestamp: 3 },
      { type: "action", node: "react", tool: "list_alerts", args: { service: "payment-api" }, content: "list_alerts", timestamp: 4 },
      { type: "observation", node: "react", content: "2 active critical alerts", timestamp: 5 },
      { type: "critique", node: "reflection", content: "Verify rollback plan", timestamp: 6 },
      { type: "fallback", node: "react", fromModel: "openai/gpt-4o-mini", toModel: "meta-llama/llama-3.3-70b-instruct:free", reason: "429 rate limit", content: "fallback", timestamp: 7 },
      { type: "summarize", node: "context", content: "Window compressed", timestamp: 8 },
      { type: "answer", node: "response", content: "Payment API degraded due to DB pool saturation.", timestamp: 9 },
    ];

    const described = events.map(describeTraceEvent);
    assert.equal(described.length, 9);

    assert.equal(described[0].label, "Rota");
    assert.equal(described[0].node, "router");
    assert.match(described[0].detail, /plan-and-execute/);
    assert.match(described[0].detail, /Multi-step outage/);

    assert.equal(described[3].label, "Ação");
    assert.match(described[3].detail, /list_alerts/);
    assert.match(described[3].codeBlock ?? "", /"payment-api"/);

    assert.equal(described[6].label, "Fallback");
    assert.equal(described[6].tone, "warning");
    assert.match(described[6].detail, /openai\/gpt-4o-mini -> meta-llama\/llama-3\.3-70b-instruct:free/);
    assert.match(described[6].detail, /429 rate limit/);

    assert.equal(described[8].label, "Resposta");
    assert.equal(described[8].tone, "success");

    assert.equal(hasFallbackEvent(events), true);
    assert.equal(hasFallbackEvent(events.filter((e) => e.type !== "fallback")), false);
  });

  await t.test("formatting helpers render deterministic tabular-friendly telemetry strings", () => {
    assert.equal(formatLatencyMs(undefined), "—");
    assert.equal(formatLatencyMs(245), "245 ms");
    assert.equal(formatLatencyMs(1850), "1.85 s");

    assert.equal(formatTokenCount(undefined), "—");
    assert.equal(formatTokenCount(1420), "1420 tok");

    assert.equal(formatCostUsd(undefined), "—");
    assert.equal(formatCostUsd(0), "$0.0000");
    assert.equal(formatCostUsd(0.0125), "$0.0125");
  });

  await t.test("parseChatApiResponse parses 200 OK, 202 Pending Approval, and error payloads", () => {
    const okParsed = parseChatApiResponse(
      200,
      {
        requestId: "req-200",
        conversationId: "conv-1",
        answer: "Tudo normal.",
        selectedRoute: "react",
        trace: [{ type: "answer", node: "response", content: "Tudo normal.", timestamp: 100 }],
        metrics: { llmCalls: 1, latencyMs: 80, promptTokens: 50, modelUsed: "meta:free" },
      },
      "req-header-fallback"
    );
    assert.equal(okParsed.kind, "success");
    if (okParsed.kind === "success") {
      assert.equal(okParsed.data.requestId, "req-200");
      assert.equal(okParsed.data.trace.length, 1);
      assert.equal(okParsed.data.selectedRoute, "react");
    }

    const acceptedParsed = parseChatApiResponse(
      202,
      {
        status: "pending_approval",
        approvalId: "apr-123",
        conversationId: "conv-2",
        action: "open_incident",
        tool: "open_incident",
        args: { service: "checkout", severity: "critical" },
        message: "Confirmar abertura de incidente crítico?",
      },
      "req-202-header"
    );
    assert.equal(acceptedParsed.kind, "pending_approval");
    if (acceptedParsed.kind === "pending_approval") {
      assert.equal(acceptedParsed.data.approvalId, "apr-123");
      assert.equal(acceptedParsed.data.requestId, "req-202-header");
      assert.equal(acceptedParsed.data.action, "open_incident");
      assert.deepEqual(acceptedParsed.data.args, { service: "checkout", severity: "critical" });
    }

    const errParsed = parseChatApiResponse(
      503,
      { error: "model_unavailable" },
      "req-503-header"
    );
    assert.equal(errParsed.kind, "error");
    if (errParsed.kind === "error") {
      assert.equal(errParsed.statusCode, 503);
      assert.equal(errParsed.errorCode, "model_unavailable");
      assert.equal(errParsed.requestId, "req-503-header");
      assert.equal(
        errParsed.message,
        mapApiErrorToMessage(503, "model_unavailable")
      );
    }
  });
});
