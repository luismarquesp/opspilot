import { z } from "zod";
import { reactStrategy } from "./agents/react.js";
import { planAndExecuteStrategy } from "./agents/plan-and-execute.js";
import { withReflection } from "./agents/reflection.js";
import { formatTrace } from "./agents/trace.js";
import type { ReasoningStrategy, StrategyMetrics, StrategyResult } from "./agents/types.js";

export const SupportedStrategies = [
  "react",
  "plan-and-execute",
  "reflect:react",
  "reflect:plan-and-execute",
] as const;

export type SupportedStrategy = (typeof SupportedStrategies)[number];

export const ArenaArgsSchema = z.object({
  prompt: z
    .string()
    .default("Investigate firing alerts, open an incident for any critical service, and report status"),
  strategies: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => {
      if (Array.isArray(val)) return val;
      return val.split(",").map((s) => s.trim()).filter(Boolean);
    })
    .pipe(z.array(z.enum(SupportedStrategies)))
    .default(["react", "plan-and-execute"]),
  maxIterations: z.coerce.number().int().positive().default(8),
  maxReflection: z.coerce.number().int().nonnegative().default(2),
});

export type ArenaArgs = z.infer<typeof ArenaArgsSchema>;

export function parseCliArgs(argv: string[]): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--prompt" && i + 1 < argv.length) {
      parsed.prompt = argv[++i];
    } else if (arg.startsWith("--prompt=")) {
      parsed.prompt = arg.slice("--prompt=".length);
    } else if (arg === "--strategies" && i + 1 < argv.length) {
      parsed.strategies = argv[++i];
    } else if (arg.startsWith("--strategies=")) {
      parsed.strategies = arg.slice("--strategies=".length);
    } else if (arg === "--max-iterations" && i + 1 < argv.length) {
      parsed.maxIterations = argv[++i];
    } else if (arg.startsWith("--max-iterations=")) {
      parsed.maxIterations = arg.slice("--max-iterations=".length);
    } else if (arg === "--max-reflection" && i + 1 < argv.length) {
      parsed.maxReflection = argv[++i];
    } else if (arg.startsWith("--max-reflection=")) {
      parsed.maxReflection = arg.slice("--max-reflection=".length);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  if (!parsed.prompt && positional.length > 0) {
    parsed.prompt = positional.join(" ");
  }

  return parsed;
}

export function formatSummaryTable(
  entries: Array<{ strategy: string; answerLength: number; metrics: StrategyMetrics }>
): string {
  const header = [
    "======================================================================",
    "                         Arena Summary",
    "======================================================================",
    "| Strategy                   | Answer Length | LLM Calls | Latency (ms) |",
    "|----------------------------|---------------|-----------|--------------|",
  ];

  const rows = entries.map((e) => {
    const stratCol = e.strategy.padEnd(26, " ");
    const lenCol = `${e.answerLength} chars`.padEnd(13, " ");
    const callsCol = String(e.metrics.llmCalls).padEnd(9, " ");
    const latCol = String(e.metrics.latencyMs).padEnd(12, " ");
    return `| ${stratCol} | ${lenCol} | ${callsCol} | ${latCol} |`;
  });

  const footer = ["======================================================================"];

  return [...header, ...rows, ...footer].join("\n");
}

export interface ArenaRunSummary {
  strategy: string;
  result: StrategyResult;
}

export const DEFAULT_STRATEGIES: Record<string, ReasoningStrategy> = {
  react: reactStrategy,
  "plan-and-execute": planAndExecuteStrategy,
  "reflect:react": withReflection(reactStrategy),
  "reflect:plan-and-execute": withReflection(planAndExecuteStrategy),
};

export async function runArena(
  rawArgs: unknown,
  strategiesMap: Record<string, ReasoningStrategy> = DEFAULT_STRATEGIES,
  logger: (msg: string) => void = console.log
): Promise<ArenaRunSummary[]> {
  const args = ArenaArgsSchema.parse(rawArgs);

  logger("============================================================");
  logger("              OpsPilot Strategy Arena");
  logger("============================================================");
  logger(`Input: "${args.prompt}"`);
  logger(`Config: Max Iterations = ${args.maxIterations} | Strategies = ${args.strategies.join(", ")}\n`);

  const summaries: ArenaRunSummary[] = [];

  for (let i = 0; i < args.strategies.length; i++) {
    const strategyName = args.strategies[i];
    const strategy = strategiesMap[strategyName];

    logger("------------------------------------------------------------");
    logger(`[${i + 1}/${args.strategies.length}] Running Strategy: ${strategyName}`);
    logger("------------------------------------------------------------");

    if (!strategy) {
      logger(`Error: Strategy ${strategyName} not found!`);
      continue;
    }

    const result = await strategy.run(args.prompt, {
      maxIterations: args.maxIterations,
    });

    if (result.trace.length > 0) {
      logger(formatTrace(result.trace));
    }
    logger(`\nMetrics: LLM Calls: ${result.metrics.llmCalls} | Latency: ${result.metrics.latencyMs}ms\n`);

    summaries.push({
      strategy: strategyName,
      result,
    });
  }

  const table = formatSummaryTable(
    summaries.map((s) => ({
      strategy: s.strategy,
      answerLength: s.result.answer.length,
      metrics: s.result.metrics,
    }))
  );

  logger(table);

  return summaries;
}

// Auto-run if executed as CLI directly
const isDirectCli = process.argv[1] && (process.argv[1].endsWith("arena.ts") || process.argv[1].endsWith("arena.js"));
if (isDirectCli) {
  const parsed = parseCliArgs(process.argv.slice(2));
  runArena(parsed).catch((err) => {
    console.error("Arena execution failed:", err);
    process.exit(1);
  });
}
