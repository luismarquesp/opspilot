import type { TokenUsage, ContextBreakdown } from "../agents/types.js";

export interface ContextBreakdownInput {
  system?: string;
  history?: readonly { role: string; content: string }[];
  summary?: string;
  memories?: readonly (string | { fact: string })[];
  userMessage?: string;
}

/**
 * Estimates token count from text using the standard heuristic of ~4 characters per token.
 * Returns 0 for null, undefined, or empty strings.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text || text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

/**
 * Extracts and aggregates real token counts from LangChain / LangGraph AI messages.
 * Checks for standard `msg.usage_metadata` (input_tokens, output_tokens, total_tokens)
 * or adapter-specific `msg.response_metadata.tokenUsage`.
 */
export function extractTokenUsage(messages: readonly unknown[]): TokenUsage {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  if (!Array.isArray(messages)) {
    return { promptTokens, completionTokens, totalTokens };
  }

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;

    const m = msg as {
      usage_metadata?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      };
      response_metadata?: {
        tokenUsage?: {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        };
      };
    };

    if (m.usage_metadata) {
      promptTokens += Number(m.usage_metadata.input_tokens ?? 0);
      completionTokens += Number(m.usage_metadata.output_tokens ?? 0);
      totalTokens += Number(m.usage_metadata.total_tokens ?? 0);
    } else if (m.response_metadata?.tokenUsage) {
      promptTokens += Number(m.response_metadata.tokenUsage.promptTokens ?? 0);
      completionTokens += Number(m.response_metadata.tokenUsage.completionTokens ?? 0);
      totalTokens += Number(m.response_metadata.tokenUsage.totalTokens ?? 0);
    }
  }

  // If totalTokens was not explicitly provided by the provider, compute prompt + completion
  if (totalTokens === 0 && (promptTokens > 0 || completionTokens > 0)) {
    totalTokens = promptTokens + completionTokens;
  }

  return { promptTokens, completionTokens, totalTokens };
}

/**
 * Estimates token consumption partitioned by prompt source (system prompt, conversation history,
 * rolling summary, semantic memories, and user query).
 */
export function estimateContextBreakdown(input: ContextBreakdownInput): ContextBreakdown {
  const system = estimateTokens(input.system);

  let history = 0;
  if (Array.isArray(input.history)) {
    for (const h of input.history) {
      history += estimateTokens(h.content);
    }
  }

  const summary = estimateTokens(input.summary);

  let memories = 0;
  if (Array.isArray(input.memories)) {
    for (const m of input.memories) {
      const text = typeof m === "string" ? m : (m as { fact?: string })?.fact;
      memories += estimateTokens(text);
    }
  }

  const userMessage = estimateTokens(input.userMessage);
  const totalEstimated = system + history + summary + memories + userMessage;

  return {
    system,
    history,
    summary,
    memories,
    userMessage,
    totalEstimated,
  };
}
