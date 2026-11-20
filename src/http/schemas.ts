import { z } from "zod";
import {
  StrategyResultSchema,
  StrategyMetricsSchema,
  TraceEventSchema,
  type StrategyResult,
  type StrategyMetrics,
  type TraceEvent,
} from "../agents/types.js";

export const StrategyEnumSchema = z.enum(["react", "plan-and-execute", "reflection"]);

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1),
  strategy: StrategyEnumSchema.optional(),
  reflect: z.boolean().optional(),
  conversationId: z.string().optional(),
  userId: z.string().trim().min(1).optional(),
  requireApproval: z.boolean().optional(),
  approvalId: z.string().trim().min(1).optional(),
  decision: z.enum(["approve", "reject"]).optional(),
  approved: z.boolean().optional(),
  action: z.string().trim().min(1).optional(),
  tool: z.string().trim().min(1).optional(),
  args: z.record(z.string(), z.unknown()).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = StrategyResultSchema.extend({
  requestId: z.string().min(1),
  conversationId: z.string(),
  userId: z.string().optional(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const PendingApprovalResponseSchema = z.object({
  status: z.literal("pending_approval"),
  approvalId: z.string().min(1),
  requestId: z.string().min(1),
  conversationId: z.string(),
  action: z.string().min(1),
  tool: z.string().min(1).optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
  message: z.string().min(1),
  trace: z.array(TraceEventSchema).optional(),
  metrics: StrategyMetricsSchema.optional(),
});
export type PendingApprovalResponse = z.infer<typeof PendingApprovalResponseSchema>;

export const ValidationErrorIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
}).passthrough();

export type ValidationErrorIssue = z.infer<typeof ValidationErrorIssueSchema>;

export const ValidationErrorResponseSchema = z.object({
  error: z.literal("validation_error"),
  issues: z.array(ValidationErrorIssueSchema),
});

export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>;

export const UnknownStrategyResponseSchema = z.object({
  error: z.literal("unknown_strategy"),
  strategy: z.string(),
});

export type UnknownStrategyResponse = z.infer<typeof UnknownStrategyResponseSchema>;

export const TimeoutErrorResponseSchema = z.object({
  error: z.literal("gateway_timeout"),
});

export type TimeoutErrorResponse = z.infer<typeof TimeoutErrorResponseSchema>;

export const InternalErrorResponseSchema = z.object({
  error: z.literal("internal_error"),
});

export type InternalErrorResponse = z.infer<typeof InternalErrorResponseSchema>;

// ---------------------------------------------------------------------------
// Memories REST Schemas
// ---------------------------------------------------------------------------

export const CreateMemorySchema = z.object({
  userId: z.string().trim().min(1, "userId is required"),
  fact: z.string().trim().min(1, "fact is required"),
});
export type CreateMemoryRequest = z.infer<typeof CreateMemorySchema>;

export const ListMemoriesQuerySchema = z.object({
  userId: z.string().trim().min(1, "userId query parameter is required"),
});
export type ListMemoriesQuery = z.infer<typeof ListMemoriesQuerySchema>;

export const DeleteMemoryParamsSchema = z.object({
  id: z.coerce.number().int().positive("id must be a positive integer"),
});

export const DeleteMemoryQuerySchema = z.object({
  userId: z.string().trim().min(1, "userId query parameter is required"),
});

export const RecallMemoriesQuerySchema = z.object({
  userId: z.string().trim().min(1, "userId query parameter is required"),
  q: z.string().trim().min(1, "q query parameter is required"),
  limit: z.coerce.number().int().positive().default(3),
});
export type RecallMemoriesQuery = z.infer<typeof RecallMemoriesQuerySchema>;

// ---------------------------------------------------------------------------
// Requests & Persisted Trace REST Schemas
// ---------------------------------------------------------------------------

export const GetRequestParamsSchema = z.object({
  id: z.string().trim().min(1, "id parameter is required"),
});

export const PersistedTraceEventSchema = z.intersection(
  TraceEventSchema,
  z.object({
    seq: z.number().int().nonnegative().optional(),
    requestId: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
);

export const RequestTraceResponseSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  conversationId: z.string(),
  userId: z.string().optional(),
  route: StrategyEnumSchema,
  strategy: StrategyEnumSchema,
  modelUsed: z.string().optional(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  llmCalls: z.number().int().nonnegative(),
  historyMessages: z.number().int().nonnegative(),
  status: z.string(),
  createdAt: z.string(),
  metrics: StrategyMetricsSchema,
  trace: z.array(PersistedTraceEventSchema),
});

export const RequestNotFoundResponseSchema = z.object({
  error: z.literal("request_not_found"),
  requestId: z.string(),
});

// ---------------------------------------------------------------------------
// Stats REST Schemas (`GET /stats?since=24h`)
// ---------------------------------------------------------------------------

export const StatsQuerySchema = z.object({
  since: z
    .string()
    .trim()
    .min(1, "since window cannot be empty")
    .default("24h")
    .refine(
      (val) => /^([1-9]\d*)\s*(s|m|h|d)$/i.test(val) || !Number.isNaN(Date.parse(val)),
      { message: "Invalid since window (expected e.g. 24h, 30m, 7d, or ISO date)" }
    ),
});
export type StatsQuery = z.infer<typeof StatsQuerySchema>;

export const StatsBucketSchema = z.object({
  count: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  erros: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  custo: z.number().nonnegative(),
  tokens: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  p50: z.number().nonnegative(),
  p95: z.number().nonnegative(),
});

export const StatsResponseSchema = z.object({
  since: z.string(),
  total: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  erros: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  custo: z.number().nonnegative(),
  tokens: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  p50: z.number().nonnegative(),
  p95: z.number().nonnegative(),
  latency: z.object({
    p50: z.number().nonnegative(),
    p95: z.number().nonnegative(),
  }),
  byRoute: z.record(z.string(), StatsBucketSchema),
  porRota: z.record(z.string(), StatsBucketSchema),
  byModel: z.record(z.string(), StatsBucketSchema),
  porModelo: z.record(z.string(), StatsBucketSchema),
});
export type StatsResponse = z.infer<typeof StatsResponseSchema>;

