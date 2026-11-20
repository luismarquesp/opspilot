import test from "node:test";
import assert from "node:assert/strict";
import {
  createProductionGraph,
  runProductionGraph,
  routerNode,
  contextNode,
  ROUTER_DECISION_TABLE_PROMPT,
  ProductionGraphState,
} from "./production-graph.js";
import { RouteDecisionSchema, type ReasoningStrategy, type StrategyResult } from "./types.js";

// Mock helper to create structured output models for router testing
function createMockRouterModel(verdict: { route: "react" | "plan-and-execute" | "reflection"; reason: string }) {
  return {
    withStructuredOutput: (_schema: unknown) => ({
      invoke: async (_messages: unknown[]) => verdict,
    }),
  };
}

function createFaultyRouterModel() {
  return {
    withStructuredOutput: (_schema: unknown) => ({
      invoke: async () => {
        throw new Error("OpenRouter classification failure / 503 Service Unavailable");
      },
    }),
  };
}

function makeFakeStrategy(name: string, answer: string): ReasoningStrategy {
  return {
    name,
    run: async (): Promise<StrategyResult> => ({
      answer,
      trace: [
        { type: "thought", node: name, content: `Executing ${name}`, timestamp: Date.now() },
        { type: "answer", node: name, content: answer, timestamp: Date.now() + 1 },
      ],
      metrics: {
        llmCalls: 1,
        latencyMs: 15,
      },
    }),
  };
}

test("User Story 1: Autonomous Operational Strategy Routing (US1 - MVP)", async (t) => {
  await t.test("router prompt contains operational decision table with all 3 strategies", () => {
    assert.ok(ROUTER_DECISION_TABLE_PROMPT.includes("react"));
    assert.ok(ROUTER_DECISION_TABLE_PROMPT.includes("plan-and-execute"));
    assert.ok(ROUTER_DECISION_TABLE_PROMPT.includes("reflection"));
    assert.ok(ROUTER_DECISION_TABLE_PROMPT.includes("Tabela de Decisão") || ROUTER_DECISION_TABLE_PROMPT.includes("tabela de decisão"));
  });

  await t.test("classifies direct alert inspection to react strategy and emits route trace event", async () => {
    const mockModel = createMockRouterModel({
      route: "react",
      reason: "Consulta direta de alertas ativos de passo único.",
    });

    const state = {
      input: "quais alertas estão firing no cluster agora?",
      conversationId: "conv-1",
      trace: [],
      llmCalls: 0,
      history: [],
      done: [],
    } as unknown as typeof ProductionGraphState.State;

    const res = await routerNode(state, mockModel);
    assert.equal(res.selectedRoute, "react");
    assert.ok(res.routeReason?.includes("Consulta direta"));
    assert.equal(res.llmCalls, 1);
    assert.equal(res.trace?.length, 1);
    assert.equal(res.trace[0].type, "route");
    assert.equal(res.trace[0].node, "router");
    if (res.trace[0].type === "route") {
      assert.equal(res.trace[0].route, "react");
      assert.ok(res.trace[0].reason.includes("Consulta direta"));
    }
  });

  await t.test("classifies multi-step orchestration to plan-and-execute strategy", async () => {
    const mockModel = createMockRouterModel({
      route: "plan-and-execute",
      reason: "Orquestração sequencial de incidentes com múltiplas etapas e dependências.",
    });

    const state = {
      input: "investigue os alertas, abra um incidente crítico e avise os serviços dependentes",
      conversationId: "conv-1",
      trace: [],
      llmCalls: 0,
      history: [],
    } as unknown as typeof ProductionGraphState.State;

    const res = await routerNode(state, mockModel);
    assert.equal(res.selectedRoute, "plan-and-execute");
    assert.equal(res.trace?.[0].type, "route");
    assert.equal(res.trace?.[0].node, "router");
    if (res.trace?.[0].type === "route") {
      assert.equal(res.trace[0].route, "plan-and-execute");
    }
  });

  await t.test("classifies high-precision validation request to reflection strategy", async () => {
    const mockModel = createMockRouterModel({
      route: "reflection",
      reason: "Validação rigorosa de hipóteses contra observações reais sem alucinação.",
    });

    const state = {
      input: "verifique minuciosamente a causa-raiz do incidente crítico e certifique-se contra as observações que não há alucinação",
      conversationId: "conv-1",
      trace: [],
      llmCalls: 0,
      history: [],
    } as unknown as typeof ProductionGraphState.State;

    const res = await routerNode(state, mockModel);
    assert.equal(res.selectedRoute, "reflection");
    assert.equal(res.trace?.[0].type, "route");
    assert.equal(res.trace?.[0].node, "router");
    if (res.trace?.[0].type === "route") {
      assert.equal(res.trace[0].route, "reflection");
    }
  });

  await t.test("router gracefully falls back to react when LLM classification fails", async () => {
    const faultyModel = createFaultyRouterModel();
    const state = {
      input: "Qualquer comando operacional",
      conversationId: "conv-1",
      trace: [],
      llmCalls: 0,
      history: [],
    } as unknown as typeof ProductionGraphState.State;

    const res = await routerNode(state, faultyModel);
    assert.equal(res.selectedRoute, "react");
    assert.ok(res.routeReason?.includes("Fallback"));
    assert.equal(res.trace?.[0].type, "route");
    assert.equal(res.trace?.[0].node, "router");
    if (res.trace?.[0].type === "route") {
      assert.equal(res.trace[0].route, "react");
    }
  });
});

test("User Story 2: Operator Strategy Override via strategyOverride (US2)", async (t) => {
  await t.test("strategyOverride forces plan-and-execute, skips LLM calls, and notes override in route event", async () => {
    const countingModel = {
      withStructuredOutput: () => ({
        invoke: async () => {
          throw new Error("Should not be invoked when override is present");
        },
      }),
    };

    const state = {
      input: "quais alertas estão firing?",
      conversationId: "conv-1",
      strategyOverride: "plan-and-execute",
      trace: [],
      llmCalls: 0,
      history: [],
    } as unknown as typeof ProductionGraphState.State;

    const res = await routerNode(state, countingModel);
    assert.equal(res.selectedRoute, "plan-and-execute");
    assert.ok(res.routeReason?.includes("Manual override"));
    assert.equal(res.llmCalls, undefined); // 0 LLM calls made
    assert.equal(res.trace?.[0].type, "route");
    assert.equal(res.trace?.[0].node, "router");
    if (res.trace?.[0].type === "route") {
      assert.equal(res.trace[0].route, "plan-and-execute");
      assert.ok(res.trace[0].reason.includes("Manual override"));
    }
  });

  await t.test("strategyOverride accepts camelCase planExecute and maps to plan-and-execute", async () => {
    const state = {
      input: "Execute runbook",
      conversationId: "conv-1",
      strategyOverride: "planExecute",
      trace: [],
      llmCalls: 0,
      history: [],
    } as unknown as typeof ProductionGraphState.State;

    const res = await routerNode(state);
    assert.equal(res.selectedRoute, "plan-and-execute");
  });
});

test("User Story 3: 100% Comprehensive Node Attribution in Trace Events (US3)", async (t) => {
  await t.test("all trace events in full runProductionGraph execution carry valid non-empty node property", async () => {
    const mockModel = createMockRouterModel({
      route: "react",
      reason: "Triagem pontual",
    });

    const fakeStrategies = {
      react: makeFakeStrategy("react", "Serviços 100% operacionais."),
    };

    const output = await runProductionGraph(
      {
        input: "Listar alertas ativos",
        conversationId: "conv-node-attribution",
      },
      {
        customModel: mockModel,
        customStrategies: fakeStrategies,
      }
    );

    assert.ok(output.trace.length >= 2, "Trace must have multiple events");
    for (const event of output.trace) {
      assert.ok(
        typeof event.node === "string" && event.node.trim().length > 0,
        `Event of type ${event.type} must have non-empty node attribute, got: ${event.node}`
      );
      assert.ok(
        ["context", "router", "react", "plan-and-execute", "reflection", "response"].includes(event.node),
        `Event node ${event.node} must match one of the graph node identifiers`
      );
    }
  });
});

test("User Story 4: Unified Production Graph State Pipeline Transitions (US4)", async (t) => {
  await t.test("contextNode builds prompt messages and enforces budgets", async () => {
    const state = {
      input: "Verifique pagamentos",
      conversationId: "conv-1",
      history: [{ role: "user" as const, content: "Olá" }],
      summary: "Resumo anterior",
      recalledMemories: ["Fato importante: payment usa retry"],
    } as unknown as typeof ProductionGraphState.State;

    const res = await contextNode(state);
    assert.ok(res.builtContext);
    assert.ok(res.builtContext.messages.length > 0);
    assert.ok(res.builtContext.breakdown);
  });

  await t.test("end-to-end execution through plan-and-execute path", async () => {
    const mockModel = createMockRouterModel({
      route: "plan-and-execute",
      reason: "Complex multi-step plan",
    });

    const fakeStrategies = {
      "plan-and-execute": makeFakeStrategy("plan-and-execute", "Plano finalizado."),
    };

    const output = await runProductionGraph(
      {
        input: "Orquestrar mitigação do cluster",
        conversationId: "conv-pe-test",
      },
      {
        customModel: mockModel,
        customStrategies: fakeStrategies,
      }
    );

    assert.equal(output.selectedRoute, "plan-and-execute");
    assert.equal(output.answer, "Plano finalizado.");
    assert.ok(output.metrics.latencyMs >= 0);
    assert.ok(output.trace.some((e) => e.type === "route" && e.node === "router"));
    assert.ok(output.trace.some((e) => e.node === "plan-and-execute"));
  });

  await t.test("end-to-end execution through reflection path", async () => {
    const mockModel = createMockRouterModel({
      route: "reflection",
      reason: "Auditoria crítica",
    });

    const fakeStrategies = {
      reflection: makeFakeStrategy("reflection", "Diagnóstico crítico aprovado."),
    };

    const output = await runProductionGraph(
      {
        input: "Verifique com reflexão",
        conversationId: "conv-ref-test",
      },
      {
        customModel: mockModel,
        customStrategies: fakeStrategies,
      }
    );

    assert.equal(output.selectedRoute, "reflection");
    assert.equal(output.answer, "Diagnóstico crítico aprovado.");
    assert.ok(output.trace.some((e) => e.node === "reflection"));
  });
});
