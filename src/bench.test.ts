import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCliArgs,
  BenchArgsSchema,
  BENCHMARK_SCENARIOS,
  formatBenchTable,
  runBench,
  type BenchRow,
} from "./bench.js";
import { InMemoryOpsStore } from "./models/store.js";
import type { ReasoningStrategy, StrategyResult } from "./agents/types.js";

test("Benchmark CLI Parsing & Validation", async (t) => {
  await t.test("parses --scenario and --no-replanner flags correctly", () => {
    const rawArgs = ["--scenario", "C2", "--no-replanner"];
    const parsed = parseCliArgs(rawArgs);
    assert.equal(parsed.scenario, "C2");
    assert.equal(parsed.noReplanner, true);
  });

  await t.test("parses --scenario=C1 notation and shorthand -s", () => {
    const parsed1 = parseCliArgs(["--scenario=C1"]);
    assert.equal(parsed1.scenario, "C1");

    const parsed2 = parseCliArgs(["-s", "C3"]);
    assert.equal(parsed2.scenario, "C3");
  });

  await t.test("validates BenchArgsSchema with defaults and scenario transformations", () => {
    const configDefault = BenchArgsSchema.parse({});
    assert.equal(configDefault.scenario, undefined);
    assert.equal(configDefault.noReplanner, false);

    const configScenario = BenchArgsSchema.parse({ scenario: "c1,c2", noReplanner: true });
    assert.deepEqual(configScenario.scenario, ["C1", "C2"]);
    assert.equal(configScenario.noReplanner, true);

    const configAll = BenchArgsSchema.parse({ scenario: "all" });
    assert.equal(configAll.scenario, undefined);
  });
});

test("Scenario Store State Verifications", async (t) => {
  const [c1, c2, c3] = BENCHMARK_SCENARIOS;

  await t.test("C1 verify: passes when 2 critical alerts found and no incidents opened", async () => {
    const store = new InMemoryOpsStore(true);
    const validResult: StrategyResult = {
      answer: "Atualmente existem 2 alertas críticos disparando no sistema.",
      trace: [],
      metrics: { llmCalls: 1, latencyMs: 100 },
    };

    assert.equal(await c1.verify({ store, result: validResult }), true);

    // Fails if an incident was opened
    store.openIncident({ title: "Unwanted", service: "payment", severity: "critical" });
    assert.equal(await c1.verify({ store, result: validResult }), false);
  });

  await t.test("C2 verify: passes when 3 incidents opened in order and 1st resolved", async () => {
    const store = new InMemoryOpsStore(true);
    store.reset();

    // Open checkout, payment, catalog
    const inc1 = store.openIncident({ title: "Checkout outage", service: "checkout", severity: "warning" });
    store.openIncident({ title: "Payment latency", service: "payment", severity: "warning" });
    store.openIncident({ title: "Catalog sync", service: "catalog", severity: "warning" });

    // Resolve checkout
    store.resolveIncident(inc1.id);

    const dummyResult: StrategyResult = {
      answer: "Incidentes abertos e o primeiro resolvido.",
      trace: [],
      metrics: { llmCalls: 4, latencyMs: 300 },
    };

    assert.equal(await c2.verify({ store, result: dummyResult }), true);

    // Fails if first incident not resolved
    const storeUnresolved = new InMemoryOpsStore(true);
    storeUnresolved.reset();
    storeUnresolved.openIncident({ title: "Checkout outage", service: "checkout", severity: "warning" });
    storeUnresolved.openIncident({ title: "Payment latency", service: "payment", severity: "warning" });
    storeUnresolved.openIncident({ title: "Catalog sync", service: "catalog", severity: "warning" });

    assert.equal(await c2.verify({ store: storeUnresolved, result: dummyResult }), false);
  });

  await t.test("C3 verify: passes when oldest firing alert (payment-api) has incident and answer mentions 2 remaining", async () => {
    const store = new InMemoryOpsStore(true);
    store.reset();
    store.seed();

    // Open incident for oldest firing alert (payment-api, 07:00:00)
    store.openIncident({
      title: "Alerta mais antigo alt-001",
      service: "payment-api",
      severity: "critical",
    });

    const validResult: StrategyResult = {
      answer: "Abri incidente para payment-api (mais antigo). Sobraram 2 alertas disparando.",
      trace: [],
      metrics: { llmCalls: 2, latencyMs: 250 },
    };

    assert.equal(await c3.verify({ store, result: validResult }), true);

    // Fails if wrong service opened
    const storeWrong = new InMemoryOpsStore(true);
    storeWrong.reset();
    storeWrong.openIncident({
      title: "Incidente para database",
      service: "database-cluster",
      severity: "critical",
    });

    assert.equal(await c3.verify({ store: storeWrong, result: validResult }), false);
  });
});

test("Benchmark Table Formatting and Runner Orchestration", async (t) => {
  await t.test("formats consolidated table with all required columns", () => {
    const mockRows: BenchRow[] = [
      { cenario: "C1", estrategia: "react", acerto: "SIM", llmCalls: 2, latencyMs: 1450 },
      { cenario: "C1", estrategia: "plan-and-execute", acerto: "SIM", llmCalls: 3, latencyMs: 2100 },
      { cenario: "C2", estrategia: "react", acerto: "NÃO", llmCalls: 5, latencyMs: 3800 },
    ];

    const table = formatBenchTable(mockRows);
    assert.ok(table.includes("OpsPilot Benchmark Consolidado"));
    assert.ok(table.includes("| Cenário | Estratégia        | Acerto | LLM Calls | Latency (ms) |"));
    assert.ok(table.includes("| C1      | react             | SIM    | 2         | 1450         |"));
    assert.ok(table.includes("| C1      | plan-and-execute  | SIM    | 3         | 2100         |"));
    assert.ok(table.includes("| C2      | react             | NÃO    | 5         | 3800         |"));
  });

  await t.test("runBench executes filtered scenario and resets store per strategy", async () => {
    const testStore = new InMemoryOpsStore(true);
    const mockOutput: string[] = [];
    const logger = (msg: string) => mockOutput.push(msg);

    const mockReact: ReasoningStrategy = {
      name: "react",
      run: async () => ({
        answer: "Existem 2 alertas críticos disparando.",
        trace: [],
        metrics: { llmCalls: 2, latencyMs: 120 },
      }),
    };

    const mockPlan: ReasoningStrategy = {
      name: "plan-and-execute",
      run: async () => ({
        answer: "Encontrados 2 alertas críticos.",
        trace: [],
        metrics: { llmCalls: 3, latencyMs: 180 },
      }),
    };

    const strategies = {
      react: mockReact,
      "plan-and-execute": mockPlan,
    };

    const results = await runBench(
      { scenario: "C1", noReplanner: true },
      strategies,
      testStore,
      logger
    );

    assert.equal(results.length, 2);
    assert.equal(results[0].cenario, "C1");
    assert.equal(results[0].estrategia, "react");
    assert.equal(results[0].acerto, "SIM");

    assert.equal(results[1].cenario, "C1");
    assert.equal(results[1].estrategia, "plan-and-execute");
    assert.equal(results[1].acerto, "SIM");

    const fullLog = mockOutput.join("\n");
    assert.ok(fullLog.includes("OpsPilot Benchmark Suite"));
    assert.ok(fullLog.includes("Flag No-Replanner: true"));
    assert.ok(fullLog.includes("[Cenário C1]"));
    assert.ok(fullLog.includes("OpsPilot Benchmark Consolidado"));
  });
});
