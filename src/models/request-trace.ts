import type { StrategyMetrics, TraceEvent, TraceEventType } from "../agents/types.js";

// ---------------------------------------------------------------------------
// Persisted Request & Trace Event Domain Types
// ---------------------------------------------------------------------------

export interface SaveRequestRowInput {
  id: string;
  requestId?: string;
  conversationId?: string;
  userId?: string;
  route?: string;
  strategy?: string;
  modelUsed?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  llmCalls?: number;
  historyMessages?: number;
  contextBreakdown?: StrategyMetrics["contextBreakdown"];
  status?: string;
  createdAt?: string;
}

export interface SaveTraceEventRowInput {
  requestId: string;
  seq: number;
  node: string;
  type: TraceEventType | string;
  content?: string;
  timestamp?: number;
  payload: TraceEvent | Record<string, unknown>;
}

export interface SaveRequestTraceInput {
  requestId: string;
  conversationId: string;
  userId?: string;
  strategy: "react" | "plan-and-execute" | "reflection";
  route?: "react" | "plan-and-execute" | "reflection";
  status?: string;
  metrics: StrategyMetrics;
  trace: TraceEvent[];
  createdAt?: string;
}

export interface RequestRecord {
  id: string;
  requestId: string;
  conversationId: string;
  userId?: string;
  route: "react" | "plan-and-execute" | "reflection";
  strategy: "react" | "plan-and-execute" | "reflection";
  modelUsed?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  llmCalls: number;
  historyMessages: number;
  status: string;
  createdAt: string;
  metrics: StrategyMetrics;
}

export type PersistedTraceEvent = TraceEvent & {
  seq: number;
  requestId: string;
  payload: Record<string, unknown>;
};

export interface RequestWithTrace extends RequestRecord {
  request: RequestRecord;
  trace: PersistedTraceEvent[];
}

export interface StatsBucket {
  count: number;
  total: number;
  errors: number;
  erros: number;
  cost: number;
  custo: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  p50: number;
  p95: number;
}

export interface RequestsStatsResult {
  since: string;
  total: number;
  errors: number;
  erros: number;
  cost: number;
  custo: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  p50: number;
  p95: number;
  latency: {
    p50: number;
    p95: number;
  };
  byRoute: Record<string, StatsBucket>;
  porRota: Record<string, StatsBucket>;
  byModel: Record<string, StatsBucket>;
  porModelo: Record<string, StatsBucket>;
}

export interface IRequestTraceStore {
  saveRequest(input: SaveRequestTraceInput): void;
  saveRequestRow(input: SaveRequestRowInput): void;
  saveTraceEventRow(input: SaveTraceEventRowInput): void;
  getRequest(requestId: string): RequestRecord | null;
  listRequests(sinceIso?: string): RequestRecord[];
  getStats(since?: string, nowMs?: number): RequestsStatsResult;
  getTraceEvents(requestId: string): PersistedTraceEvent[];
  getRequestWithTrace(requestId: string): RequestWithTrace | null;
  readonly requests: {
    save(input: SaveRequestRowInput): void;
    get(id: string): RequestRecord | null;
    stats(since?: string, nowMs?: number): RequestsStatsResult;
  };
  readonly traceEvents: {
    save(input: SaveTraceEventRowInput): void;
    listByRequest(requestId: string): PersistedTraceEvent[];
  };
  close?(): void;
}
