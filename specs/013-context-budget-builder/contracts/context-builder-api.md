# Contract: ContextBuilder API & Strategy Integration

**Feature**: Section-Budget Context Builder (`ContextBuilder`)  
**Branch**: `013-context-budget-builder`  
**Date**: 2026-10-06  

---

## 1. Environment Variables Contract

| Variable Name | Type | Default | Description |
|---|---|---|---|
| `CONTEXT_BUDGET_SUMMARY` | Integer (>= 0) | `200` | Token ceiling for rolling conversation summary. Set to `0` to omit summary. |
| `CONTEXT_BUDGET_WINDOW` | Integer (>= 0) | `1200` | Token ceiling for recent raw message history. Oldest messages pruned first. |
| `CONTEXT_BUDGET_MEMORY` | Integer (>= 0) | `300` | Token ceiling for recalled semantic memories. Lowest-scoring memories pruned first. |

---

## 2. Programmatic Interface Contract (`src/context/context-builder.ts`)

### `loadContextBudgets(overrides?: Partial<ContextBudgets>): ContextBudgets`
Reads and validates environment variables using Zod coercion, applies any explicit overrides, and returns validated numeric budgets.

```typescript
export function loadContextBudgets(overrides?: Partial<ContextBudgets>): ContextBudgets;
```

### `buildContext(input: BuildContextInput): BuiltContext`
Pure function that takes input sections and builds the bounded prompt messages, enriched user query, and token breakdown.

```typescript
export function buildContext(input: BuildContextInput): BuiltContext;
```

### Pure Helper Functions
- `pruneHistoryWindow(history: readonly HistoryMessage[], budget: number): { retained: HistoryMessage[]; evicted: HistoryMessage[] }`
- `pruneMemoriesByScore(memories: readonly MemoryItem[], budget: number): { retained: MemoryItem[]; evicted: MemoryItem[] }`
- `boundSummary(summary: string, budget: number): string`

---

## 3. Reasoning Strategies Contract

All strategies in `src/agents/` MUST delegate prompt construction to `buildContext`:

### ReAct (`src/agents/react.ts`)
```typescript
const context = buildContext({
  systemPrompt: options?.systemPrompt,
  userMessage: input,
  summary: options?.summary,
  history: options?.history,
  memories: options?.recalledMemories,
});

const result = await agent.invoke(
  { messages: context.messages },
  { recursionLimit }
);
```

### Reflection (`src/agents/reflection.ts`)
Consumes `buildContext` when preparing critic evaluations and retry invocations.

### Plan-and-Execute (`src/agents/plan-and-execute.ts`)
Uses `context.userPrompt` and `context.messages` to seed planner graph input with pruned memories and history.
