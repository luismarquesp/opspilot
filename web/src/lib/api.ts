import { buildApiEndpoint } from "./url.js";
import {
  mapApiErrorToMessage,
  parseChatApiResponse,
  type ParsedChatApiResponse,
} from "./trace.js";
import type {
  ApprovalDecision,
  RequestTraceDetails,
  StatsSummaryView,
  StrategyName,
} from "../types/war-room.js";

export interface SendChatParams {
  apiUrl: string;
  message: string;
  conversationId?: string;
  strategy?: StrategyName;
  requireApproval?: boolean;
}

export interface SubmitApprovalParams {
  apiUrl: string;
  approvalId: string;
  conversationId: string;
  message: string;
  decision: ApprovalDecision;
  action?: string;
  tool?: string;
  args?: Record<string, unknown>;
}

async function readJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function sendChatMessage(
  params: SendChatParams
): Promise<ParsedChatApiResponse> {
  const endpoint = buildApiEndpoint(params.apiUrl, "/chat");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: params.message,
        ...(params.conversationId ? { conversationId: params.conversationId } : {}),
        ...(params.strategy ? { strategy: params.strategy } : {}),
        ...(params.requireApproval ? { requireApproval: true } : {}),
      }),
    });

    const headerRequestId = res.headers.get("X-Request-Id") ?? undefined;
    const body = await readJsonSafely(res);
    return parseChatApiResponse(res.status, body, headerRequestId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : undefined;
    return {
      kind: "error",
      statusCode: 0,
      errorCode: "network_error",
      message: mapApiErrorToMessage(
        0,
        "network_error",
        detail
          ? `Falha de conexão com ${params.apiUrl}: ${detail}`
          : undefined
      ),
    };
  }
}

export async function submitApprovalDecision(
  params: SubmitApprovalParams
): Promise<ParsedChatApiResponse> {
  const endpoint = buildApiEndpoint(params.apiUrl, "/chat");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: params.message,
        conversationId: params.conversationId,
        approvalId: params.approvalId,
        decision: params.decision,
        approved: params.decision === "approve",
        ...(params.action ? { action: params.action } : {}),
        ...(params.tool ? { tool: params.tool } : {}),
        ...(params.args ? { args: params.args } : {}),
      }),
    });

    const headerRequestId = res.headers.get("X-Request-Id") ?? undefined;
    const body = await readJsonSafely(res);
    return parseChatApiResponse(res.status, body, headerRequestId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : undefined;
    return {
      kind: "error",
      statusCode: 0,
      errorCode: "network_error",
      message: mapApiErrorToMessage(
        0,
        "network_error",
        detail
          ? `Falha ao enviar decisão para ${params.apiUrl}: ${detail}`
          : undefined
      ),
    };
  }
}

export async function fetchStatsSummary(
  apiUrl: string,
  since: string = "24h"
): Promise<StatsSummaryView> {
  const endpoint = buildApiEndpoint(
    apiUrl,
    `/stats?since=${encodeURIComponent(since)}`
  );
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao carregar /stats`);
  }
  return (await res.json()) as StatsSummaryView;
}

export async function fetchRequestTrace(
  apiUrl: string,
  requestId: string
): Promise<RequestTraceDetails> {
  const endpoint = buildApiEndpoint(
    apiUrl,
    `/requests/${encodeURIComponent(requestId)}`
  );
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao carregar /requests/${requestId}`);
  }
  return (await res.json()) as RequestTraceDetails;
}
