import { z } from "zod";

export const RouteDecisionSchema = z.object({
  route: z
    .enum(["react", "plan-and-execute", "reflection"])
    .describe("Estratégia operacional selecionada"),
  reason: z
    .string()
    .describe("Justificativa da escolha com base na complexidade e criticidade do pedido"),
});

export type RouteDecision = z.infer<typeof RouteDecisionSchema>;

export const TraceEventTypeSchema = z.enum([
  "thought",
  "action",
  "observation",
  "plan",
  "critique",
  "answer",
  "summarize",
  "route",
  "fallback",
]);

export type TraceEventType = z.infer<typeof TraceEventTypeSchema>;

export const BaseTraceEventSchema = z.object({
  type: TraceEventTypeSchema,
  node: z.string().min(1).describe("Nome do nó do grafo que gerou o evento"),
  content: z.string(),
  timestamp: z.number().int().nonnegative(),
});

export const ActionTraceEventSchema = BaseTraceEventSchema.extend({
  type: z.literal("action"),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});

export const RouteTraceEventSchema = BaseTraceEventSchema.extend({
  type: z.literal("route"),
  route: z.enum(["react", "plan-and-execute", "reflection"]),
  reason: z.string(),
});

export const FallbackTraceEventSchema = BaseTraceEventSchema.extend({
  type: z.literal("fallback"),
  fromModel: z.string().min(1),
  toModel: z.string().min(1),
  reason: z.string(),
});

export const TraceEventSchema = z.discriminatedUnion("type", [
  ActionTraceEventSchema,
  RouteTraceEventSchema,
  FallbackTraceEventSchema,
  BaseTraceEventSchema.extend({
    type: z.enum(["thought", "observation", "plan", "critique", "answer", "summarize"]),
  }),
]);

export type ActionTraceEvent = z.infer<typeof ActionTraceEventSchema>;
export type RouteTraceEvent = z.infer<typeof RouteTraceEventSchema>;
export type FallbackTraceEvent = z.infer<typeof FallbackTraceEventSchema>;
export type TraceEvent = z.infer<typeof TraceEventSchema>;

export const ContextBreakdownSchema = z.object({
  system: z.number().int().nonnegative().optional(),
  history: z.number().int().nonnegative().optional(),
  summary: z.number().int().nonnegative().optional(),
  memories: z.number().int().nonnegative().optional(),
  userMessage: z.number().int().nonnegative().optional(),
  totalEstimated: z.number().int().nonnegative().optional(),
});

export type ContextBreakdown = z.infer<typeof ContextBreakdownSchema>;

export const TokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const StrategyMetricsSchema = z.object({
  llmCalls: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  historyMessages: z.number().int().nonnegative().optional(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  contextBreakdown: ContextBreakdownSchema.optional(),
  modelUsed: z.string().optional(),
});

export type StrategyMetrics = z.infer<typeof StrategyMetricsSchema>;

export const StrategyResultSchema = z.object({
  answer: z.string(),
  trace: z.array(TraceEventSchema),
  metrics: StrategyMetricsSchema,
});

export type StrategyResult = z.infer<typeof StrategyResultSchema>;

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MemoryItem {
  fact: string;
  score?: number;
}

export interface ContextBudgets {
  system: number;
  summary: number;
  history: number;
  window?: number;
  memory: number;
}

export interface BuildInput {
  message?: string;
  userMessage?: string;
  systemPrompt?: string;
  summary?: string;
  history?: readonly HistoryMessage[];
  memories?: readonly (string | MemoryItem)[];
  conversationId?: string;
  userId?: string;
  conversations?: {
    summaryOf?: (id?: string) => string | undefined;
    lastMessages?: (id?: string, count?: number) => readonly HistoryMessage[];
  };
  budgets?: Partial<ContextBudgets>;
}

export interface BuildContext {
  messages: Array<{ role: string; content: string }>;
  userPrompt: string;
  breakdown: ContextBreakdown;
  stats: {
    retainedHistoryCount: number;
    evictedHistoryCount: number;
    retainedMemoriesCount: number;
    evictedMemoriesCount: number;
  };
}

export type BuiltContext = BuildContext;

export interface StrategyOptions {
  maxIterations?: number;
  verbose?: boolean;
  noReplanner?: boolean;
  systemPrompt?: string;
  history?: HistoryMessage[];
  summary?: string;
  recalledMemories?: Array<string | MemoryItem>;
  budgets?: Partial<ContextBudgets>;
}

export interface ReasoningStrategy {
  readonly name: string;
  run(input: string, options?: StrategyOptions): Promise<StrategyResult>;
}

export const CritiqueVerdictSchema = z.object({
  approved: z.boolean().describe("true se a resposta estiver fundamentada nas observações; false se contiver erros, contradições ou omissões"),
  feedback: z.string().describe("Se aprovado: síntese da validação; Se reprovado: o que corrigir, em específico e acionável"),
});

export type CritiqueVerdict = z.infer<typeof CritiqueVerdictSchema>;

export const ReflectionOptionsSchema = z.object({
  maxReflection: z.coerce.number().int().nonnegative().default(2),
  criticPrompt: z.string().optional(),
});

export type ReflectionOptions = z.infer<typeof ReflectionOptionsSchema> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  criticModel?: any;
};

