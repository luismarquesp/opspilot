# Technical Research: Context Token Measurement & LangChain Usage

**Feature**: `011-context-tokens-metrics` | **Date**: 2026-10-03

---

## 1. Token Estimation Heuristic

### Decision
Implement `estimateTokens(text: string): number` as:
```typescript
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}
```

### Rationale
- The 4-character-per-token rule (`char / 4`) is standard practice recommended by OpenAI and Anthropic for quick estimation without loading heavy tokenizer WASM/BPE libraries.
- It is instantaneous (O(1)), pure, and runs synchronously with zero dependencies.
- It provides a reliable baseline for context breakdown estimation across prompt components.

### Alternatives Considered
- **`tiktoken` / `gpt-tokenizer`**: Heavy dependency, native bindings or large dictionary bundles, adds unnecessary bundle size and binary build constraints.
- **`@huggingface/transformers` tokenizer**: While already in the repo for embeddings, running tokenization for every prompt breakdown adds microsecond/millisecond latency and is model-dependent.

---

## 2. Real Token Usage Extraction from LangChain / LangGraph

### Decision
Extract token usage from LangChain message streams via:
1. Primary: `msg.usage_metadata` (`input_tokens`, `output_tokens`, `total_tokens`) standard in LangChain.js v0.2+ and `@langchain/core`.
2. Secondary fallback: `msg.response_metadata?.tokenUsage` (`promptTokens`, `completionTokens`, `totalTokens`) returned by OpenAI/OpenRouter adapters.
3. Multi-call aggregation: When multiple AI messages exist in a ReAct loop (`newMessages`), aggregate the tokens across all AI calls.

```typescript
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function extractTokenUsage(messages: readonly unknown[]): TokenUsage {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as {
      usage_metadata?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      response_metadata?: {
        tokenUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
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

  return { promptTokens, completionTokens, totalTokens };
}
```

### Rationale
- Works seamlessly across OpenRouter models (Claude, GPT-4o, Llama 3) which report standard usage metadata.
- Aggregates multi-hop execution (e.g., plan -> tool execution -> replan -> answer) to report complete conversational turn costs.

---

## 3. Context Breakdown by Source

### Decision
Partition the context estimation into distinct operational components:
- `system`: Prompt instructions and tool descriptions.
- `history`: Messages retrieved from `conversationStore.lastMessages(...)`.
- `memories`: Fact strings retrieved from `memoryStore.recall(...)`.
- `userMessage`: Current incoming user prompt.

```typescript
export interface ContextBreakdown {
  system: number;
  history: number;
  memories: number;
  userMessage: number;
  totalEstimated: number;
}
```

### Rationale
- Allows operators to instantly diagnose prompt bloat: "Is my conversation history too long?", "Are semantic memories consuming too many tokens?", or "Is the system prompt oversized?".
- Transparently visualizes context scaling turn-over-turn.

---

## 4. Multi-Turn Verification Script (`conversa-long.sh`)

### Decision
Provide a portable bash script `conversa-long.sh` that uses `curl` and `jq` (with fallback to python/node for JSON extraction if `jq` is absent):
- Target: `http://localhost:3000/chat`.
- Maintains a single `conversationId` across 3+ consecutive turns.
- Formats each turn:
  ```
  Turn 1: promptTokens=420 | historyMessages=0 | user="Qual o status geral?"
  Turn 2: promptTokens=560 | historyMessages=2 | user="Quais incidentes estão abertos?"
  Turn 3: promptTokens=710 | historyMessages=4 | user="Qual o runbook do checkout?"
  ```
