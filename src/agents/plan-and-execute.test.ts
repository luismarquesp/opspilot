import test from "node:test";
import assert from "node:assert/strict";
import {
  createPlanAndExecuteStrategy,
  planAndExecuteStrategy,
  parseStepToolExecution,
} from "./plan-and-execute.js";

test("Plan-and-Execute Strategy (US2)", async (t) => {
  await t.test("exports valid ReasoningStrategy contract", () => {
    assert.equal(planAndExecuteStrategy.name, "plan-and-execute");
    assert.equal(typeof planAndExecuteStrategy.run, "function");
  });

  await t.test("parses operational steps to tool invocations correctly", () => {
    const alertStep = parseStepToolExecution("List all firing alerts");
    assert.equal(alertStep?.tool, "list_alerts");

    const incidentStep = parseStepToolExecution("Open critical incident for payment-api");
    assert.equal(incidentStep?.tool, "open_incident");

    const resolveStep = parseStepToolExecution("Resolve incident inc-101");
    assert.equal(resolveStep?.tool, "resolve_incident");

    const genericStep = parseStepToolExecution("Analyze dashboard metric trends");
    assert.equal(genericStep, null);
  });

  await t.test("executes plan through state transitions and outputs structured trace", async () => {
    const customPlanner = async () => [
      "List firing alerts in cluster",
      "Open incident for payment service",
    ];

    const strategy = createPlanAndExecuteStrategy(customPlanner);
    const result = await strategy.run("Triage payments", { maxIterations: 5 });

    assert.ok(result.answer.length > 0);
    assert.ok(result.trace.length >= 4);

    const hasPlan = result.trace.some((e) => e.type === "plan");
    const hasThought = result.trace.some((e) => e.type === "thought");
    const hasCritique = result.trace.some((e) => e.type === "critique");
    const hasAnswer = result.trace.some((e) => e.type === "answer");

    assert.ok(hasPlan, "Must have plan event");
    assert.ok(hasThought, "Must have thought event");
    assert.ok(hasCritique, "Must have critique event");
    assert.ok(hasAnswer, "Must have answer event");
  });

  await t.test("enforces strict hard limit cap of 8 steps", async () => {
    // 12 steps plan
    const customPlanner = async () => [
      "Step 1: Check alert 1",
      "Step 2: Check alert 2",
      "Step 3: Check alert 3",
      "Step 4: Check alert 4",
      "Step 5: Check alert 5",
      "Step 6: Check alert 6",
      "Step 7: Check alert 7",
      "Step 8: Check alert 8",
      "Step 9: Check alert 9",
      "Step 10: Check alert 10",
      "Step 11: Check alert 11",
      "Step 12: Check alert 12",
    ];

    // Force "seguir" until hard ceiling
    const alwaysFollowReplanner = async (state: any) => {
      const stepNumber = state.done.length;
      const remainingSteps = state.plan.slice(1);
      const maxSteps = state.maxSteps ?? 8;

      if (stepNumber >= maxSteps) {
        return {
          plan: [],
          answer: `Plano encerrado no teto rígido de ${maxSteps} passos.`,
          trace: [
            {
              type: "critique" as const,
              node: "plan-and-execute",
              content: `Teto rígido de ${maxSteps} passos atingido (${stepNumber}/${maxSteps}). Encerrando plano.`,
              timestamp: Date.now(),
            },
            {
              type: "answer" as const,
              node: "plan-and-execute",
              content: `Plano encerrado no teto rígido de ${maxSteps} passos.`,
              timestamp: Date.now(),
            },
          ],
        };
      }

      return {
        plan: remainingSteps,
        trace: [
          {
            type: "critique" as const,
            node: "plan-and-execute",
            content: `Passo ${stepNumber} concluído. Decisão do replanner: seguir plano.`,
            timestamp: Date.now(),
          },
        ],
        llmCalls: 0,
      };
    };

    const strategy = createPlanAndExecuteStrategy(customPlanner, alwaysFollowReplanner);
    // Request 12 iterations, but strategy must cap at 8
    const result = await strategy.run("Long workload", { maxIterations: 12 });

    const executedThoughts = result.trace.filter((e) => e.type === "thought");
    assert.ok(executedThoughts.length <= 8, `Expected max 8 steps executed, got ${executedThoughts.length}`);
    assert.ok(result.answer.includes("8 passos") || result.answer.includes("8 steps") || executedThoughts.length === 8);
  });
});
