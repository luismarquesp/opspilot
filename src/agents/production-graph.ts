import crypto from "node:crypto";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { createModel } from "./model.js";
import { reactStrategy } from "./react.js";
import { planAndExecuteStrategy } from "./plan-and-execute.js";
import { withReflection } from "./reflection.js";
import { buildContext } from "../context/context-builder.js";
import type { IRequestTraceStore } from "../models/request-trace.js";
import { getDefaultRequestTraceStore } from "../store/request-trace-store.js";
import { log as defaultLog, type ILogger } from "../obs/logger.js";
import {
  RouteDecisionSchema,
  type RouteDecision,
  type TraceEvent,
  type RouteTraceEvent,
  type StrategyMetrics,
  type BuiltContext,
  type HistoryMessage,
  type MemoryItem,
  type ContextBudgets,
  type ReasoningStrategy,
} from "./types.js";

// ---------------------------------------------------------------------------
// Operational Decision Table Prompt
// ---------------------------------------------------------------------------

export const ROUTER_DECISION_TABLE_PROMPT = `Você é o roteador operacional do OpsPilot, copiloto de plantão para gerenciar alertas e incidentes de produção.
Sua responsabilidade é avaliar a solicitação do operador e selecionar a melhor estratégia de raciocínio com base na seguinte tabela de decisão operacional:

| Estratégia | Critérios e Quando Usar | Exemplos Típicos |
|---|---|---|
| react | Consultas diretas de status, listagem rápida de alertas firing/resolved, inspeções operacionais pontuais de passo único. | "quais alertas estão firing?", "verifique os alertas do payment-api", "qual o status do serviço auth?" |
| plan-and-execute | Triagem e mitigação de múltiplos passos, orquestração sequencial de incidentes, tarefas que exigem planejamento de etapas antes da execução. | "investigue os alertas, abra um incidente crítico e avise os serviços dependentes", "execute o runbook do checkout e resolva o incidente" |
| reflection | Diagnósticos críticos que exigem alta precisão, validação rigorosa contra observações reais, tarefas de alto risco ou verificação de hipóteses ambíguas. | "verifique minuciosamente a causa-raiz do incidente crítico e certifique-se com base nas observações que não há alucinação", "audite a resolução do inc-101 contra os logs" |

Retorne obrigatoriamente a rota selecionada ('react', 'plan-and-execute' ou 'reflection') e uma justificativa concisa (reason).`;

// ---------------------------------------------------------------------------
// Production Graph State
// ---------------------------------------------------------------------------

export const ProductionGraphState = Annotation.Root({
  // Input parameters
  requestId: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),
  input: Annotation<string>(),
  conversationId: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),
  userId: Annotation<string | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
  strategyOverride: Annotation<string | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
  history: Annotation<HistoryMessage[]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),
  summary: Annotation<string | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
  recalledMemories: Annotation<Array<string | MemoryItem> | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
  budgets: Annotation<Partial<ContextBudgets> | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  // State populated by context node
  builtContext: Annotation<BuiltContext | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  // State populated by router node
  selectedRoute: Annotation<"react" | "plan-and-execute" | "reflection" | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
  routeReason: Annotation<string | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  // Strategy output and final resolution
  answer: Annotation<string | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
  trace: Annotation<TraceEvent[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  llmCalls: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),
  metrics: Annotation<StrategyMetrics | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
});

export type ProductionGraphStateType = typeof ProductionGraphState.State;

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export async function contextNode(
  state: typeof ProductionGraphState.State
): Promise<Partial<typeof ProductionGraphState.State>> {
  const builtContext = buildContext({
    userMessage: state.input,
    history: state.history,
    summary: state.summary,
    memories: state.recalledMemories,
    budgets: state.budgets,
  });

  return {
    builtContext,
  };
}

export async function routerNode(
  state: typeof ProductionGraphState.State,
  customModel?: unknown
): Promise<Partial<typeof ProductionGraphState.State>> {
  // Check manual operator override first (US2)
  if (state.strategyOverride) {
    const validOverrides: Record<string, "react" | "plan-and-execute" | "reflection"> = {
      react: "react",
      "plan-and-execute": "plan-and-execute",
      planExecute: "plan-and-execute",
      reflection: "reflection",
      reflect: "reflection",
    };
    const mapped = validOverrides[state.strategyOverride] ?? "react";
    const routeEvent: RouteTraceEvent = {
      type: "route",
      node: "router",
      route: mapped,
      reason: `Manual override via request parameter: ${state.strategyOverride}`,
      content: `Rota selecionada via override: [${mapped.toUpperCase()}] - Manual override via request parameter: ${state.strategyOverride}`,
      timestamp: Date.now(),
    };

    return {
      selectedRoute: mapped,
      routeReason: routeEvent.reason,
      trace: [routeEvent],
    };
  }

  // Autonomous LLM classification (US1)
  let selectedRoute: "react" | "plan-and-execute" | "reflection" = "react";
  let routeReason = "Fallback determinístico para react devido à indisponibilidade de classificação.";
  let llmCalls = 0;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (customModel as any) ?? createModel({ node: "router" });
    const verdict = (await model.withStructuredOutput(RouteDecisionSchema).invoke([
      ["system", ROUTER_DECISION_TABLE_PROMPT],
      ["user", state.input],
    ])) as RouteDecision;

    if (verdict?.route && ["react", "plan-and-execute", "reflection"].includes(verdict.route)) {
      selectedRoute = verdict.route;
      routeReason = verdict.reason || "Autonomous selection based on operational decision table.";
      llmCalls = 1;
    }
  } catch {
    // Offline / error fallback to react
    selectedRoute = "react";
    routeReason = "Fallback determinístico para react devido a erro na classificação do modelo.";
  }

  const routeEvent: RouteTraceEvent = {
    type: "route",
    node: "router",
    route: selectedRoute,
    reason: routeReason,
    content: `Rota selecionada: [${selectedRoute.toUpperCase()}] - ${routeReason}`,
    timestamp: Date.now(),
  };

  const routerFallbacks: TraceEvent[] = ((customModel as any)?.fallbackEvents ?? []) as TraceEvent[];

  return {
    selectedRoute,
    routeReason,
    trace: [...routerFallbacks, routeEvent],
    llmCalls,
  };
}

export async function reactNode(
  state: typeof ProductionGraphState.State,
  customStrategy?: ReasoningStrategy
): Promise<Partial<typeof ProductionGraphState.State>> {
  const strategy = customStrategy ?? reactStrategy;
  const input = state.builtContext?.userPrompt ?? state.input;
  const result = await strategy.run(input, {
    history: state.history,
    summary: state.summary,
    recalledMemories: state.recalledMemories,
    budgets: state.budgets,
  });

  const trace = result.trace.map((e) => ({
    ...e,
    node: e.node || "react",
  }));

  return {
    answer: result.answer,
    trace,
    llmCalls: result.metrics.llmCalls,
    metrics: result.metrics,
  };
}

export async function planAndExecuteNode(
  state: typeof ProductionGraphState.State,
  customStrategy?: ReasoningStrategy
): Promise<Partial<typeof ProductionGraphState.State>> {
  const strategy = customStrategy ?? planAndExecuteStrategy;
  const input = state.builtContext?.userPrompt ?? state.input;
  const result = await strategy.run(input, {
    history: state.history,
    summary: state.summary,
    recalledMemories: state.recalledMemories,
    budgets: state.budgets,
  });

  const trace = result.trace.map((e) => ({
    ...e,
    node: e.node || "plan-and-execute",
  }));

  return {
    answer: result.answer,
    trace,
    llmCalls: result.metrics.llmCalls,
    metrics: result.metrics,
  };
}

export async function reflectionNode(
  state: typeof ProductionGraphState.State,
  customStrategy?: ReasoningStrategy
): Promise<Partial<typeof ProductionGraphState.State>> {
  const strategy = customStrategy ?? withReflection(reactStrategy);
  const input = state.builtContext?.userPrompt ?? state.input;
  const result = await strategy.run(input, {
    history: state.history,
    summary: state.summary,
    recalledMemories: state.recalledMemories,
    budgets: state.budgets,
  });

  const trace = result.trace.map((e) => ({
    ...e,
    node: e.node || "reflection",
  }));

  return {
    answer: result.answer,
    trace,
    llmCalls: result.metrics.llmCalls,
    metrics: result.metrics,
  };
}

export interface ResponseNodePersistenceOptions {
  requestTraceStore?: IRequestTraceStore;
  logger?: ILogger;
  signal?: { aborted: boolean };
}

export async function responseNode(
  state: typeof ProductionGraphState.State,
  startedAt: number,
  persistence?: ResponseNodePersistenceOptions
): Promise<Partial<typeof ProductionGraphState.State>> {
  const answer = state.answer ?? "Nenhuma resposta consolidada.";
  const existingTrace = state.trace ?? [];
  const additionalTrace: TraceEvent[] = [];

  const hasAnswerEvent = existingTrace.some((e) => e.type === "answer");
  if (!hasAnswerEvent) {
    additionalTrace.push({
      type: "answer",
      node: "response",
      content: answer,
      timestamp: Date.now(),
    });
  }

  const selectedRoute = state.selectedRoute ?? "react";
  const latencyMs = Math.max(0, Date.now() - startedAt);
  const breakdown = state.builtContext?.breakdown;
  const promptTokens = state.metrics?.promptTokens || breakdown?.totalEstimated || 0;
  const totalTokens = state.metrics?.totalTokens || promptTokens;
  const metrics: StrategyMetrics = {
    llmCalls: state.llmCalls ?? 0,
    latencyMs,
    historyMessages: state.history?.length ?? 0,
    promptTokens,
    completionTokens: state.metrics?.completionTokens ?? 0,
    totalTokens,
    contextBreakdown: breakdown,
    ...(state.metrics?.modelUsed ? { modelUsed: state.metrics.modelUsed } : {}),
  };

  const requestId = state.requestId || crypto.randomUUID();
  const fullTrace: TraceEvent[] = [...existingTrace, ...additionalTrace].map((e) => ({
    ...e,
    node: e.node || selectedRoute || "response",
  }));

  const activeStore = persistence?.requestTraceStore ?? getDefaultRequestTraceStore();
  const activeLogger = persistence?.logger ?? defaultLog;

  if (!persistence?.signal?.aborted) {
    activeStore.requests.save({
      id: requestId,
      conversationId: state.conversationId,
      userId: state.userId,
      route: selectedRoute,
      strategy: selectedRoute,
      modelUsed: metrics.modelUsed,
      promptTokens: metrics.promptTokens,
      completionTokens: metrics.completionTokens,
      totalTokens: metrics.totalTokens,
      latencyMs: metrics.latencyMs,
      llmCalls: metrics.llmCalls,
      historyMessages: metrics.historyMessages,
      contextBreakdown: metrics.contextBreakdown,
      status: "ok",
    });

    fullTrace.forEach((e, seq) => {
      activeStore.traceEvents.save({
        requestId,
        seq,
        node: e.node || selectedRoute,
        type: e.type,
        content: e.content,
        timestamp: e.timestamp,
        payload: e,
      });
      activeLogger.trace(requestId, e, {
        conversationId: state.conversationId,
        userId: state.userId,
        seq,
      });
    });

    activeLogger.info({
      requestId,
      conversationId: state.conversationId,
      userId: state.userId,
      type: "done",
      event: "request_completed",
      node: "response",
      route: selectedRoute,
      strategy: selectedRoute,
      tokens: metrics.promptTokens ?? 0,
      promptTokens: metrics.promptTokens ?? 0,
      completionTokens: metrics.completionTokens ?? 0,
      totalTokens: metrics.totalTokens ?? 0,
      latencyMs: metrics.latencyMs,
      llmCalls: metrics.llmCalls,
      historyMessages: metrics.historyMessages ?? 0,
      modelUsed: metrics.modelUsed,
      traceCount: fullTrace.length,
      status: "ok",
      statusCode: 200,
    });
  }

  return {
    requestId,
    answer,
    trace: additionalTrace,
    metrics,
  };
}

export const answerNode = responseNode;

// ---------------------------------------------------------------------------
// Graph Assembly & Compilation
// ---------------------------------------------------------------------------

export interface CreateProductionGraphOptions {
  customModel?: unknown;
  customStrategies?: Record<string, ReasoningStrategy>;
  reflectionOptions?: import("./types.js").ReflectionOptions;
  startedAt?: number;
  requestTraceStore?: IRequestTraceStore;
  logger?: ILogger;
  signal?: { aborted: boolean };
}

export function createProductionGraph(options: CreateProductionGraphOptions = {}) {
  const startedAt = options.startedAt ?? Date.now();
  const baseReactStrategy = options.customStrategies?.["react"] ?? reactStrategy;
  const resolvedReflectionStrategy =
    options.customStrategies?.["reflection"] ??
    withReflection(baseReactStrategy, options.reflectionOptions);

  const workflow = new StateGraph(ProductionGraphState)
    .addNode("context", contextNode)
    .addNode("router", (state) => routerNode(state, options.customModel))
    .addNode("react", (state) => reactNode(state, options.customStrategies?.["react"]))
    .addNode("plan-and-execute", (state) =>
      planAndExecuteNode(state, options.customStrategies?.["plan-and-execute"])
    )
    .addNode("reflection", (state) =>
      reflectionNode(state, resolvedReflectionStrategy)
    )
    .addNode("response", (state) =>
      responseNode(state, startedAt, {
        requestTraceStore: options.requestTraceStore,
        logger: options.logger,
        signal: options.signal,
      })
    )
    .addEdge(START, "context")
    .addEdge("context", "router")
    .addConditionalEdges("router", (state) => state.selectedRoute ?? "react", {
      react: "react",
      "plan-and-execute": "plan-and-execute",
      reflection: "reflection",
    })
    .addEdge("react", "response")
    .addEdge("plan-and-execute", "response")
    .addEdge("reflection", "response")
    .addEdge("response", END);

  return workflow.compile();
}

// ---------------------------------------------------------------------------
// Programmatic Invocation Helper: runProductionGraph
// ---------------------------------------------------------------------------

export interface ProductionGraphInput {
  requestId?: string;
  input: string;
  conversationId: string;
  userId?: string;
  strategyOverride?: "react" | "plan-and-execute" | "reflection";
  history?: HistoryMessage[];
  summary?: string;
  recalledMemories?: Array<string | MemoryItem>;
  budgets?: Partial<ContextBudgets>;
  initialTrace?: TraceEvent[];
}

export interface ProductionGraphOutput {
  requestId: string;
  answer: string;
  trace: TraceEvent[];
  metrics: StrategyMetrics;
  selectedRoute: "react" | "plan-and-execute" | "reflection";
  routeReason: string;
}

export async function runProductionGraph(
  input: ProductionGraphInput,
  options: {
    graph?: ReturnType<typeof createProductionGraph>;
    customModel?: unknown;
    customStrategies?: Record<string, ReasoningStrategy>;
    reflectionOptions?: import("./types.js").ReflectionOptions;
    requestTraceStore?: IRequestTraceStore;
    logger?: ILogger;
    signal?: { aborted: boolean };
  } = {}
): Promise<ProductionGraphOutput> {
  const startedAt = Date.now();
  const requestId = input.requestId || crypto.randomUUID();
  const graph =
    options.graph ??
    createProductionGraph({
      customModel: options.customModel,
      customStrategies: options.customStrategies,
      reflectionOptions: options.reflectionOptions,
      startedAt,
      requestTraceStore: options.requestTraceStore,
      logger: options.logger,
      signal: options.signal,
    });

  const finalState = await graph.invoke({
    requestId,
    input: input.input,
    conversationId: input.conversationId,
    userId: input.userId,
    strategyOverride: input.strategyOverride,
    history: input.history ?? [],
    summary: input.summary,
    recalledMemories: input.recalledMemories,
    budgets: input.budgets,
    trace: input.initialTrace ?? [],
    llmCalls: 0,
  });

  const rawTrace = (finalState.trace ?? []) as TraceEvent[];
  // Enforce 100% node attribution across all trace events
  const trace = rawTrace.map((event) => ({
    ...event,
    node: event.node || (finalState.selectedRoute ?? "response"),
  }));

  const answer =
    finalState.answer ??
    trace.find((t) => t.type === "answer")?.content ??
    "Nenhuma resposta consolidada.";

  const metrics: StrategyMetrics = finalState.metrics ?? {
    llmCalls: finalState.llmCalls ?? 0,
    latencyMs: Date.now() - startedAt,
    historyMessages: input.history?.length ?? 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    contextBreakdown: finalState.builtContext?.breakdown,
  };

  return {
    requestId: finalState.requestId || requestId,
    answer,
    trace,
    metrics,
    selectedRoute: finalState.selectedRoute ?? "react",
    routeReason: finalState.routeReason ?? "Rota executada com sucesso.",
  };
}
