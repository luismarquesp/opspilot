import type { RequestRecord, RequestsStatsResult, StatsBucket } from "../models/request-trace.js";

// ---------------------------------------------------------------------------
// Domain Error
// ---------------------------------------------------------------------------

export class InvalidStatsWindowError extends Error {
  readonly code = "invalid_stats_window";

  constructor(since: string) {
    super(`Invalid stats time window: "${since}". Expected e.g. "24h", "30m", "7d", or ISO date.`);
    this.name = "InvalidStatsWindowError";
  }
}

// ---------------------------------------------------------------------------
// Time Window Parsing (Pure)
// ---------------------------------------------------------------------------

const DURATION_UNITS_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export interface ParsedSinceWindow {
  since: string;
  cutoffMs: number;
  cutoffIso: string;
}

export function parseSinceWindow(
  since: string = "24h",
  nowMs: number = Date.now()
): ParsedSinceWindow {
  const trimmed = typeof since === "string" ? since.trim() : "";
  if (!trimmed) {
    throw new InvalidStatsWindowError(since);
  }

  const durationMatch = /^([1-9]\d*)\s*(s|m|h|d)$/i.exec(trimmed);
  if (durationMatch) {
    const amount = Number(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    const cutoffMs = nowMs - amount * DURATION_UNITS_MS[unit];
    return {
      since: `${amount}${unit}`,
      cutoffMs,
      cutoffIso: new Date(cutoffMs).toISOString(),
    };
  }

  const parsedMs = Date.parse(trimmed);
  if (!Number.isNaN(parsedMs) && Number.isFinite(parsedMs)) {
    return {
      since: trimmed,
      cutoffMs: parsedMs,
      cutoffIso: new Date(parsedMs).toISOString(),
    };
  }

  throw new InvalidStatsWindowError(since);
}

// ---------------------------------------------------------------------------
// Model Pricing & Cost Calculation (Pure)
// ---------------------------------------------------------------------------

interface ModelRates {
  inputPer1M: number;
  outputPer1M: number;
}

const DEFAULT_MODEL_RATES: ModelRates = {
  inputPer1M: 0.15,
  outputPer1M: 0.60,
};

const MODEL_RATE_RULES: ReadonlyArray<{ pattern: string; rates: ModelRates }> = [
  { pattern: "openai/gpt-4o-mini", rates: { inputPer1M: 0.15, outputPer1M: 0.60 } },
  { pattern: "openai/gpt-4o", rates: { inputPer1M: 2.50, outputPer1M: 10.00 } },
  { pattern: "anthropic/claude-3.5-sonnet", rates: { inputPer1M: 3.00, outputPer1M: 15.00 } },
];

function resolveModelRates(modelUsed: string): ModelRates {
  const normalized = modelUsed.trim().toLowerCase();
  const match = MODEL_RATE_RULES.find((rule) => normalized.includes(rule.pattern));
  return match ? match.rates : DEFAULT_MODEL_RATES;
}

/**
 * Estimates USD cost for a request based on model identifier and token usage.
 * Models containing ":free" (e.g. OpenRouter free tier) always cost 0.
 */
export function calculateModelCost(
  modelUsed: string | undefined | null,
  promptTokens: number,
  completionTokens: number = 0
): number {
  if (typeof modelUsed === "string" && modelUsed.toLowerCase().includes(":free")) {
    return 0;
  }

  const safePrompt = Math.max(0, Number.isFinite(promptTokens) ? promptTokens : 0);
  const safeCompletion = Math.max(0, Number.isFinite(completionTokens) ? completionTokens : 0);
  if (safePrompt === 0 && safeCompletion === 0) {
    return 0;
  }

  const rates = modelUsed ? resolveModelRates(modelUsed) : DEFAULT_MODEL_RATES;
  const cost =
    (safePrompt / 1_000_000) * rates.inputPer1M +
    (safeCompletion / 1_000_000) * rates.outputPer1M;

  return Number(cost.toFixed(8));
}

// ---------------------------------------------------------------------------
// Percentile & Bucket Aggregation (Pure)
// ---------------------------------------------------------------------------

export function calculatePercentile(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rawIdx = Math.ceil((percentile / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rawIdx));
  return sorted[index];
}

function parseTimestampMs(raw: string): number {
  // Normalize SQLite datetime('now') format ("YYYY-MM-DD HH:MM:SS") to UTC ISO
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(" ", "T")}Z`
    : raw;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? 0 : ms;
}

function isErrorStatus(status: string): boolean {
  return status !== "ok" && status !== "completed";
}

function summarizeBucket(records: readonly RequestRecord[]): StatsBucket {
  let errors = 0;
  let cost = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  const latencies: number[] = [];

  for (const r of records) {
    if (isErrorStatus(r.status)) {
      errors += 1;
    }
    const pTokens = Math.max(0, r.promptTokens ?? 0);
    const cTokens = Math.max(0, r.completionTokens ?? 0);
    const tTokens = Math.max(pTokens + cTokens, r.totalTokens ?? 0);

    promptTokens += pTokens;
    completionTokens += cTokens;
    totalTokens += tTokens;
    cost += calculateModelCost(r.modelUsed, pTokens, cTokens);
    latencies.push(Math.max(0, r.latencyMs ?? 0));
  }

  const roundedCost = Number(cost.toFixed(8));
  const p50 = calculatePercentile(latencies, 50);
  const p95 = calculatePercentile(latencies, 95);

  return {
    count: records.length,
    total: records.length,
    errors,
    erros: errors,
    cost: roundedCost,
    custo: roundedCost,
    tokens: totalTokens,
    promptTokens,
    completionTokens,
    totalTokens,
    p50,
    p95,
  };
}

function groupByKey(
  records: readonly RequestRecord[],
  keySelector: (record: RequestRecord) => string
): Record<string, StatsBucket> {
  const groups = new Map<string, RequestRecord[]>();
  for (const r of records) {
    const key = keySelector(r);
    const list = groups.get(key);
    if (list) {
      list.push(r);
    } else {
      groups.set(key, [r]);
    }
  }

  const out: Record<string, StatsBucket> = {};
  for (const [key, list] of groups.entries()) {
    out[key] = summarizeBucket(list);
  }
  return out;
}

export function computeRequestsStats(
  records: readonly RequestRecord[],
  since: string = "24h",
  nowMs: number = Date.now()
): RequestsStatsResult {
  const window = parseSinceWindow(since, nowMs);
  const filtered = records.filter((r) => parseTimestampMs(r.createdAt) >= window.cutoffMs);

  const overall = summarizeBucket(filtered);
  const byRoute = groupByKey(filtered, (r) => r.route || r.strategy || "react");
  const byModel = groupByKey(filtered, (r) => r.modelUsed || "unknown");

  return {
    since: window.since,
    total: overall.total,
    errors: overall.errors,
    erros: overall.erros,
    cost: overall.cost,
    custo: overall.custo,
    tokens: overall.tokens,
    promptTokens: overall.promptTokens,
    completionTokens: overall.completionTokens,
    totalTokens: overall.totalTokens,
    p50: overall.p50,
    p95: overall.p95,
    latency: {
      p50: overall.p50,
      p95: overall.p95,
    },
    byRoute,
    porRota: byRoute,
    byModel,
    porModelo: byModel,
  };
}
