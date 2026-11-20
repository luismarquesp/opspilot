import { DatabaseSync, type StatementSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { ContextBreakdown, StrategyMetrics, TraceEvent, TraceEventType } from "../agents/types.js";
import type {
  IRequestTraceStore,
  PersistedTraceEvent,
  RequestRecord,
  RequestsStatsResult,
  RequestWithTrace,
  SaveRequestRowInput,
  SaveRequestTraceInput,
  SaveTraceEventRowInput,
} from "../models/request-trace.js";
import { computeRequestsStats, parseSinceWindow } from "../obs/stats.js";

// ---------------------------------------------------------------------------
// DB Row Shapes
// ---------------------------------------------------------------------------

interface RequestRow {
  id: string;
  conversation_id: string;
  user_id: string | null;
  route: string;
  strategy: string;
  model_used: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  llm_calls: number;
  history_messages: number;
  context_breakdown: string | null;
  status: string;
  created_at: string;
}

interface TraceEventRow {
  id: number;
  request_id: string;
  seq: number;
  node: string;
  type: string;
  content: string;
  timestamp: number;
  payload: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pure Helpers: Payload Extraction & Record Reconstruction
// ---------------------------------------------------------------------------

const BASE_TRACE_KEYS = new Set(["type", "node", "content", "timestamp", "seq", "requestId"]);

export function extractTracePayload(
  eventOrPayload: TraceEvent | Record<string, unknown>
): Record<string, unknown> {
  if (!eventOrPayload || typeof eventOrPayload !== "object") {
    return {};
  }

  const record = eventOrPayload as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : undefined;

  if (type === "action") {
    return {
      ...(typeof record.tool === "string" ? { tool: record.tool } : {}),
      ...(record.args && typeof record.args === "object" ? { args: record.args } : { args: {} }),
    };
  }

  if (type === "route") {
    return {
      ...(typeof record.route === "string" ? { route: record.route } : {}),
      ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    };
  }

  if (type === "fallback") {
    return {
      ...(typeof record.fromModel === "string" ? { fromModel: record.fromModel } : {}),
      ...(typeof record.toModel === "string" ? { toModel: record.toModel } : {}),
      ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    };
  }

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (!BASE_TRACE_KEYS.has(k) && v !== undefined) {
      extra[k] = v;
    }
  }
  return extra;
}

export function reconstructTraceEvent(row: TraceEventRow): PersistedTraceEvent {
  let parsedPayload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.payload);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      parsedPayload = parsed as Record<string, unknown>;
    }
  } catch {
    parsedPayload = {};
  }

  const base = {
    type: row.type as TraceEventType,
    node: row.node,
    content: row.content,
    timestamp: row.timestamp,
  };

  if (row.type === "action") {
    return {
      ...base,
      type: "action",
      tool: typeof parsedPayload.tool === "string" ? parsedPayload.tool : "unknown_tool",
      args:
        parsedPayload.args && typeof parsedPayload.args === "object" && !Array.isArray(parsedPayload.args)
          ? (parsedPayload.args as Record<string, unknown>)
          : {},
      seq: row.seq,
      requestId: row.request_id,
      payload: parsedPayload,
    };
  }

  if (row.type === "route") {
    const route =
      parsedPayload.route === "react" ||
      parsedPayload.route === "plan-and-execute" ||
      parsedPayload.route === "reflection"
        ? parsedPayload.route
        : "react";
    return {
      ...base,
      type: "route",
      route,
      reason: typeof parsedPayload.reason === "string" ? parsedPayload.reason : "",
      seq: row.seq,
      requestId: row.request_id,
      payload: parsedPayload,
    };
  }

  if (row.type === "fallback") {
    return {
      ...base,
      type: "fallback",
      fromModel: typeof parsedPayload.fromModel === "string" ? parsedPayload.fromModel : "unknown",
      toModel: typeof parsedPayload.toModel === "string" ? parsedPayload.toModel : "unknown",
      reason: typeof parsedPayload.reason === "string" ? parsedPayload.reason : "",
      seq: row.seq,
      requestId: row.request_id,
      payload: parsedPayload,
    };
  }

  return {
    ...parsedPayload,
    ...base,
    type: row.type as Exclude<TraceEventType, "action" | "route" | "fallback">,
    seq: row.seq,
    requestId: row.request_id,
    payload: parsedPayload,
  };
}

function normalizeStrategy(val?: string): "react" | "plan-and-execute" | "reflection" {
  if (val === "plan-and-execute" || val === "reflection" || val === "react") {
    return val;
  }
  return "react";
}

function toRequestRecord(row: RequestRow): RequestRecord {
  let contextBreakdown: ContextBreakdown | undefined;
  if (row.context_breakdown) {
    try {
      contextBreakdown = JSON.parse(row.context_breakdown) as ContextBreakdown;
    } catch {
      contextBreakdown = undefined;
    }
  }

  const route = normalizeStrategy(row.route);
  const strategy = normalizeStrategy(row.strategy);

  const metrics: StrategyMetrics = {
    llmCalls: row.llm_calls,
    latencyMs: row.latency_ms,
    historyMessages: row.history_messages,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    ...(contextBreakdown ? { contextBreakdown } : {}),
    ...(row.model_used ? { modelUsed: row.model_used } : {}),
  };

  return {
    id: row.id,
    requestId: row.id,
    conversationId: row.conversation_id,
    ...(row.user_id ? { userId: row.user_id } : {}),
    route,
    strategy,
    ...(row.model_used ? { modelUsed: row.model_used } : {}),
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    latencyMs: row.latency_ms,
    llmCalls: row.llm_calls,
    historyMessages: row.history_messages,
    status: row.status,
    createdAt: row.created_at,
    metrics,
  };
}

// ---------------------------------------------------------------------------
// SqliteRequestTraceStore
// ---------------------------------------------------------------------------

export class SqliteRequestTraceStore implements IRequestTraceStore {
  readonly #db: DatabaseSync;

  readonly #stmtUpsertRequest: StatementSync;
  readonly #stmtGetRequest: StatementSync;
  readonly #stmtListRequestsAll: StatementSync;
  readonly #stmtUpsertTraceEvent: StatementSync;
  readonly #stmtListTraceEvents: StatementSync;
  readonly #stmtDeleteTraceEventsByRequest: StatementSync;

  readonly requests: IRequestTraceStore["requests"];
  readonly traceEvents: IRequestTraceStore["traceEvents"];

  constructor(
    dbPath: string = process.env.OPSPILOT_DB ?? path.resolve(process.cwd(), "data/opspilot.db")
  ) {
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.#db = new DatabaseSync(dbPath);
    this.#db.exec("PRAGMA busy_timeout = 5000;");
    this.#runDDL();

    this.#stmtUpsertRequest = this.#db.prepare(`
      INSERT INTO requests (
        id,
        conversation_id,
        user_id,
        route,
        strategy,
        model_used,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        latency_ms,
        llm_calls,
        history_messages,
        context_breakdown,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        conversation_id = CASE
          WHEN excluded.conversation_id <> '' THEN excluded.conversation_id
          ELSE requests.conversation_id
        END,
        user_id = COALESCE(excluded.user_id, requests.user_id),
        route = excluded.route,
        strategy = excluded.strategy,
        model_used = COALESCE(excluded.model_used, requests.model_used),
        prompt_tokens = CASE
          WHEN excluded.prompt_tokens > 0 THEN excluded.prompt_tokens
          ELSE requests.prompt_tokens
        END,
        completion_tokens = CASE
          WHEN excluded.completion_tokens > 0 THEN excluded.completion_tokens
          ELSE requests.completion_tokens
        END,
        total_tokens = CASE
          WHEN excluded.total_tokens > 0 THEN excluded.total_tokens
          ELSE requests.total_tokens
        END,
        latency_ms = excluded.latency_ms,
        llm_calls = CASE
          WHEN excluded.llm_calls > 0 THEN excluded.llm_calls
          ELSE requests.llm_calls
        END,
        history_messages = CASE
          WHEN excluded.history_messages > 0 THEN excluded.history_messages
          ELSE requests.history_messages
        END,
        context_breakdown = COALESCE(excluded.context_breakdown, requests.context_breakdown),
        status = excluded.status
    `);

    this.#stmtGetRequest = this.#db.prepare(`
      SELECT
        id,
        conversation_id,
        user_id,
        route,
        strategy,
        model_used,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        latency_ms,
        llm_calls,
        history_messages,
        context_breakdown,
        status,
        created_at
      FROM requests
      WHERE id = ?
    `);

    this.#stmtListRequestsAll = this.#db.prepare(`
      SELECT
        id,
        conversation_id,
        user_id,
        route,
        strategy,
        model_used,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        latency_ms,
        llm_calls,
        history_messages,
        context_breakdown,
        status,
        created_at
      FROM requests
      ORDER BY created_at DESC
    `);

    this.#stmtUpsertTraceEvent = this.#db.prepare(`
      INSERT INTO trace_events (
        request_id,
        seq,
        node,
        type,
        content,
        timestamp,
        payload,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(request_id, seq) DO UPDATE SET
        node = excluded.node,
        type = excluded.type,
        content = excluded.content,
        timestamp = excluded.timestamp,
        payload = excluded.payload
    `);

    this.#stmtListTraceEvents = this.#db.prepare(`
      SELECT id, request_id, seq, node, type, content, timestamp, payload, created_at
      FROM trace_events
      WHERE request_id = ?
      ORDER BY seq ASC, id ASC
    `);

    this.#stmtDeleteTraceEventsByRequest = this.#db.prepare(`
      DELETE FROM trace_events WHERE request_id = ?
    `);

    this.requests = {
      save: (input: SaveRequestRowInput) => this.saveRequestRow(input),
      get: (id: string) => this.getRequest(id),
      stats: (since?: string, nowMs?: number) => this.getStats(since, nowMs),
    };

    this.traceEvents = {
      save: (input: SaveTraceEventRowInput) => this.saveTraceEventRow(input),
      listByRequest: (requestId: string) => this.getTraceEvents(requestId),
    };
  }

  #runDDL(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id                TEXT    PRIMARY KEY,
        conversation_id   TEXT    NOT NULL DEFAULT '',
        user_id           TEXT,
        route             TEXT    NOT NULL,
        strategy          TEXT    NOT NULL,
        model_used        TEXT,
        prompt_tokens     INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens      INTEGER NOT NULL DEFAULT 0,
        latency_ms        INTEGER NOT NULL DEFAULT 0,
        llm_calls         INTEGER NOT NULL DEFAULT 0,
        history_messages  INTEGER NOT NULL DEFAULT 0,
        context_breakdown TEXT,
        status            TEXT    NOT NULL DEFAULT 'ok',
        created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS trace_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id  TEXT    NOT NULL,
        seq         INTEGER NOT NULL,
        node        TEXT    NOT NULL,
        type        TEXT    NOT NULL,
        content     TEXT    NOT NULL DEFAULT '',
        timestamp   INTEGER NOT NULL DEFAULT 0,
        payload     TEXT    NOT NULL DEFAULT '{}',
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(request_id, seq)
      );

      CREATE INDEX IF NOT EXISTS idx_trace_events_request_seq
        ON trace_events (request_id, seq ASC);
    `);
  }

  saveRequestRow(input: SaveRequestRowInput): void {
    const id = input.id || input.requestId || "";
    const route = normalizeStrategy(input.route ?? input.strategy);
    const strategy = normalizeStrategy(input.strategy ?? input.route);
    const createdAt = input.createdAt ?? new Date().toISOString();
    const breakdownJson = input.contextBreakdown ? JSON.stringify(input.contextBreakdown) : null;

    this.#stmtUpsertRequest.run(
      id,
      input.conversationId ?? "",
      input.userId ?? null,
      route,
      strategy,
      input.modelUsed ?? null,
      input.promptTokens ?? 0,
      input.completionTokens ?? 0,
      input.totalTokens ?? input.promptTokens ?? 0,
      input.latencyMs ?? 0,
      input.llmCalls ?? 0,
      input.historyMessages ?? 0,
      breakdownJson,
      input.status ?? "ok",
      createdAt
    );
  }

  saveTraceEventRow(input: SaveTraceEventRowInput): void {
    const payloadObj =
      input.payload && typeof input.payload === "object" ? input.payload : {};
    const payloadRecord = payloadObj as Record<string, unknown>;
    const content =
      input.content ??
      (typeof payloadRecord.content === "string" ? payloadRecord.content : "");
    const timestamp =
      input.timestamp ??
      (typeof payloadRecord.timestamp === "number" ? payloadRecord.timestamp : Date.now());
    const extracted = extractTracePayload(payloadRecord);
    const createdAt = new Date().toISOString();

    this.#stmtUpsertTraceEvent.run(
      input.requestId,
      input.seq,
      input.node,
      input.type,
      content,
      timestamp,
      JSON.stringify(extracted),
      createdAt
    );
  }

  saveRequest(input: SaveRequestTraceInput): void {
    const route = input.route ?? input.strategy;
    this.saveRequestRow({
      id: input.requestId,
      requestId: input.requestId,
      conversationId: input.conversationId,
      userId: input.userId,
      route,
      strategy: input.strategy,
      modelUsed: input.metrics.modelUsed,
      promptTokens: input.metrics.promptTokens ?? 0,
      completionTokens: input.metrics.completionTokens ?? 0,
      totalTokens: input.metrics.totalTokens ?? input.metrics.promptTokens ?? 0,
      latencyMs: input.metrics.latencyMs ?? 0,
      llmCalls: input.metrics.llmCalls ?? 0,
      historyMessages: input.metrics.historyMessages ?? 0,
      contextBreakdown: input.metrics.contextBreakdown,
      status: input.status ?? "ok",
      createdAt: input.createdAt,
    });

    this.#stmtDeleteTraceEventsByRequest.run(input.requestId);
    input.trace.forEach((event, seq) => {
      this.saveTraceEventRow({
        requestId: input.requestId,
        seq,
        node: event.node || route,
        type: event.type,
        content: event.content,
        timestamp: event.timestamp,
        payload: event,
      });
    });
  }

  getRequest(requestId: string): RequestRecord | null {
    const row = this.#stmtGetRequest.get(requestId) as unknown as RequestRow | undefined;
    if (!row) return null;
    return toRequestRecord(row);
  }

  listRequests(sinceIso?: string): RequestRecord[] {
    const rows = this.#stmtListRequestsAll.all() as unknown as RequestRow[];
    const records = rows.map(toRequestRecord);
    if (!sinceIso) return records;
    const window = parseSinceWindow(sinceIso);
    return records.filter((r) => Date.parse(r.createdAt) >= window.cutoffMs);
  }

  getStats(since: string = "24h", nowMs: number = Date.now()): RequestsStatsResult {
    return computeRequestsStats(this.listRequests(), since, nowMs);
  }

  getTraceEvents(requestId: string): PersistedTraceEvent[] {
    const rows = this.#stmtListTraceEvents.all(requestId) as unknown as TraceEventRow[];
    return rows.map(reconstructTraceEvent);
  }

  getRequestWithTrace(requestId: string): RequestWithTrace | null {
    const record = this.getRequest(requestId);
    if (!record) return null;
    const trace = this.getTraceEvents(requestId);
    return {
      ...record,
      request: record,
      trace,
    };
  }

  close(): void {
    this.#db.close();
  }
}

// ---------------------------------------------------------------------------
// Default Store & Facades (`requests` / `traceEvents`)
// ---------------------------------------------------------------------------

let defaultRequestTraceStore: IRequestTraceStore | undefined;

export function getDefaultRequestTraceStore(): IRequestTraceStore {
  if (!defaultRequestTraceStore) {
    const isTest =
      process.env.NODE_ENV === "test" ||
      Boolean(process.env.NODE_TEST_CONTEXT) ||
      process.execArgv.includes("--test") ||
      process.argv.includes("--test");
    const dbPath = process.env.OPSPILOT_DB ?? (isTest ? ":memory:" : undefined);
    defaultRequestTraceStore = new SqliteRequestTraceStore(dbPath);
  }
  return defaultRequestTraceStore;
}

export function setDefaultRequestTraceStore(store: IRequestTraceStore | undefined): void {
  defaultRequestTraceStore = store;
}

export const requests: IRequestTraceStore["requests"] = {
  save(input: SaveRequestRowInput): void {
    getDefaultRequestTraceStore().requests.save(input);
  },
  get(id: string): RequestRecord | null {
    return getDefaultRequestTraceStore().requests.get(id);
  },
  stats(since?: string, nowMs?: number): RequestsStatsResult {
    return getDefaultRequestTraceStore().requests.stats(since, nowMs);
  },
};

export const traceEvents: IRequestTraceStore["traceEvents"] = {
  save(input: SaveTraceEventRowInput): void {
    getDefaultRequestTraceStore().traceEvents.save(input);
  },
  listByRequest(requestId: string): PersistedTraceEvent[] {
    return getDefaultRequestTraceStore().traceEvents.listByRequest(requestId);
  },
};
