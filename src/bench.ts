import { z } from "zod";
import { reactStrategy } from "./agents/react.js";
import { planAndExecuteStrategy } from "./agents/plan-and-execute.js";
import { store } from "./agents/ops-store.js";
import type { IOpsStore } from "./models/store.js";
import type { ReasoningStrategy, StrategyResult } from "./agents/types.js";

export type ScenarioId = "C1" | "C2" | "C3";

export interface BenchmarkScenario {
  id: ScenarioId;
  name: string;
  prompt: string;
  verify: (context: { store: IOpsStore; result: StrategyResult }) => Promise<boolean> | boolean;
}

export const BENCHMARK_SCENARIOS: readonly BenchmarkScenario[] = [
  {
    id: "C1",
    name: "C1 direto: quantos alertas críticos estão disparando?",
    prompt: "quantos alertas críticos estão disparando?",
    verify: async ({ store: opsStore, result }) => {
      // Estado do store: nenhum incidente foi aberto indevidamente
      const incidents = await opsStore.listIncidents();
      const noIncidents = incidents.length === 0;

      // Resposta textual deve identificar corretamente os 2 alertas críticos (ou citar os IDs alt-001 e alt-002)
      const answerMentionsTwo =
        /\b2\b|dois/i.test(result.answer) ||
        (result.answer.includes("alt-001") && result.answer.includes("alt-002"));

      return noIncidents && answerMentionsTwo;
    },
  },
  {
    id: "C2",
    name: "C2 estruturado: abra três incidentes sev2 para checkout, payment e catalog, nessa mesma ordem, e resolva o primeiro.",
    prompt:
      "abra três incidentes sev2 para checkout, payment e catalog, nessa mesma ordem, e resolva o primeiro.",
    verify: async ({ store: opsStore }) => {
      // Estado do store após rodar: 3 incidentes (qualquer status) na ordem exata e o 1º resolvido
      const incidents = await opsStore.listIncidents("all");
      if (incidents.length !== 3) {
        return false;
      }

      const [inc1, inc2, inc3] = incidents;

      // Ordem dos serviços: checkout, payment, catalog
      const orderMatch =
        inc1.service.toLowerCase().includes("checkout") &&
        inc2.service.toLowerCase().includes("payment") &&
        inc3.service.toLowerCase().includes("catalog");

      // Status do store: o primeiro (checkout) resolvido, os demais abertos
      const statusMatch =
        inc1.status === "resolved" &&
        inc1.resolvedAt !== null &&
        inc2.status === "open" &&
        inc3.status === "open";

      return orderMatch && statusMatch;
    },
  },
  {
    id: "C3",
    name: "C3 dinâmico: dos alertas disparados, abra um incidente para os mais antigo e diga quantos sobraram",
    prompt:
      "dos alertas disparados, abra um incidente para os mais antigo e diga quantos sobraram",
    verify: async ({ store: opsStore, result }) => {
      // Estado do store: exatamente 1 incidente aberto para o alerta mais antigo disparado (payment-api, às 07:00)
      const incidents = await opsStore.listIncidents();
      if (incidents.length !== 1) {
        return false;
      }

      const inc = incidents[0];
      const isOldestService =
        inc.service.toLowerCase().includes("payment") ||
        inc.title.toLowerCase().includes("payment") ||
        inc.title.toLowerCase().includes("alt-001");

      // Resposta textual deve informar quantos sobraram (2 alertas restantes)
      const mentionsTwoRemaining = /\b2\b|dois/i.test(result.answer);

      return isOldestService && mentionsTwoRemaining;
    },
  },
];

export const BenchArgsSchema = z.object({
  scenario: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const raw = Array.isArray(val) ? val.join(",") : val;
      const parts = raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (parts.length === 0 || parts.includes("ALL") || parts.includes("TODOS")) {
        return undefined;
      }
      return parts as ScenarioId[];
    }),
  noReplanner: z.boolean().default(false),
});

export type BenchArgs = z.infer<typeof BenchArgsSchema>;

export function parseCliArgs(argv: string[]): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "--scenario" || arg === "-s") && i + 1 < argv.length) {
      parsed.scenario = argv[++i];
    } else if (arg.startsWith("--scenario=")) {
      parsed.scenario = arg.slice("--scenario=".length);
    } else if (arg === "--no-replanner") {
      parsed.noReplanner = true;
    } else if (arg.startsWith("--no-replanner=")) {
      parsed.noReplanner = arg.slice("--no-replanner=".length).toLowerCase() !== "false";
    }
  }

  return parsed;
}

export interface BenchRow {
  cenario: string;
  estrategia: string;
  acerto: "SIM" | "NÃO";
  llmCalls: number;
  latencyMs: number;
}

export function formatBenchTable(rows: BenchRow[]): string {
  const header = [
    "================================================================================",
    "                           OpsPilot Benchmark Consolidado",
    "================================================================================",
    "| Cenário | Estratégia        | Acerto | LLM Calls | Latency (ms) |",
    "|---------|-------------------|--------|-----------|--------------|",
  ];

  const formattedRows = rows.map((r) => {
    const cenCol = r.cenario.padEnd(7, " ");
    const stratCol = r.estrategia.padEnd(17, " ");
    const acertoCol = r.acerto.padEnd(6, " ");
    const callsCol = String(r.llmCalls).padEnd(9, " ");
    const latCol = String(r.latencyMs).padEnd(12, " ");
    return `| ${cenCol} | ${stratCol} | ${acertoCol} | ${callsCol} | ${latCol} |`;
  });

  const footer = [
    "================================================================================",
  ];

  return [...header, ...formattedRows, ...footer].join("\n");
}

export const BENCH_STRATEGIES: Record<string, ReasoningStrategy> = {
  react: reactStrategy,
  "plan-and-execute": planAndExecuteStrategy,
};

export async function runBench(
  rawArgs: unknown,
  strategiesMap: Record<string, ReasoningStrategy> = BENCH_STRATEGIES,
  opsStore: IOpsStore = store,
  logger: (msg: string) => void = console.log
): Promise<BenchRow[]> {
  const args = BenchArgsSchema.parse(rawArgs);

  const selectedScenarios = BENCHMARK_SCENARIOS.filter((sc) => {
    if (!args.scenario) return true;
    return args.scenario.includes(sc.id);
  });

  logger("================================================================================");
  logger("                        OpsPilot Benchmark Suite");
  logger("================================================================================");
  logger(`Cenários: ${selectedScenarios.map((s) => s.id).join(", ")}`);
  logger(`Estratégias: ${Object.keys(strategiesMap).join(", ")}`);
  logger(`Flag No-Replanner: ${args.noReplanner}\n`);

  const results: BenchRow[] = [];

  for (const scenario of selectedScenarios) {
    logger("--------------------------------------------------------------------------------");
    logger(`[Cenário ${scenario.id}] ${scenario.name}`);
    logger(`Prompt: "${scenario.prompt}"`);
    logger("--------------------------------------------------------------------------------");

    for (const [strategyName, strategy] of Object.entries(strategiesMap)) {
      logger(`\n>> Executando ${strategyName}...`);

      // Reseta e semeia o store antes de cada execução para garantir estado limpo
      await opsStore.reset();
      await opsStore.seed();

      let runResult: StrategyResult;
      try {
        runResult = await strategy.run(scenario.prompt, {
          noReplanner: args.noReplanner,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger(`   [ERRO] Falha na execução: ${errMsg}`);
        runResult = {
          answer: `Erro: ${errMsg}`,
          trace: [],
          metrics: { llmCalls: 0, latencyMs: 0 },
        };
      }

      // Valida o acerto no estado do store e na resposta
      const passed = await scenario.verify({ store: opsStore, result: runResult });
      const acerto = passed ? "SIM" : "NÃO";

      logger(`   Acerto: ${acerto} | LLM Calls: ${runResult.metrics.llmCalls} | Latency: ${runResult.metrics.latencyMs}ms`);

      results.push({
        cenario: scenario.id,
        estrategia: strategyName,
        acerto,
        llmCalls: runResult.metrics.llmCalls,
        latencyMs: runResult.metrics.latencyMs,
      });
    }
    logger("");
  }

  const table = formatBenchTable(results);
  logger(table);

  return results;
}

// Auto-execução ao rodar diretamente via CLI
const isDirectCli =
  process.argv[1] &&
  (process.argv[1].endsWith("bench.ts") || process.argv[1].endsWith("bench.js"));

if (isDirectCli) {
  const parsed = parseCliArgs(process.argv.slice(2));
  runBench(parsed).catch((err) => {
    console.error("Bench execution failed:", err);
    process.exit(1);
  });
}
