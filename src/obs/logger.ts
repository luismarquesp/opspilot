import type { TraceEvent } from "../agents/types.js";

// ---------------------------------------------------------------------------
// Types & Sink Configuration
// ---------------------------------------------------------------------------

export type LogLevel = "info" | "warn" | "error";

export type LogSink = (line: string) => void;

export interface TraceLogContext {
  requestId: string;
  conversationId?: string;
  userId?: string;
  seq?: number;
}

export interface ILogger {
  info(meta: Record<string, unknown>): string;
  warn(meta: Record<string, unknown>): string;
  error(meta: Record<string, unknown>): string;
  trace(requestId: string, event: TraceEvent, extra?: Omit<TraceLogContext, "requestId">): string;
}

const SAFE_METADATA_KEYS = new Set<string>([
  "timestamp",
  "ts",
  "level",
  "event",
  "type",
  "requestId",
  "conversationId",
  "userId",
  "node",
  "route",
  "strategy",
  "tool",
  "argKeys",
  "fromModel",
  "toModel",
  "modelUsed",
  "tokens",
  "promptTokens",
  "completionTokens",
  "totalTokens",
  "latencyMs",
  "llmCalls",
  "historyMessages",
  "traceCount",
  "seq",
  "status",
  "statusCode",
  "errorCode",
  "contentLength",
]);

const FORBIDDEN_PAYLOAD_KEYS = new Set<string>([
  "content",
  "message",
  "userMessage",
  "input",
  "answer",
  "prompt",
  "systemPrompt",
  "args",
  "observation",
  "summary",
  "payload",
  "fact",
  "facts",
  "history",
  "memories",
  "recalledMemories",
  "reason",
  "feedback",
  "critique",
  "plan",
  "thought",
  "error",
  "stack",
]);

// ---------------------------------------------------------------------------
// Pure Metadata Sanitization & Line Formatting Functions
// ---------------------------------------------------------------------------

function extractSafeDescriptorValue(key: string, value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (key === "argKeys" && Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function deriveSafeDescriptors(source: Record<string, unknown>, out: Record<string, unknown>): void {
  if (typeof source.content === "string" && out.contentLength === undefined) {
    out.contentLength = source.content.length;
  }
  if (
    source.args &&
    typeof source.args === "object" &&
    !Array.isArray(source.args) &&
    out.argKeys === undefined
  ) {
    out.argKeys = Object.keys(source.args as Record<string, unknown>);
  }
}

/**
 * Pure function that filters any input object down to non-sensitive operational metadata.
 * Raw payloads (content, message, answer, prompt, args, etc.) are strictly excluded.
 */
export function sanitizeLogMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const key of SAFE_METADATA_KEYS) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(meta, key)) continue;
    const safeVal = extractSafeDescriptorValue(key, meta[key]);
    if (safeVal !== undefined) {
      sanitized[key] = safeVal;
    }
  }

  deriveSafeDescriptors(meta, sanitized);

  if (meta.payload && typeof meta.payload === "object" && !Array.isArray(meta.payload)) {
    const payloadObj = meta.payload as Record<string, unknown>;
    for (const key of ["type", "node", "tool", "route", "fromModel", "toModel"] as const) {
      if (sanitized[key] === undefined && typeof payloadObj[key] === "string") {
        sanitized[key] = payloadObj[key];
      }
    }
    deriveSafeDescriptors(payloadObj, sanitized);
  }

  return sanitized;
}

/**
 * Pure formatter producing strictly one JSON line containing metadata only.
 */
export function formatLogLine(
  level: LogLevel,
  meta: Record<string, unknown>,
  timestamp: string = new Date().toISOString()
): string {
  const cleanMeta = sanitizeLogMetadata(meta);
  const entry: Record<string, unknown> = {
    timestamp: typeof cleanMeta.timestamp === "string" ? cleanMeta.timestamp : timestamp,
    level,
    ...cleanMeta,
  };
  return JSON.stringify(entry);
}

/**
 * Pure formatter converting a TraceEvent + correlation context into a 1-line JSON metadata record.
 */
export function formatTraceLogLine(
  event: TraceEvent,
  context: TraceLogContext,
  timestamp: string = new Date().toISOString()
): string {
  const rawMeta: Record<string, unknown> = {
    event: "trace_event",
    requestId: context.requestId,
    ...(context.conversationId ? { conversationId: context.conversationId } : {}),
    ...(context.userId ? { userId: context.userId } : {}),
    ...(context.seq !== undefined ? { seq: context.seq } : {}),
    type: event.type,
    node: event.node,
    contentLength: event.content.length,
  };

  if (event.type === "action" && "tool" in event) {
    rawMeta.tool = event.tool;
    rawMeta.argKeys = Object.keys(event.args);
  } else if (event.type === "route" && "route" in event) {
    rawMeta.route = event.route;
  } else if (event.type === "fallback" && "fromModel" in event && "toModel" in event) {
    rawMeta.fromModel = event.fromModel;
    rawMeta.toModel = event.toModel;
  }

  return formatLogLine("info", rawMeta, timestamp);
}

/**
 * Pure formatter for request lifecycle completion / failure logs.
 */
export function formatRequestLogLine(
  meta: Record<string, unknown>,
  level: LogLevel = "info",
  timestamp: string = new Date().toISOString()
): string {
  const eventName =
    typeof meta.event === "string"
      ? meta.event
      : level === "error"
        ? "request_failed"
        : "request_completed";

  return formatLogLine(
    level,
    {
      ...meta,
      event: eventName,
    },
    timestamp
  );
}

// ---------------------------------------------------------------------------
// Logger Factory & Global Injectable Sink
// ---------------------------------------------------------------------------

const stdoutSink: LogSink = (line: string) => {
  process.stdout.write(`${line}\n`);
};

let activeSink: LogSink = stdoutSink;

export function setLogSink(sink: LogSink): void {
  activeSink = sink;
}

export function resetLogSink(): void {
  activeSink = stdoutSink;
}

export function createLogger(sink?: LogSink): ILogger {
  const emit = (line: string): string => {
    const targetSink = sink ?? activeSink;
    targetSink(line);
    return line;
  };

  return {
    info(meta: Record<string, unknown>): string {
      return emit(formatLogLine("info", meta));
    },
    warn(meta: Record<string, unknown>): string {
      return emit(formatLogLine("warn", meta));
    },
    error(meta: Record<string, unknown>): string {
      return emit(formatLogLine("error", meta));
    },
    trace(requestId: string, event: TraceEvent, extra?: Omit<TraceLogContext, "requestId">): string {
      return emit(
        formatTraceLogLine(event, {
          requestId,
          conversationId: extra?.conversationId,
          userId: extra?.userId,
          seq: extra?.seq,
        })
      );
    },
  };
}

export const logger: ILogger = createLogger();
export const log: ILogger = logger;
export const defaultLogger: ILogger = logger;
