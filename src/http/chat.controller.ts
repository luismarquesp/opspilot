import type { Request, Response, RequestHandler } from "express";
import { ChatRequestSchema, PendingApprovalResponseSchema } from "./schemas.js";
import { resolveStrategy, STRATEGY_REGISTRY, runProductionGraph } from "../agents/index.js";
import type { ReasoningStrategy, ReflectionOptions, TraceEvent, MemoryItem } from "../agents/types.js";
import type { IConversationStore } from "../models/conversation.js";
import { SqliteConversationStore } from "../store/conversation-store.js";
import type { IMemoryStore } from "../models/memory.js";
import { getDefaultMemoryStore } from "../memory/memory-store.js";
import type { ILearningReflector } from "../memory/reflector.js";
import { defaultLearningReflector } from "../memory/reflector.js";
import { estimateContextBreakdown } from "../context/tokens.js";
import type { IConversationSummarizer } from "../context/summarizer.js";
import { defaultConversationSummarizer } from "../context/summarizer.js";
import { ModelUnavailableError } from "../agents/errors.js";
import type { IRequestTraceStore } from "../models/request-trace.js";
import { getDefaultRequestTraceStore } from "../store/request-trace-store.js";
import { log as defaultLog, type ILogger } from "../obs/logger.js";
import crypto from "node:crypto";

export const CHAT_TIMEOUT_MS = 180_000;

export class TimeoutError extends Error {
  constructor(message = "Execution timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export interface ChatControllerOptions {
  strategyRegistry?: Record<string, ReasoningStrategy>;
  customModel?: unknown;
  timeoutMs?: number;
  reflectionOptions?: ReflectionOptions;
  conversationStore?: IConversationStore;
  memoryStore?: IMemoryStore;
  learningReflector?: ILearningReflector;
  summarizer?: IConversationSummarizer;
  requestTraceStore?: IRequestTraceStore;
  logger?: ILogger;
}

export function resolveRequestId(headerValue?: string | string[]): string {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : crypto.randomUUID();
}

let defaultStore: IConversationStore | undefined;

export function getDefaultConversationStore(): IConversationStore {
  if (!defaultStore) {
    const isTest =
      process.env.NODE_ENV === "test" ||
      Boolean(process.env.NODE_TEST_CONTEXT) ||
      process.execArgv.includes("--test") ||
      process.argv.includes("--test");
    defaultStore = new SqliteConversationStore(isTest ? ":memory:" : undefined);
  }
  return defaultStore;
}

function timeoutPromise(ms: number): { promise: Promise<never>; cancel: () => void } {
  let timer: NodeJS.Timeout;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  return {
    promise,
    cancel: () => clearTimeout(timer),
  };
}

function generateFallbackConversationId(): string {
  return `conv-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`;
}

export function createChatHandler(options: ChatControllerOptions = {}): RequestHandler {
  const registry = options.strategyRegistry ?? STRATEGY_REGISTRY;
  const timeoutMs = options.timeoutMs ?? CHAT_TIMEOUT_MS;
  const reflectionOptions = options.reflectionOptions;
  const conversationStore = options.conversationStore ?? getDefaultConversationStore();
  const memoryStore = options.memoryStore ?? getDefaultMemoryStore();
  const learningReflector = options.learningReflector ?? defaultLearningReflector;
  const summarizer = options.summarizer ?? defaultConversationSummarizer;
  const requestTraceStore = options.requestTraceStore ?? getDefaultRequestTraceStore();
  const activeLogger = options.logger ?? defaultLog;

  return async (req: Request, res: Response): Promise<void> => {
    const requestId = resolveRequestId(req.headers["x-request-id"]);
    res.setHeader("X-Request-Id", requestId);

    const parsedBody = ChatRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const strategyIssue = parsedBody.error.issues.find((i) => i.path[0] === "strategy");
      if (strategyIssue && typeof req.body?.strategy === "string") {
        res.status(422).json({
          error: "unknown_strategy",
          strategy: req.body.strategy,
        });
        return;
      }
      res.status(400).json({
        error: "validation_error",
        issues: parsedBody.error.issues,
      });
      return;
    }

    const {
      message,
      strategy,
      reflect = false,
      conversationId: inputConvId,
      userId,
      requireApproval = false,
      approvalId,
      decision,
      approved,
      action,
      tool,
      args,
    } = parsedBody.data;

    const isRejected = decision === "reject" || approved === false;
    const isApproved = decision === "approve" || approved === true;

    const registryKeys = Object.keys(registry);
    let strategyOverride: "react" | "plan-and-execute" | "reflection" | undefined = strategy;
    if (reflect) {
      strategyOverride = "reflection";
    } else if (
      !strategy &&
      options.strategyRegistry &&
      registryKeys.length === 1 &&
      registryKeys[0] === "react" &&
      !options.customModel
    ) {
      strategyOverride = "react";
    }

    // --- Semantic Memory recall ---
    let recalledMemories: MemoryItem[] | undefined;
    if (userId) {
      try {
        const recalled = await memoryStore.recall(userId, message, 3, 0.3);
        if (recalled.length > 0) {
          recalledMemories = recalled.map((m) => ({ fact: m.fact, score: m.score }));
        }
      } catch (err) {
        console.error("[OpsPilot] Memory recall error:", err);
      }
    }

    // --- Conversation handling ---
    const conversationId = inputConvId
      ?? conversationStore?.create()
      ?? generateFallbackConversationId();

    // Fetch history from store: active raw window of up to 8 most recent messages
    const history = conversationStore
      ? conversationStore.lastMessages(conversationId, 8)
      : [];
    const historyMessages = history.length;
    const requestStartedAt = Date.now();

    if (requireApproval && !isApproved && !isRejected) {
      if (conversationStore) {
        conversationStore.append(conversationId, "user", message);
      }

      const generatedApprovalId =
        approvalId ?? `apr-${crypto.randomBytes(4).toString("hex")}`;
      const pendingTrace: TraceEvent[] = [
        {
          type: "thought",
          node: "approval",
          content: "Execução pausada aguardando aprovação humana no War Room.",
          timestamp: Date.now(),
        },
      ];
      const pendingPayload = PendingApprovalResponseSchema.parse({
        status: "pending_approval",
        approvalId: generatedApprovalId,
        requestId,
        conversationId,
        action: action ?? tool ?? "execute_operational_action",
        ...(tool ? { tool } : {}),
        ...(args ? { args } : {}),
        reason: "Ação crítica aguarda confirmação humana no War Room.",
        message: "Aprovação necessária para executar a ação operacional solicitada.",
        trace: pendingTrace,
        metrics: {
          llmCalls: 0,
          latencyMs: Math.max(0, Date.now() - requestStartedAt),
          historyMessages,
        },
      });

      res.status(202).json(pendingPayload);
      return;
    }

    if (isRejected) {
      const rejectionAnswer =
        "Ação negada pelo operador. Nenhuma alteração foi executada.";
      const rejectionTrace: TraceEvent[] = [
        {
          type: "answer",
          node: "approval",
          content: rejectionAnswer,
          timestamp: Date.now(),
        },
      ];
      const rejectionLatency = Math.max(0, Date.now() - requestStartedAt);

      if (conversationStore) {
        conversationStore.append(conversationId, "assistant", rejectionAnswer);
      }

      requestTraceStore.requests.save({
        id: requestId,
        conversationId,
        userId,
        route: strategyOverride ?? "react",
        strategy: strategyOverride ?? "react",
        latencyMs: rejectionLatency,
        historyMessages,
        status: "ok",
      });

      rejectionTrace.forEach((event, seq) => {
        requestTraceStore.traceEvents.save({
          requestId,
          seq,
          node: event.node,
          type: event.type,
          payload: event,
        });
      });

      activeLogger.info({
        requestId,
        conversationId,
        ...(userId ? { userId } : {}),
        type: "done",
        node: "approval",
        route: strategyOverride ?? "react",
        status: "ok",
      });

      res.status(200).json({
        answer: rejectionAnswer,
        requestId,
        conversationId,
        ...(userId ? { userId } : {}),
        approved: false,
        ...(approvalId ? { approvalId } : {}),
        trace: rejectionTrace,
        metrics: {
          llmCalls: 0,
          latencyMs: rejectionLatency,
          historyMessages,
        },
      });
      return;
    }

    // Persist user message before execution
    if (conversationStore && !isApproved) {
      conversationStore.append(conversationId, "user", message);
    }

    // Pruning and rolling summary check (triggers when >= 8 messages have exited the window)
    let activeSummary: string | undefined;
    let summaryTraceEvent: TraceEvent | undefined;

    if (conversationStore) {
      const existingSummary = conversationStore.getSummary(conversationId);
      activeSummary = existingSummary?.summary;

      const evicted = conversationStore.getEvictedUnsummarizedMessages(conversationId, 8);
      if (evicted.length >= 8) {
        const chunk = evicted.slice(0, 8);
        try {
          const newSummary = await summarizer.summarize(activeSummary, chunk);
          const lastId = chunk[chunk.length - 1].id;
          conversationStore.setSummary(conversationId, newSummary, lastId);
          activeSummary = newSummary;

          summaryTraceEvent = {
            type: "summarize",
            node: "context",
            content: newSummary,
            timestamp: Date.now(),
          };
        } catch (err) {
          console.warn("[OpsPilot] Summarization failed, proceeding with existing summary:", err);
        }
      }
    }

    const { promise: timeoutLimit, cancel } = timeoutPromise(timeoutMs);
    const abortSignal = { aborted: false };

    try {
      const approvalAuditTrace: TraceEvent | undefined = isApproved
        ? {
            type: "thought",
            node: "approval",
            content: `Ação aprovada pelo operador (${approvalId ?? "manual"}).`,
            timestamp: Date.now(),
          }
        : undefined;
      const initialTrace: TraceEvent[] = [
        ...(approvalAuditTrace ? [approvalAuditTrace] : []),
        ...(summaryTraceEvent ? [summaryTraceEvent] : []),
      ];

      const result = await Promise.race([
        runProductionGraph(
          {
            requestId,
            input: message,
            conversationId,
            userId,
            strategyOverride,
            history: history.map((m) => ({ role: m.role, content: m.content })),
            summary: activeSummary,
            recalledMemories,
            initialTrace: initialTrace.length > 0 ? initialTrace : undefined,
          },
          {
            customStrategies: registry,
            customModel: options.customModel,
            reflectionOptions,
            requestTraceStore,
            logger: activeLogger,
            signal: abortSignal,
          }
        ),
        timeoutLimit,
      ]);
      cancel();

      // Persist assistant response on success
      if (conversationStore) {
        conversationStore.append(conversationId, "assistant", result.answer);
      }

      // Background learning reflection (non-blocking)
      if (userId) {
        void learningReflector
          .reflect({
            userMessage: message,
            assistantAnswer: result.answer,
            userId,
            memoryStore,
          })
          .catch((err) => {
            console.warn("[OpsPilot] Background reflection failed:", err);
          });
      }

      const contextBreakdown = estimateContextBreakdown({
        history,
        summary: activeSummary,
        memories: recalledMemories,
        userMessage: message,
      });

      const trace =
        summaryTraceEvent && result.trace[0]?.type !== "summarize"
          ? [summaryTraceEvent, ...result.trace]
          : result.trace;

      const finalMetrics = {
        ...result.metrics,
        historyMessages,
        promptTokens: result.metrics?.promptTokens || contextBreakdown.totalEstimated,
        totalTokens: result.metrics?.totalTokens || contextBreakdown.totalEstimated,
        contextBreakdown,
      };

      // Update request row only if controller enriched promptTokens or contextBreakdown
      if (
        finalMetrics.promptTokens !== result.metrics?.promptTokens ||
        summaryTraceEvent !== undefined
      ) {
        requestTraceStore.requests.save({
          id: requestId,
          conversationId,
          userId,
          route: result.selectedRoute ?? "react",
          strategy: result.selectedRoute ?? "react",
          modelUsed: finalMetrics.modelUsed,
          promptTokens: finalMetrics.promptTokens,
          completionTokens: finalMetrics.completionTokens,
          totalTokens: finalMetrics.totalTokens,
          latencyMs: finalMetrics.latencyMs,
          llmCalls: finalMetrics.llmCalls,
          historyMessages: finalMetrics.historyMessages,
          contextBreakdown: finalMetrics.contextBreakdown,
          status: "ok",
        });
      }

      res.status(200).json({
        ...result,
        requestId,
        conversationId,
        ...(userId ? { userId } : {}),
        ...(isApproved ? { approved: true } : {}),
        ...(approvalId ? { approvalId } : {}),
        trace,
        metrics: finalMetrics,
      });
    } catch (error) {
      abortSignal.aborted = true;
      cancel();

      const isTimeout = error instanceof TimeoutError;
      const isModelUnavailable =
        error instanceof ModelUnavailableError ||
        (error as { code?: string })?.code === "model_unavailable";

      const statusCode = isTimeout ? 504 : isModelUnavailable ? 503 : 500;
      const errorCode = isTimeout
        ? "gateway_timeout"
        : isModelUnavailable
          ? "model_unavailable"
          : "internal_error";

      requestTraceStore.requests.save({
        id: requestId,
        conversationId,
        userId,
        route: strategyOverride ?? "react",
        strategy: strategyOverride ?? "react",
        latencyMs: Math.max(0, Date.now() - requestStartedAt),
        status: "error",
      });

      activeLogger.error({
        requestId,
        conversationId,
        ...(userId ? { userId } : {}),
        type: "error",
        event: "request_failed",
        statusCode,
        errorCode,
        status: "error",
      });

      if (isModelUnavailable) {
        res.status(503).json({
          error: "model_unavailable",
          message: (error as Error).message || "All configured models failed to respond",
        });
        return;
      }

      res.status(statusCode).json({ error: errorCode });
    }
  };
}

export const chatHandler: RequestHandler = createChatHandler();
