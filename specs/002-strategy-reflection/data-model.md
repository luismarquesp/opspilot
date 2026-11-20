# Phase 1 Data Model: Strategy Reflection Layer

**Feature**: Strategy Reflection Layer (`002-strategy-reflection`)  
**Date**: 2026-09-13  
**Status**: Draft  

## 1. Entities & Configuration Types

### ReflectionOptions
Configuration options passed to `withReflection(strategy, options)`.

```typescript
export interface ReflectionOptions {
  /** Maximum number of reflection regeneration attempts on rejection (default: 2) */
  maxReflection?: number;
  /** Custom model or override for the critique evaluator (defaults to centralized createModel()) */
  criticModel?: BaseChatModel;
  /** Optional custom prompt override for the critic */
  criticPrompt?: string;
}
```

### CritiqueVerdict
Structured result emitted by the critic evaluator.

```typescript
export const CritiqueVerdictSchema = z.object({
  approved: z
    .boolean()
    .describe("Whether the answer is grounded, complete, and supported by trace observations"),
  feedback: z
    .string()
    .describe("Detailed critique justification or specific guidance for correction if rejected"),
});

export type CritiqueVerdict = z.infer<typeof CritiqueVerdictSchema>;
```

### ReflectionCycleState
Internal state tracked during the reflection-and-regeneration lifecycle.

```typescript
export interface ReflectionCycleState {
  currentAttempt: number;
  maxReflection: number;
  currentAnswer: string;
  accumulatedTrace: TraceEvent[];
  accumulatedLlmCalls: number;
  lastFeedback?: string;
  isApproved: boolean;
}
```

---

## 2. Trace Event & Metric Extensions

### CritiqueTraceEvent
Uses the established `TraceEvent` schema where `type: 'critique'`:

```typescript
export interface CritiqueTraceEvent {
  type: 'critique';
  content: string; // e.g. "[Reflection 1/2] APPROVED: Answer properly reflects the 3 firing alerts."
  timestamp: number;
}
```

### Accumulated StrategyMetrics
Represents the combined performance metrics of the decorated strategy:

```typescript
export interface StrategyMetrics {
  llmCalls: number;  // Base run calls + critic evaluations + regeneration calls
  latencyMs: number; // Total wall-clock elapsed duration across all cycles
}
```
