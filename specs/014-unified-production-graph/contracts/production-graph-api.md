# Contract: Unified Production Graph API & Types

**Feature**: Unified Production Graph  
**Branch**: `014-unified-production-graph`  
**Date**: 2026-10-19  

## 1. HTTP Endpoint Contract: `POST /chat`

### Request Body Schema
```json
{
  "message": "string (required, min length 1)",
  "strategy": "string (optional: 'react' | 'plan-and-execute' | 'reflection')",
  "reflect": "boolean (optional, legacy fallback)",
  "conversationId": "string (optional)",
  "userId": "string (optional)"
}
```

### Behavior Matrix
| `strategy` in Request | Action | `"route"` Event in Trace |
|---|---|---|
| `undefined` / omitted | Autonomous routing via router LLM structured output | Emits `{ type: "route", node: "router", route: "<chosen>", reason: "<classification rationale>" }` |
| `"react"` | Override: routes to `react` node immediately | Emits `{ type: "route", node: "router", route: "react", reason: "Manual override via request parameter" }` |
| `"plan-and-execute"` | Override: routes to `plan-and-execute` node immediately | Emits `{ type: "route", node: "router", route: "plan-and-execute", reason: "Manual override via request parameter" }` |
| `"reflection"` | Override: routes to `reflection` node immediately | Emits `{ type: "route", node: "router", route: "reflection", reason: "Manual override via request parameter" }` |
| Invalid string | HTTP 422 Unprocessable Entity or HTTP 400 Bad Request | None (blocked at controller validation) |

### Success Response (`200 OK`)
```json
{
  "conversationId": "conv-1234",
  "userId": "user-ops",
  "answer": "Identifiquei 1 alerta firing e abri o incidente inc-101.",
  "trace": [
    {
      "type": "route",
      "node": "router",
      "route": "react",
      "reason": "Consulta direta de alertas e mitigação rápida.",
      "content": "Rota selecionada: [REACT] - Consulta direta de alertas e mitigação rápida.",
      "timestamp": 1729328400000
    },
    {
      "type": "thought",
      "node": "react",
      "content": "Consultando alertas firing...",
      "timestamp": 1729328401000
    },
    {
      "type": "action",
      "node": "react",
      "tool": "list_alerts",
      "args": { "status": "firing" },
      "content": "Call list_alerts",
      "timestamp": 1729328402000
    },
    {
      "type": "observation",
      "node": "react",
      "content": "[{\"id\":\"alt-101\",\"service\":\"payment-api\"}]",
      "timestamp": 1729328403000
    },
    {
      "type": "answer",
      "node": "response",
      "content": "Identifiquei 1 alerta firing e abri o incidente inc-101.",
      "timestamp": 1729328404000
    }
  ],
  "metrics": {
    "llmCalls": 2,
    "latencyMs": 850,
    "historyMessages": 3,
    "promptTokens": 450,
    "completionTokens": 95,
    "totalTokens": 545,
    "contextBreakdown": {
      "system": 120,
      "history": 150,
      "summary": 0,
      "memories": 80,
      "userMessage": 25,
      "totalEstimated": 375
    }
  }
}
```

---

## 2. Programmatic Interface Contract: `src/agents/production-graph.ts`

```typescript
export interface ProductionGraphInput {
  input: string;
  conversationId: string;
  userId?: string;
  strategyOverride?: "react" | "plan-and-execute" | "reflection";
  history?: HistoryMessage[];
  summary?: string;
  recalledMemories?: MemoryItem[];
  budgets?: Partial<ContextBudgets>;
}

export interface ProductionGraphOutput {
  answer: string;
  trace: TraceEvent[];
  metrics: StrategyMetrics;
  selectedRoute: "react" | "plan-and-execute" | "reflection";
  routeReason: string;
}

export function createProductionGraph(customModel?: unknown): CompiledStateGraph;
export function runProductionGraph(
  input: ProductionGraphInput,
  options?: { graph?: CompiledStateGraph; customModel?: unknown }
): Promise<ProductionGraphOutput>;
```
