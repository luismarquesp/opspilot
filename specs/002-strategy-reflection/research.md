# Research: Strategy Reflection Layer

**Feature**: Strategy Reflection Layer (`002-strategy-reflection`)  
**Date**: 2026-09-13  
**Status**: Complete  

## 1. Research Questions & Architectural Decisions

### Decision 1: Decorator Pattern vs. Graph Inheritance
- **Question**: Should the reflection mechanism be embedded inside each specific reasoning graph (ReAct and Plan-and-Execute) or implemented as an external higher-order strategy decorator?
- **Decision**: Implement an external decorator function `withReflection(strategy: ReasoningStrategy, options?: ReflectionOptions): ReasoningStrategy`.
- **Rationale**:
  - Follows the Open/Closed Principle: wraps any existing or future `ReasoningStrategy` without modifying their internal graph definitions.
  - Ensures clean MVC separation, keeping reflection logic decoupled from execution engines.
  - Generates namespaced strategy identifiers (e.g., `reflect:react`, `reflect:plan-and-execute`) conforming to the existing Arena CLI.
- **Alternatives Considered**:
  - *Hardcoding reflection nodes inside LangGraph*: Rejected because it requires duplicating critique loops across every strategy and prevents decorating third-party or mock strategies.
  - *Class inheritance*: Rejected because OpsPilot strategies use functional interfaces and object contracts.

### Decision 2: Critic Evaluation Prompt & Structured Output
- **Question**: How should the critique evaluation be formatted and validated against LangChain/OpenRouter?
- **Decision**: Use `createModel().withStructuredOutput(CritiqueVerdictSchema)` with a dedicated system prompt.
- **Critique Schema**:
  ```typescript
  export const CritiqueVerdictSchema = z.object({
    approved: z.boolean().describe("true if the answer is completely grounded in trace observations; false if it contains errors, ungrounded claims, or misses critical findings"),
    feedback: z.string().describe("Specific explanation of the verdict and concrete guidance for correction if not approved"),
  });
  ```
- **Rationale**:
  - OpenRouter models with temperature 0 and structured JSON schema output provide reliable deterministic evaluations.
  - Explicit boolean `approved` eliminates ambiguity in downstream loop control.
- **Alternatives Considered**:
  - *Free-text parsing with regex*: Rejected as brittle and prone to hallucinated formatting errors.

### Decision 3: Context Augmentation on Regeneration
- **Question**: How should critique feedback be provided to the underlying strategy on rejected iterations?
- **Decision**: Augment the strategy input string with structured critique context:
  ```text
  [User Request]
  
  [Reviewer Critique (Attempt N)]:
  The previous answer was rejected because: <feedback>.
  Please re-evaluate the findings and correct these deficiencies.
  ```
- **Rationale**:
  - Keeps the `ReasoningStrategy.run(input, options)` contract unchanged.
  - Enables any reasoning strategy to inspect the prior critique directly within its prompt context without requiring custom memory managers.
- **Alternatives Considered**:
  - *Passing custom options in `StrategyOptions`*: Requires every strategy implementation to explicitly check and bind critique options. Augmenting the input works universally.

### Decision 4: Trace and Metric Telemetry Aggregation
- **Question**: How should critique events and resource consumption be surfaced?
- **Decision**:
  - Append a typed `critique` event to the trace after each evaluation:
    ```typescript
    {
      type: "critique",
      content: `[Reflection Attempt ${attempt}/${maxReflection}] ${verdict.approved ? "APPROVED" : "REJECTED"}: ${verdict.feedback}`,
      timestamp: Date.now()
    }
    ```
  - Accumulate metrics:
    `llmCalls = baseResult.metrics.llmCalls + critiqueCalls + regenerationCalls`
    `latencyMs = Date.now() - totalStartTime`
- **Rationale**:
  - Directly matches the `TraceEvent` schema and Arena output conventions.
  - Preserves full auditable history of the agent's thought, tool calls, critique, and revisions.

### Decision 5: Arena CLI Strategy Identification
- **Question**: How should reflected strategies be identified in the CLI?
- **Decision**: Use `reflect:react` and `reflect:plan-and-execute` as keys in `DEFAULT_STRATEGIES` and update `ArenaArgsSchema` to validate the `reflect:` prefix.
- **Rationale**:
  - Intuitive user syntax (`npm run arena -- --strategies reflect:react,reflect:plan-and-execute`).
  - Allows benchmarking baseline vs. reflected variants side-by-side.
