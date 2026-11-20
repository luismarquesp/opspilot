import test from "node:test";
import assert from "node:assert/strict";
import {
  formatTraceEvent,
  formatTrace,
  formatMetrics,
  countAiMessages,
  lastText,
  toTrace,
} from "./trace.js";
import type { TraceEvent, StrategyMetrics } from "./types.js";

test("Trace Serialization & Formatting", async (t) => {
  await t.test("formats thought trace event correctly", () => {
    const event: TraceEvent = {
      type: "thought",
      node: "react",
      content: "Investigating active alerts",
      timestamp: 1000,
    };
    const formatted = formatTraceEvent(event);
    assert.equal(formatted, "[THOUGHT] Investigating active alerts");
  });

  await t.test("formats action trace event with tool name and serialized args", () => {
    const event: TraceEvent = {
      type: "action",
      node: "react",
      tool: "list_alerts",
      args: { status: "firing" },
      content: "Call list_alerts",
      timestamp: 1001,
    };
    const formatted = formatTraceEvent(event);
    assert.equal(formatted, '[ACTION]  list_alerts({"status":"firing"})');
  });

  await t.test("formats observation and answer events", () => {
    const obsEvent: TraceEvent = {
      type: "observation",
      node: "react",
      content: "Found 2 alerts",
      timestamp: 1002,
    };
    assert.equal(formatTraceEvent(obsEvent), "[OBSERV.] Found 2 alerts");

    const ansEvent: TraceEvent = {
      type: "answer",
      node: "response",
      content: "All services healthy",
      timestamp: 1003,
    };
    assert.equal(formatTraceEvent(ansEvent), "[ANSWER]  All services healthy");
  });

  await t.test("formats route trace event correctly", () => {
    const routeEvent: TraceEvent = {
      type: "route",
      node: "router",
      route: "react",
      reason: "Direct query for alerts",
      content: "Rota selecionada: [REACT] - Direct query for alerts",
      timestamp: 1004,
    };
    assert.equal(formatTraceEvent(routeEvent), "[ROUTE]   Rota selecionada: [REACT] - Direct query for alerts");
  });

  await t.test("formats full trace sequence", () => {
    const trace: TraceEvent[] = [
      { type: "thought", node: "react", content: "Checking", timestamp: 1 },
      {
        type: "action",
        node: "react",
        tool: "list_alerts",
        args: { status: "firing" },
        content: "Call",
        timestamp: 2,
      },
      { type: "answer", node: "response", content: "Done", timestamp: 3 },
    ];
    const output = formatTrace(trace);
    assert.ok(output.includes("[THOUGHT] Checking"));
    assert.ok(output.includes('[ACTION]  list_alerts({"status":"firing"})'));
    assert.ok(output.includes("[ANSWER]  Done"));
  });

  await t.test("formats metrics correctly", () => {
    const metrics: StrategyMetrics = {
      llmCalls: 3,
      latencyMs: 1250,
    };
    const formatted = formatMetrics(metrics);
    assert.equal(formatted, "Metrics: LLM Calls: 3 | Latency: 1250ms");
  });

  await t.test("counts AI messages and extracts lastText accurately", () => {
    const messages = [
      { role: "user", content: "Help" },
      {
        role: "assistant",
        content: "Thinking...",
        tool_calls: [{ name: "list_alerts", args: { status: "firing" } }],
      },
      { role: "tool", content: '[{"id":"alt-1"}]' },
      { role: "assistant", content: "I found alt-1" },
    ];

    assert.equal(countAiMessages(messages), 2);
    assert.equal(lastText(messages), "I found alt-1");

    const trace = toTrace(messages, "react");
    assert.equal(trace.length, 4);
    assert.equal(trace[0].type, "thought");
    assert.equal(trace[0].node, "react");
    assert.equal(trace[1].type, "action");
    assert.equal(trace[1].node, "react");
    assert.equal(trace[2].type, "observation");
    assert.equal(trace[2].node, "react");
    assert.equal(trace[3].type, "answer");
    assert.equal(trace[3].node, "react");
  });

  await t.test("formats fallback trace event correctly", () => {
    const fallbackEvent: TraceEvent = {
      type: "fallback",
      node: "react",
      fromModel: "anthropic/claude-3.5-sonnet",
      toModel: "openai/gpt-4o-mini",
      reason: "429 Rate limit exceeded",
      content: "Switching model to fallback",
      timestamp: 1005,
    };
    const formatted = formatTraceEvent(fallbackEvent);
    assert.equal(
      formatted,
      "[FALLB.]  anthropic/claude-3.5-sonnet -> openai/gpt-4o-mini: 429 Rate limit exceeded"
    );
  });
});

