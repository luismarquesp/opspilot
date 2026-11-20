# Data Model: Section-Budget Context Builder

**Feature**: Section-Budget Context Builder (`ContextBuilder`)  
**Branch**: `013-context-budget-builder`  
**Date**: 2026-10-06  

---

## 1. Domain Types & Schemas

### ContextBudgets
Defines the upper token limits for each configurable prompt section.

```typescript
export interface ContextBudgets {
  /** Maximum estimated tokens for conversation summary. Default: 200 */
  summary: number;
  /** Maximum estimated tokens for recent history window. Default: 1200 */
  window: number;
  /** Maximum estimated tokens for recalled semantic memories. Default: 300 */
  memory: number;
}
```

**Zod Validation Schema**:
```typescript
export const ContextBudgetsSchema = z.object({
  summary: z.coerce.number().int().nonnegative().default(200),
  window: z.coerce.number().int().nonnegative().default(1200),
  memory: z.coerce.number().int().nonnegative().default(300),
});
```

---

### MemoryItem
Represents an individual recalled semantic memory with its relevance similarity score.

```typescript
export interface MemoryItem {
  fact: string;
  score: number; // 0.0 to 1.0 (default 1.0 if not provided)
}
```

---

### HistoryMessage
Represents a turn in the dialogue history.

```typescript
export interface HistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}
```

---

### BuildContextInput
Input parameters provided to `ContextBuilder`.

```typescript
export interface BuildContextInput {
  /** System instructions (Untouchable: never truncated or dropped) */
  systemPrompt?: string;
  /** Current user input query (Untouchable: never truncated or dropped) */
  userMessage: string;
  /** Rolling conversation summary */
  summary?: string;
  /** Recent dialogue history messages */
  history?: readonly HistoryMessage[];
  /** Recalled semantic memories with scores */
  memories?: readonly (string | MemoryItem)[];
  /** Custom budget overrides (falls back to process.env or defaults) */
  budgets?: Partial<ContextBudgets>;
}
```

---

### BuiltContext
The compiled output from `ContextBuilder`, ready for immediate ingestion by all reasoning strategies.

```typescript
export interface BuiltContext {
  /** Ordered message list for chat models (System, Summary, History, User with memories) */
  messages: Array<{ role: string; content: string }>;
  /** Formatted user prompt string with recalled memories embedded (for string-based agent inputs) */
  userPrompt: string;
  /** Token breakdown across all sections */
  breakdown: {
    system: number;
    history: number;
    summary: number;
    memories: number;
    userMessage: number;
    totalEstimated: number;
  };
  /** Metrics regarding retained vs evicted items */
  stats: {
    retainedHistoryCount: number;
    evictedHistoryCount: number;
    retainedMemoriesCount: number;
    evictedMemoriesCount: number;
  };
}
```

---

## 2. Invariants & Business Rules

1. **Untouchable Core**:
   - `systemPrompt` (if provided) is always emitted in full with `role: "system"`.
   - `userMessage` is always emitted in full with `role: "user"`.
   - Neither the system prompt nor the user message is ever truncated, dropped, or modified by budget enforcement.

2. **History Window Pruning**:
   - Preserves message ordering.
   - Evaluated from newest to oldest: accumulates tokens until reaching `budgets.window`.
   - Oldest messages exceeding the budget are dropped first.

3. **Memory Pruning**:
   - Memories are evaluated in descending score order (`score` high -> low).
   - Once adding the next memory exceeds `budgets.memory`, that memory and all lower-scoring memories are evicted.
   - Formatted in the prompt cleanly under `[Memória Relevante do Usuário]`.

4. **Summary Bounding**:
   - If summary tokens exceed `budgets.summary`, the text is capped to `budgets.summary * 4` characters with a clean cut.
