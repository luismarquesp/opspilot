# Contract: Conversation Summary & Pruning API

**Feature**: `012-history-summary-pruning` | **Date**: 2026-10-03

---

## 1. Summarizer Contract (`src/context/summarizer.ts`)

```typescript
import type { ConversationMessage } from "../models/conversation.js";

export interface IConversationSummarizer {
  summarize(previousSummary: string | null, newMessages: readonly ConversationMessage[]): Promise<string>;
}
```

### Prompt Specification
- Preserves **decisões tomadas** (restarts, mitigations, incident changes).
- Preserves **fatos operacionais descobertos** (errors, root causes, findings).
- Preserves **pendências / tarefas em aberto** (unresolved investigations).
- Merges with `previousSummary` smoothly without duplicating obsolete details.
- Length target: ~150 tokens.

---

## 2. Store Contract (`src/models/conversation.ts`)

```typescript
export interface ConversationSummary {
  conversationId: string;
  summary: string;
  lastSummarizedMessageId: number;
  updatedAt: Date;
}

export interface IConversationStore {
  create(): string;
  append(conversationId: string, role: "user" | "assistant", content: string): void;
  lastMessages(conversationId: string, limit?: number): ConversationMessage[];
  getSummary(conversationId: string): ConversationSummary | null;
  setSummary(conversationId: string, summary: string, lastSummarizedMessageId: number): void;
  getEvictedUnsummarizedMessages(conversationId: string, windowSize?: number): ConversationMessage[];
  close(): void;
}
```

---

## 3. HTTP `/chat` Trace & Breakdown Contract

### Response Trace Event (When Summarization Occurs)
```json
{
  "type": "summarize",
  "content": "Decisões: Incidente inc-101 aberto com severidade critical para checkout. Fatos: Pods reiniciados com OOMKilled no cluster k8s. Pendências: Investigar vazamento de memória em payment-api.",
  "timestamp": 1727958120000
}
```

### Response Metrics Breakdown
```json
"metrics": {
  "llmCalls": 2,
  "latencyMs": 1340,
  "historyMessages": 8,
  "promptTokens": 620,
  "completionTokens": 95,
  "totalTokens": 715,
  "contextBreakdown": {
    "system": 120,
    "summary": 152,
    "history": 310,
    "memories": 85,
    "userMessage": 25,
    "totalEstimated": 692
  }
}
```
