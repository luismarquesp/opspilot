import type { TraceEvent, StrategyMetrics, TraceEventType } from "./types.js";

const TAG_LABELS: Record<TraceEventType, string> = {
  thought: "[THOUGHT]",
  action: "[ACTION]",
  observation: "[OBSERV.]",
  plan: "[PLAN]",
  critique: "[CRITIQUE]",
  answer: "[ANSWER]",
  summarize: "[SUMM.]",
  route: "[ROUTE]",
  fallback: "[FALLB.]",
};

export function formatTraceEvent(event: TraceEvent): string {
  const tag = (TAG_LABELS[event.type] ?? `[${event.type.toUpperCase()}]`).padEnd(9, " ");
  if (event.type === "action" && "tool" in event) {
    const argsStr = JSON.stringify(event.args);
    return `${tag} ${event.tool}(${argsStr})`;
  }
  if (event.type === "route" && "route" in event) {
    return `${tag} Rota selecionada: [${event.route.toUpperCase()}] - ${event.reason}`;
  }
  if (event.type === "fallback" && "fromModel" in event && "toModel" in event) {
    return `${tag} ${event.fromModel} -> ${event.toModel}: ${event.reason}`;
  }
  return `${tag} ${event.content}`;
}

export function formatTrace(trace: readonly TraceEvent[]): string {
  return trace.map((event) => formatTraceEvent(event)).join("\n");
}

export function formatMetrics(metrics: StrategyMetrics): string {
  return `Metrics: LLM Calls: ${metrics.llmCalls} | Latency: ${metrics.latencyMs}ms`;
}

export function extractMessageContent(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text);
        }
        return "";
      })
      .join("\n");
  }
  return "";
}

export function countAiMessages(messages: readonly unknown[]): number {
  if (!Array.isArray(messages)) return 0;
  return messages.filter((m) => {
    if (!m || typeof m !== "object") return false;
    const role = (m as { role?: unknown }).role;
    const type = (m as { _getType?: () => string })._getType?.();
    return role === "assistant" || role === "ai" || type === "ai";
  }).length;
}

export function lastText(messages: readonly unknown[]): string {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") continue;
    const role = (msg as { role?: unknown }).role;
    const type = (msg as { _getType?: () => string })._getType?.();
    if (role === "assistant" || role === "ai" || type === "ai") {
      const content = extractMessageContent(msg);
      if (content.trim()) return content.trim();
    }
  }
  return extractMessageContent(messages[messages.length - 1]);
}

export function toTrace(messages: readonly unknown[], defaultNode: string = "react"): TraceEvent[] {
  if (!Array.isArray(messages)) return [];
  const events: TraceEvent[] = [];
  let ts = Date.now();

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const obj = msg as Record<string, unknown>;
    const role = obj.role ?? (typeof obj._getType === "function" ? obj._getType() : undefined);
    const content = extractMessageContent(msg);

    // Tool calls from AI
    const toolCalls = (obj.tool_calls ?? (obj.additional_kwargs as Record<string, unknown> | undefined)?.tool_calls) as Array<{
      name?: string;
      function?: { name?: string; arguments?: string };
      args?: Record<string, unknown>;
    }> | undefined;

    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      if (content.trim()) {
        events.push({
          type: "thought",
          node: defaultNode,
          content: content.trim(),
          timestamp: ts++,
        });
      }
      for (const call of toolCalls) {
        const tool = call.name ?? call.function?.name ?? "unknown_tool";
        let args: Record<string, unknown> = {};
        if (call.args && typeof call.args === "object") {
          args = call.args;
        } else if (call.function?.arguments) {
          try {
            args = JSON.parse(call.function.arguments);
          } catch {
            args = { raw: call.function.arguments };
          }
        }
        events.push({
          type: "action",
          node: defaultNode,
          tool,
          args,
          content: `Call ${tool}`,
          timestamp: ts++,
        });
      }
      continue;
    }

    const hasToolType = typeof obj._getType === "function" && (obj._getType as () => string)() === "tool";
    if (role === "tool" || role === "observation" || hasToolType) {
      events.push({
        type: "observation",
        node: defaultNode,
        content: content.trim(),
        timestamp: ts++,
      });
    } else if (role === "assistant" || role === "ai") {
      if (content.trim()) {
        events.push({
          type: "thought",
          node: defaultNode,
          content: content.trim(),
          timestamp: ts++,
        });
      }
    }
  }

  // If there are events and the last one is a thought from the final answer, mark or ensure answer event is present
  if (events.length > 0) {
    const lastEvent = events[events.length - 1];
    if (lastEvent.type === "thought") {
      events[events.length - 1] = {
        type: "answer",
        node: defaultNode,
        content: lastEvent.content,
        timestamp: lastEvent.timestamp,
      };
    }
  }

  return events;
}
