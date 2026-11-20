import test from "node:test";
import assert from "node:assert/strict";
import {
  createLogger,
  formatLogLine,
  formatTraceLogLine,
  formatRequestLogLine,
  sanitizeLogMetadata,
  log,
  setLogSink,
  resetLogSink,
} from "./logger.js";
import type { TraceEvent } from "../agents/types.js";

test("src/obs/logger.ts — Single-Line JSON Metadata-Only Logging (US4)", async (t) => {
  await t.test("emits exactly 1 single-line JSON entry per event via injectable sink", () => {
    const lines: string[] = [];
    const customLogger = createLogger((line) => lines.push(line));

    customLogger.info({
      requestId: "req-001",
      type: "done",
      node: "resposta",
      route: "react",
      tokens: 185,
    });

    assert.equal(lines.length, 1);
    assert.equal(lines[0].includes("\n"), false);
    assert.equal(lines[0].includes("\r"), false);

    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(parsed.level, "info");
    assert.equal(parsed.requestId, "req-001");
    assert.equal(parsed.type, "done");
    assert.equal(parsed.node, "resposta");
    assert.equal(parsed.route, "react");
    assert.equal(parsed.tokens, 185);
    assert.ok(typeof parsed.timestamp === "string" && parsed.timestamp.length > 0);
  });

  await t.test("strictly strips raw payload fields (content, message, answer, args, prompt, reason) — metadata only", () => {
    const lines: string[] = [];
    const customLogger = createLogger((line) => lines.push(line));

    const secretSentinel = "SECRET_USER_PROMPT_PAYLOAD_12345";
    const answerSentinel = "FINAL_SECRET_ANSWER_WITH_\nNEWLINE";
    const argSentinel = "sk-secret-token-value-999";

    customLogger.info({
      requestId: "req-002",
      conversationId: "conv-abc",
      node: "react",
      type: "action",
      tool: "open_incident",
      message: secretSentinel,
      userMessage: secretSentinel,
      content: "Long raw content\nwith newline",
      answer: answerSentinel,
      prompt: secretSentinel,
      args: { apiKey: argSentinel, severity: "critical" },
      observation: secretSentinel,
      summary: secretSentinel,
      reason: secretSentinel,
      payload: {
        content: secretSentinel,
        args: { token: argSentinel },
        route: "plan-and-execute",
      },
      customUnlistedField: secretSentinel,
      latencyMs: 42,
    });

    assert.equal(lines.length, 1);
    const rawLine = lines[0];
    assert.equal(rawLine.includes("\n"), false);
    assert.equal(rawLine.includes(secretSentinel), false, "Must never log raw message/prompt/reason/observation");
    assert.equal(rawLine.includes(answerSentinel), false, "Must never log raw answer");
    assert.equal(rawLine.includes(argSentinel), false, "Must never log raw tool arg values");

    const parsed = JSON.parse(rawLine) as Record<string, unknown>;
    assert.equal(parsed.requestId, "req-002");
    assert.equal(parsed.conversationId, "conv-abc");
    assert.equal(parsed.node, "react");
    assert.equal(parsed.type, "action");
    assert.equal(parsed.tool, "open_incident");
    assert.equal(parsed.route, "plan-and-execute");
    assert.equal(parsed.latencyMs, 42);
    assert.equal(parsed.contentLength, "Long raw content\nwith newline".length);
    assert.deepEqual(parsed.argKeys, ["apiKey", "severity"]);
    assert.equal(parsed.content, undefined);
    assert.equal(parsed.args, undefined);
    assert.equal(parsed.message, undefined);
    assert.equal(parsed.answer, undefined);
    assert.equal(parsed.reason, undefined);
  });

  await t.test("formatTraceLogLine formats route, action, fallback, and answer events with metadata only", () => {
    const events: TraceEvent[] = [
      {
        type: "route",
        node: "router",
        route: "plan-and-execute",
        reason: "Sensitive prompt rationale should not be logged",
        content: "Rota selecionada: plan-and-execute",
        timestamp: 1000,
      },
      {
        type: "action",
        node: "plan-and-execute",
        tool: "list_alerts",
        args: { status: "firing", secretFilter: "DO_NOT_LOG" },
        content: "Call list_alerts",
        timestamp: 1001,
      },
      {
        type: "fallback",
        node: "plan-and-execute",
        fromModel: "anthropic/claude-3.5-sonnet",
        toModel: "openai/gpt-4o-mini",
        reason: "429 secret provider header",
        content: "Fallback triggered",
        timestamp: 1002,
      },
      {
        type: "answer",
        node: "response",
        content: "Sensitive full answer text",
        timestamp: 1003,
      },
    ];

    const lines = events.map((ev, seq) =>
      formatTraceLogLine(ev, { requestId: "req-trace-1", conversationId: "conv-1", seq }, "2026-11-17T10:00:00.000Z")
    );

    assert.equal(lines.length, 4);

    const parsed0 = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(parsed0.event, "trace_event");
    assert.equal(parsed0.type, "route");
    assert.equal(parsed0.node, "router");
    assert.equal(parsed0.route, "plan-and-execute");
    assert.equal(parsed0.seq, 0);
    assert.equal(lines[0].includes("Sensitive prompt rationale"), false);

    const parsed1 = JSON.parse(lines[1]) as Record<string, unknown>;
    assert.equal(parsed1.type, "action");
    assert.equal(parsed1.tool, "list_alerts");
    assert.deepEqual(parsed1.argKeys, ["status", "secretFilter"]);
    assert.equal(lines[1].includes("DO_NOT_LOG"), false);

    const parsed2 = JSON.parse(lines[2]) as Record<string, unknown>;
    assert.equal(parsed2.type, "fallback");
    assert.equal(parsed2.fromModel, "anthropic/claude-3.5-sonnet");
    assert.equal(parsed2.toModel, "openai/gpt-4o-mini");

    const parsed3 = JSON.parse(lines[3]) as Record<string, unknown>;
    assert.equal(parsed3.type, "answer");
    assert.equal(parsed3.node, "response");
    assert.equal(parsed3.contentLength, "Sensitive full answer text".length);
    assert.equal(lines[3].includes("Sensitive full answer text"), false);
  });

  await t.test("global log.info / setLogSink / resetLogSink and pure helpers work deterministically", () => {
    const captured: string[] = [];
    setLogSink((line) => captured.push(line));
    try {
      log.info({
        requestId: "req-global-1",
        type: "done",
        node: "resposta",
        route: "reflection",
        tokens: 310,
      });

      assert.equal(captured.length, 1);
      const parsed = JSON.parse(captured[0]) as Record<string, unknown>;
      assert.equal(parsed.requestId, "req-global-1");
      assert.equal(parsed.type, "done");
      assert.equal(parsed.node, "resposta");
      assert.equal(parsed.route, "reflection");
      assert.equal(parsed.tokens, 310);

      const reqLine = formatRequestLogLine({
        requestId: "req-global-1",
        statusCode: 200,
        latencyMs: 120,
        answer: "SHOULD_NOT_APPEAR",
      });
      assert.equal(reqLine.includes("SHOULD_NOT_APPEAR"), false);
      assert.equal((JSON.parse(reqLine) as Record<string, unknown>).event, "request_completed");

      const cleaned = sanitizeLogMetadata({ content: "abc", requestId: "r1" });
      assert.deepEqual(cleaned, { requestId: "r1", contentLength: 3 });

      const directLine = formatLogLine("warn", { requestId: "r2", errorCode: "timeout" }, "2026-11-17T00:00:00.000Z");
      assert.equal((JSON.parse(directLine) as Record<string, unknown>).level, "warn");
    } finally {
      resetLogSink();
    }
  });
});
