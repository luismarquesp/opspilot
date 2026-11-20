# Contract: withReflection Strategy Decorator

The `withReflection` decorator enhances any `ReasoningStrategy` with automated self-critique, observation grounding, and bounded regeneration.

## TypeScript Interface

```typescript
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ReasoningStrategy, StrategyOptions, StrategyResult } from "./types.js";

export interface ReflectionOptions {
  /**
   * Maximum regeneration attempts when critique rejects the answer.
   * Default: 2
   */
  maxReflection?: number;

  /**
   * Optional custom ChatModel for the critic evaluator.
   * Default: createModel()
   */
  criticModel?: BaseChatModel;

  /**
   * Optional custom critic prompt instructions.
   */
  criticPrompt?: string;
}

/**
 * Decorates any ReasoningStrategy with an observation-grounded reflection loop.
 *
 * @param strategy The underlying base strategy (e.g. reactStrategy, planAndExecuteStrategy)
 * @param options Configuration options including maxReflection (default: 2)
 * @returns A new ReasoningStrategy with name `reflect:${strategy.name}`
 */
export function withReflection(
  strategy: ReasoningStrategy,
  options?: ReflectionOptions
): ReasoningStrategy;
```

## Execution Flow Specification

1. **Initial Run**: The underlying `strategy.run(input, options)` executes, producing an initial `answer`, `trace`, and `metrics`.
2. **Observation Gathering**: The reflection layer extracts all `observation` events from `trace`.
3. **Critic Review**:
   - The critic model evaluates the `answer` against the extracted observations.
   - A structured `CritiqueVerdict` (`approved: boolean`, `feedback: string`) is returned.
   - An ordered `critique` event is appended to the trace:
     `[CRITIQUE] (Tentativa 1/2) APPROVED: ...` ou `[CRITIQUE] (Tentativa 1/2) REPROVADO: ...`
   - +1 call is added to cumulative `llmCalls`.
4. **Branching**:
   - If `approved === true`: Execution completes; return the verified `answer`, accumulated `trace`, and cumulative `metrics`.
   - If `approved === false` and `attempt < maxReflection`:
     - Augment user input with the critique feedback.
     - Re-run `strategy.run(augmentedInput, options)`.
     - Append newly produced trace events and accumulate metrics.
     - Repeat step 3.
   - If `attempt >= maxReflection`:
     - Stop regeneration. Return the latest answer, full trace history, and accumulated metrics.
