import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCliArgs,
  formatSummaryTable,
  ArenaArgsSchema,
  runArena,
} from "./arena.js";
import type { ReasoningStrategy, StrategyResult } from "./agents/types.js";

test("Arena Benchmarking CLI (US3)", async (t) => {
  await t.test("parses CLI flags correctly", () => {
    const rawArgs = [
      "--prompt",
      "Triage cluster alerts",
      "--strategies",
      "react,plan-and-execute",
      "--max-iterations",
      "5",
    ];
    const parsed = parseCliArgs(rawArgs);
    assert.equal(parsed.prompt, "Triage cluster alerts");
    assert.equal(parsed.strategies, "react,plan-and-execute");
    assert.equal(parsed.maxIterations, "5");
  });

  await t.test("parses CLI flags with = notation", () => {
    const rawArgs = [
      "--prompt=Check MySQL outage",
      "--strategies=react",
      "--max-iterations=3",
    ];
    const parsed = parseCliArgs(rawArgs);
    assert.equal(parsed.prompt, "Check MySQL outage");
    assert.equal(parsed.strategies, "react");
    assert.equal(parsed.maxIterations, "3");
  });

  await t.test("parses positional arguments as prompt", () => {
    const rawArgs = [
      "quantos alertas criticos estão disparando?",
      "--strategies",
      "react",
    ];
    const parsed = parseCliArgs(rawArgs);
    assert.equal(parsed.prompt, "quantos alertas criticos estão disparando?");
    assert.equal(parsed.strategies, "react");
  });

  await t.test("validates defaults via ArenaArgsSchema", () => {
    const config = ArenaArgsSchema.parse({});
    assert.ok(config.prompt.length > 0);
    assert.deepEqual(config.strategies, ["react", "plan-and-execute"]);
    assert.equal(config.maxIterations, 8);
  });

  await t.test("formats summary table matching contract structure", () => {
    const entries = [
      {
        strategy: "react",
        answerLength: 84,
        metrics: { llmCalls: 3, latencyMs: 2450 },
      },
      {
        strategy: "reflect:plan-and-execute",
        answerLength: 91,
        metrics: { llmCalls: 6, latencyMs: 4120 },
      },
    ];

    const table = formatSummaryTable(entries);
    assert.ok(table.includes("Arena Summary"));
    assert.ok(table.includes("| Strategy                   | Answer Length | LLM Calls | Latency (ms) |"));
    assert.ok(table.includes("| react                      | 84 chars      | 3         | 2450         |"));
    assert.ok(table.includes("| reflect:plan-and-execute   | 91 chars      | 6         | 4120         |"));
  });

  await t.test("accepts and validates reflected strategy identifiers and maxReflection", () => {
    const config = ArenaArgsSchema.parse({
      strategies: "react,reflect:react,plan-and-execute,reflect:plan-and-execute",
      maxReflection: "3",
    });

    assert.deepEqual(config.strategies, [
      "react",
      "reflect:react",
      "plan-and-execute",
      "reflect:plan-and-execute",
    ]);
    assert.equal(config.maxReflection, 3);
  });

  await t.test("parses CLI flags for --max-reflection", () => {
    const rawArgs = [
      "--strategies",
      "reflect:react,reflect:plan-and-execute",
      "--max-reflection",
      "3",
    ];
    const parsed = parseCliArgs(rawArgs);
    assert.equal(parsed.strategies, "reflect:react,reflect:plan-and-execute");
    assert.equal(parsed.maxReflection, "3");
  });

  await t.test("orchestrates runner across selected strategies including reflected", async () => {
    const mockOutput: string[] = [];
    const logger = (msg: string) => mockOutput.push(msg);

    const mockReactResult: StrategyResult = {
      answer: "Handled by mock react",
      trace: [{ type: "answer", node: "react", content: "Handled by mock react", timestamp: 1 }],
      metrics: { llmCalls: 2, latencyMs: 150 },
    };

    const mockReflectedReactResult: StrategyResult = {
      answer: "Handled by mock reflect:react",
      trace: [
        { type: "answer", node: "react", content: "Handled by mock react", timestamp: 1 },
        { type: "critique", node: "reflection", content: "APPROVED: Validated", timestamp: 2 },
      ],
      metrics: { llmCalls: 3, latencyMs: 220 },
    };

    const mockStrategies: Record<string, ReasoningStrategy> = {
      react: {
        name: "react",
        run: async () => mockReactResult,
      },
      "reflect:react": {
        name: "reflect:react",
        run: async () => mockReflectedReactResult,
      },
    };

    const summaries = await runArena(
      { prompt: "Test prompt", strategies: "react,reflect:react", maxIterations: 4 },
      mockStrategies,
      logger
    );

    assert.equal(summaries.length, 2);
    assert.equal(summaries[0].strategy, "react");
    assert.equal(summaries[1].strategy, "reflect:react");

    const fullLog = mockOutput.join("\n");
    assert.ok(fullLog.includes("OpsPilot Strategy Arena"));
    assert.ok(fullLog.includes("[1/2] Running Strategy: react"));
    assert.ok(fullLog.includes("[2/2] Running Strategy: reflect:react"));
    assert.ok(fullLog.includes("[CRITIQUE]"));
    assert.ok(fullLog.includes("Arena Summary"));
  });
});
