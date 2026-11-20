import test from "node:test";
import assert from "node:assert/strict";
import { AIMessage } from "@langchain/core/messages";
import { createReactStrategy, reactStrategy, type RunnableAgent } from "./react.js";
import { ResilientChatModel } from "./model.js";

test("ReAct Strategy (US1)", async (t) => {
  await t.test("exports valid ReasoningStrategy contract", () => {
    assert.equal(reactStrategy.name, "react");
    assert.equal(typeof reactStrategy.run, "function");
  });

  await t.test("executes mock agent flow, captures trace and metrics", async () => {
    let capturedRecursionLimit: number | undefined;

    const mockAgent: RunnableAgent = {
      async invoke(_input, config) {
        capturedRecursionLimit = config?.recursionLimit;
        return {
          messages: [
            { role: "user", content: "Investigate firing alerts" },
            {
              role: "assistant",
              content: "Checking firing alerts",
              tool_calls: [
                {
                  name: "list_alerts",
                  args: { status: "firing" },
                  id: "call-1",
                },
              ],
            },
            { role: "tool", content: JSON.stringify([{ id: "alt-001" }]) },
            {
              role: "assistant",
              content: "Found 3 firing alerts. Incident response initiated.",
            },
          ],
        };
      },
    };

    const strategy = createReactStrategy(mockAgent);
    const result = await strategy.run("Investigate firing alerts", { maxIterations: 4 });

    assert.equal(capturedRecursionLimit, 8);
    assert.ok(result.answer.includes("Found 3 firing alerts"));
    assert.ok(Array.isArray(result.trace));
    assert.equal(result.trace.length, 4);
    assert.equal(result.metrics.llmCalls, 2);
    assert.ok(result.metrics.latencyMs >= 0);

    assert.equal(result.trace[0].type, "thought");
    assert.equal(result.trace[1].type, "action");
    if (result.trace[1].type === "action") {
      assert.equal(result.trace[1].tool, "list_alerts");
    }
    assert.equal(result.trace[2].type, "observation");
    assert.equal(result.trace[3].type, "answer");
  });

  await t.test("executes createReactAgent cleanly with ResilientChatModel and preserves fallback telemetry across bindTools", async () => {
    const mockPrimary = {
      bindTools() {
        return {
          invoke: async () => {
            throw new Error("429 rate limited");
          },
        };
      },
      invoke: async () => {
        throw new Error("429 rate limited");
      },
    };

    const mockBackup = {
      bindTools() {
        return {
          invoke: async () =>
            new AIMessage("O plantão está estável com 2 alertas em monitoração."),
        };
      },
      invoke: async () =>
        new AIMessage("O plantão está estável com 2 alertas em monitoração."),
    };

    const resilientModel = new ResilientChatModel({
      primaryModelName: "primary-model",
      fallbackModelNames: ["backup-model:free"],
      primaryModel: mockPrimary,
      backupModels: [mockBackup],
      stopAfterAttempt: 1,
      node: "react",
    });

    const strategy = createReactStrategy(resilientModel);
    const result = await strategy.run("Como está o plantão hoje?");

    assert.match(result.answer, /plantão está estável/);
    assert.equal(result.metrics.modelUsed, "backup-model:free");
    assert.ok(result.trace.some((e) => e.type === "fallback"));
    const fb = result.trace.find((e) => e.type === "fallback");
    if (fb && fb.type === "fallback") {
      assert.equal(fb.fromModel, "primary-model");
      assert.equal(fb.toModel, "backup-model:free");
      assert.equal(fb.node, "react");
    }
  });
});
