# Contract: Context Tokens & Metrics API

**Feature**: `011-context-tokens-metrics` | **Date**: 2026-10-03

---

## 1. Module Contract: `src/context/tokens.ts`

```typescript
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ContextBreakdown {
  system: number;
  history: number;
  memories: number;
  userMessage: number;
  totalEstimated: number;
}

export interface ContextBreakdownInput {
  system?: string;
  history?: readonly { role: string; content: string }[];
  memories?: readonly string[];
  userMessage?: string;
}

/**
 * Fast estimation using heuristic: Math.ceil(text.length / 4).
 * Returns 0 for empty or nullish text.
 */
export function estimateTokens(text: string | null | undefined): number;

/**
 * Extracts and aggregates real token counts from LangChain AIMessages.
 */
export function extractTokenUsage(messages: readonly unknown[]): TokenUsage;

/**
 * Estimates token counts partitioned by prompt source.
 */
export function estimateContextBreakdown(input: ContextBreakdownInput): ContextBreakdown;
```

---

## 2. HTTP `/chat` Response Contract (`POST /chat`)

### Updated Response Body

```json
{
  "conversationId": "conv-1727958120-a1b2",
  "userId": "u-42",
  "answer": "Todos os serviços estão operando normalmente.",
  "trace": [ ... ],
  "metrics": {
    "llmCalls": 2,
    "latencyMs": 1420,
    "historyMessages": 4,
    "promptTokens": 542,
    "completionTokens": 98,
    "totalTokens": 640,
    "contextBreakdown": {
      "system": 120,
      "history": 260,
      "memories": 110,
      "userMessage": 25,
      "totalEstimated": 515
    }
  }
}
```

---

## 3. CLI Script Contract: `conversa-long.sh`

```bash
./conversa-long.sh [OPTIONAL_ENDPOINT_URL]
```

### Output Format
```text
=== Início do Diálogo Longo OpsPilot ===
Endpoint: http://localhost:3000/chat
Conversa ID: conv-xyz...

[Turno 1]
Prompt: "Qual o status geral dos serviços?"
-> Resposta: "O auth-service está com 5xx..."
-> Métricas: promptTokens=450 | historyMessages=0 | latência=1250ms
-> Breakdown: system=120, history=0, memories=0, userMessage=10

[Turno 2]
Prompt: "Quais alertas estão disparando?"
-> Resposta: "Temos 3 alertas firing..."
-> Métricas: promptTokens=590 | historyMessages=2 | latência=1340ms
-> Breakdown: system=120, history=140, memories=0, userMessage=9

=== Fim do Diálogo Longo ===
```
