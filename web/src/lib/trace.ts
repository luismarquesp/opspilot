import type {
  ChatSuccessPayload,
  PendingApprovalPayload,
  StrategyMetrics,
  StrategyName,
  TypedTraceEvent,
} from "../types/war-room.js";

export type BadgeTone = "critical" | "warning" | "success" | "info" | "neutral";

export interface DescribedTraceEvent {
  type: TypedTraceEvent["type"];
  label: string;
  icon: string;
  tone: BadgeTone;
  node: string;
  detail: string;
  codeBlock?: string;
  timestamp: number;
}

const TRACE_BADGE_MAP: Record<
  TypedTraceEvent["type"],
  { label: string; icon: string; tone: BadgeTone }
> = {
  route: { label: "Rota", icon: "🧭", tone: "info" },
  plan: { label: "Plano", icon: "📋", tone: "info" },
  thought: { label: "Pensamento", icon: "💭", tone: "neutral" },
  action: { label: "Ação", icon: "⚡", tone: "info" },
  observation: { label: "Observação", icon: "👁", tone: "neutral" },
  critique: { label: "Crítica", icon: "🔎", tone: "warning" },
  fallback: { label: "Fallback", icon: "⚠", tone: "warning" },
  summarize: { label: "Resumo", icon: "🗜", tone: "info" },
  answer: { label: "Resposta", icon: "✓", tone: "success" },
};

export function describeTraceEvent(event: TypedTraceEvent): DescribedTraceEvent {
  const badge = TRACE_BADGE_MAP[event.type];

  switch (event.type) {
    case "route":
      return {
        type: event.type,
        ...badge,
        node: event.node,
        detail: `Estratégia: ${event.route}${event.reason ? ` — ${event.reason}` : ""}`,
        timestamp: event.timestamp,
      };

    case "action":
      return {
        type: event.type,
        ...badge,
        node: event.node,
        detail: `Ferramenta: ${event.tool}`,
        codeBlock: JSON.stringify(event.args ?? {}, null, 2),
        timestamp: event.timestamp,
      };

    case "fallback":
      return {
        type: event.type,
        ...badge,
        node: event.node,
        detail: `${event.fromModel} -> ${event.toModel}${event.reason ? ` (${event.reason})` : ""}`,
        timestamp: event.timestamp,
      };

    default:
      return {
        type: event.type,
        ...badge,
        node: event.node,
        detail: event.content,
        timestamp: event.timestamp,
      };
  }
}

export function hasFallbackEvent(trace: readonly TypedTraceEvent[]): boolean {
  return trace.some((event) => event.type === "fallback");
}

export function formatLatencyMs(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${Math.round(ms)} ms`;
}

export function formatTokenCount(tokens?: number): string {
  if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens < 0) {
    return "—";
  }
  return `${Math.round(tokens)} tok`;
}

export function formatCostUsd(cost?: number): string {
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) {
    return "—";
  }
  return `$${cost.toFixed(4)}`;
}

export function mapApiErrorToMessage(
  statusCode: number,
  errorCode?: string,
  fallbackMessage?: string
): string {
  if (statusCode === 503 || errorCode === "model_unavailable") {
    return (
      fallbackMessage ||
      "Todos os modelos configurados estão indisponíveis no momento. Tente novamente ou verifique os fallbacks."
    );
  }
  if (statusCode === 504 || errorCode === "gateway_timeout") {
    return "A execução excedeu o tempo limite do servidor. Tente simplificar ou reenviar o prompt.";
  }
  if (statusCode === 422 || errorCode === "unknown_strategy") {
    return "A estratégia de raciocínio informada não é reconhecida pela API.";
  }
  if (statusCode === 400 || errorCode === "validation_error") {
    return "Os parâmetros enviados para /chat falharam na validação da API.";
  }
  if (statusCode === 404 || errorCode === "request_not_found") {
    return "Registro de requisição ou trace não encontrado.";
  }
  if (statusCode === 0) {
    return (
      fallbackMessage ||
      "Não foi possível conectar à API OpsPilot. Verifique a URL configurada na engrenagem e o CORS."
    );
  }
  return fallbackMessage || "Erro interno ao processar a solicitação operacional.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceTraceArray(raw: unknown): TypedTraceEvent[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isRecord).map((item): TypedTraceEvent => {
    const type = typeof item.type === "string" ? item.type : "thought";
    const node = typeof item.node === "string" && item.node.length > 0 ? item.node : "graph";
    const content = typeof item.content === "string" ? item.content : "";
    const timestamp = typeof item.timestamp === "number" ? item.timestamp : Date.now();
    const seq = typeof item.seq === "number" ? item.seq : undefined;

    if (type === "action") {
      return {
        type: "action",
        node,
        content,
        timestamp,
        seq,
        tool: typeof item.tool === "string" ? item.tool : "unknown_tool",
        args: isRecord(item.args) ? item.args : {},
      };
    }
    if (type === "route") {
      const route =
        item.route === "react" ||
        item.route === "plan-and-execute" ||
        item.route === "reflection"
          ? item.route
          : "react";
      return {
        type: "route",
        node,
        content,
        timestamp,
        seq,
        route,
        reason: typeof item.reason === "string" ? item.reason : content,
      };
    }
    if (type === "fallback") {
      return {
        type: "fallback",
        node,
        content,
        timestamp,
        seq,
        fromModel: typeof item.fromModel === "string" ? item.fromModel : "primary",
        toModel: typeof item.toModel === "string" ? item.toModel : "fallback",
        reason: typeof item.reason === "string" ? item.reason : content,
      };
    }

    const stdType =
      type === "thought" ||
      type === "observation" ||
      type === "plan" ||
      type === "critique" ||
      type === "answer" ||
      type === "summarize"
        ? type
        : "thought";

    return {
      type: stdType,
      node,
      content,
      timestamp,
      seq,
    };
  });
}

function coerceMetrics(raw: unknown): StrategyMetrics {
  if (!isRecord(raw)) {
    return { llmCalls: 0, latencyMs: 0 };
  }
  return {
    llmCalls: typeof raw.llmCalls === "number" ? raw.llmCalls : 0,
    latencyMs: typeof raw.latencyMs === "number" ? raw.latencyMs : 0,
    historyMessages:
      typeof raw.historyMessages === "number" ? raw.historyMessages : undefined,
    promptTokens: typeof raw.promptTokens === "number" ? raw.promptTokens : undefined,
    completionTokens:
      typeof raw.completionTokens === "number" ? raw.completionTokens : undefined,
    totalTokens: typeof raw.totalTokens === "number" ? raw.totalTokens : undefined,
    modelUsed: typeof raw.modelUsed === "string" ? raw.modelUsed : undefined,
  };
}

export type ParsedChatApiResponse =
  | { kind: "success"; data: ChatSuccessPayload }
  | { kind: "pending_approval"; data: PendingApprovalPayload }
  | {
      kind: "error";
      statusCode: number;
      errorCode: string;
      message: string;
      requestId?: string;
    };

export function parseChatApiResponse(
  statusCode: number,
  body: unknown,
  headerRequestId?: string
): ParsedChatApiResponse {
  const obj = isRecord(body) ? body : {};
  const requestId =
    typeof obj.requestId === "string" && obj.requestId.trim().length > 0
      ? obj.requestId
      : headerRequestId;

  if (statusCode === 202 || obj.status === "pending_approval") {
    const approvalId =
      typeof obj.approvalId === "string" && obj.approvalId.trim().length > 0
        ? obj.approvalId
        : `apr-${requestId ?? Date.now().toString(36)}`;
    const conversationId =
      typeof obj.conversationId === "string" ? obj.conversationId : "";
    const action =
      typeof obj.action === "string" && obj.action.trim().length > 0
        ? obj.action
        : typeof obj.tool === "string" && obj.tool.trim().length > 0
          ? obj.tool
          : "execute_action";
    const tool = typeof obj.tool === "string" ? obj.tool : undefined;
    const args = isRecord(obj.args) ? obj.args : undefined;
    const reason = typeof obj.reason === "string" ? obj.reason : undefined;
    const message =
      typeof obj.message === "string" && obj.message.trim().length > 0
        ? obj.message
        : "Ação operacional aguarda aprovação humana no War Room.";

    return {
      kind: "pending_approval",
      data: {
        status: "pending_approval",
        approvalId,
        requestId: requestId ?? approvalId,
        conversationId,
        action,
        tool,
        args,
        reason,
        message,
        trace: Array.isArray(obj.trace) ? coerceTraceArray(obj.trace) : undefined,
        metrics: isRecord(obj.metrics) ? coerceMetrics(obj.metrics) : undefined,
      },
    };
  }

  if (statusCode >= 200 && statusCode < 300) {
    const selectedRoute =
      obj.selectedRoute === "react" ||
      obj.selectedRoute === "plan-and-execute" ||
      obj.selectedRoute === "reflection"
        ? (obj.selectedRoute as StrategyName)
        : undefined;

    return {
      kind: "success",
      data: {
        requestId: requestId ?? `req-${Date.now().toString(36)}`,
        conversationId: typeof obj.conversationId === "string" ? obj.conversationId : "",
        answer: typeof obj.answer === "string" ? obj.answer : "",
        selectedRoute,
        routeReason: typeof obj.routeReason === "string" ? obj.routeReason : undefined,
        trace: coerceTraceArray(obj.trace),
        metrics: coerceMetrics(obj.metrics),
        approved: typeof obj.approved === "boolean" ? obj.approved : undefined,
        approvalId: typeof obj.approvalId === "string" ? obj.approvalId : undefined,
      },
    };
  }

  const errorCode =
    typeof obj.error === "string" && obj.error.length > 0
      ? obj.error
      : `http_${statusCode}`;
  const rawMessage = typeof obj.message === "string" ? obj.message : undefined;

  return {
    kind: "error",
    statusCode,
    errorCode,
    message: mapApiErrorToMessage(statusCode, errorCode, rawMessage),
    requestId,
  };
}
