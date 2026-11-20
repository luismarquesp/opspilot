export type StrategyName = "react" | "plan-and-execute" | "reflection";

export type TraceEventType =
  | "thought"
  | "action"
  | "observation"
  | "plan"
  | "critique"
  | "answer"
  | "summarize"
  | "route"
  | "fallback";

export interface BaseTraceEvent {
  type: TraceEventType;
  node: string;
  content: string;
  timestamp: number;
  seq?: number;
}

export interface ActionTraceEvent extends BaseTraceEvent {
  type: "action";
  tool: string;
  args: Record<string, unknown>;
}

export interface RouteTraceEvent extends BaseTraceEvent {
  type: "route";
  route: StrategyName;
  reason: string;
}

export interface FallbackTraceEvent extends BaseTraceEvent {
  type: "fallback";
  fromModel: string;
  toModel: string;
  reason: string;
}

export interface StandardTraceEvent extends BaseTraceEvent {
  type: "thought" | "observation" | "plan" | "critique" | "answer" | "summarize";
}

export type TypedTraceEvent =
  | ActionTraceEvent
  | RouteTraceEvent
  | FallbackTraceEvent
  | StandardTraceEvent;

export interface StrategyMetrics {
  llmCalls: number;
  latencyMs: number;
  historyMessages?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  modelUsed?: string;
}

export interface ChatSuccessPayload {
  requestId: string;
  conversationId: string;
  answer: string;
  selectedRoute?: StrategyName;
  routeReason?: string;
  trace: TypedTraceEvent[];
  metrics: StrategyMetrics;
  approved?: boolean;
  approvalId?: string;
}

export type ApprovalDecision = "approve" | "reject";
export type ApprovalStatus = "pending" | "submitting" | "approved" | "rejected" | "error";

export interface PendingApprovalPayload {
  status: "pending_approval";
  approvalId: string;
  requestId: string;
  conversationId: string;
  action: string;
  tool?: string;
  args?: Record<string, unknown>;
  reason?: string;
  message: string;
  originalMessage?: string;
  trace?: TypedTraceEvent[];
  metrics?: StrategyMetrics;
}

export type ChatTimelineItem =
  | {
      kind: "user";
      id: string;
      message: string;
      strategy?: StrategyName;
      requireApproval?: boolean;
      timestamp: number;
    }
  | {
      kind: "assistant";
      id: string;
      requestId: string;
      conversationId: string;
      answer: string;
      selectedRoute?: StrategyName;
      routeReason?: string;
      trace: TypedTraceEvent[];
      metrics: StrategyMetrics;
      timestamp: number;
    }
  | {
      kind: "approval";
      id: string;
      requestId: string;
      conversationId: string;
      originalMessage: string;
      payload: PendingApprovalPayload;
      approvalStatus: ApprovalStatus;
      resolutionAnswer?: string;
      resolutionTrace?: TypedTraceEvent[];
      resolutionMetrics?: StrategyMetrics;
      resolutionError?: string;
      timestamp: number;
    }
  | {
      kind: "error";
      id: string;
      statusCode: number;
      errorCode: string;
      message: string;
      requestId?: string;
      retryMessage?: string;
      retryStrategy?: StrategyName;
      retryRequireApproval?: boolean;
      timestamp: number;
    };

export interface WarRoomSettings {
  apiUrl: string;
  theme: "dark" | "light";
}

export interface StatsBucketView {
  count: number;
  total: number;
  errors: number;
  cost: number;
  tokens: number;
  p50: number;
  p95: number;
}

export interface StatsSummaryView {
  since: string;
  total: number;
  errors: number;
  cost: number;
  tokens: number;
  p50: number;
  p95: number;
  byRoute: Record<string, StatsBucketView>;
  byModel: Record<string, StatsBucketView>;
}

export interface RequestTraceDetails {
  id: string;
  requestId: string;
  conversationId: string;
  route: StrategyName;
  modelUsed?: string;
  latencyMs: number;
  status: string;
  createdAt: string;
  metrics: StrategyMetrics;
  trace: TypedTraceEvent[];
}
