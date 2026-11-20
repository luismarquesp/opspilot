# Research & Technical Decisions: Section-Budget Context Builder

**Feature**: Section-Budget Context Builder (`ContextBuilder`)  
**Branch**: `013-context-budget-builder`  
**Date**: 2026-10-06  

---

## 1. Context Token Ceilings & Environment Variable Configuration

### Decision
Provide a dedicated configuration loader with a Zod schema that parses:
- `CONTEXT_BUDGET_SUMMARY`: positive integer, default `200`
- `CONTEXT_BUDGET_WINDOW`: positive integer, default `1200`
- `CONTEXT_BUDGET_MEMORY`: positive integer, default `300`

### Rationale
- Environment variables provide 12-factor configuration flexibility across testing, staging, and production without altering code.
- Zod schema ensures strict validation at startup or module invocation, falling back gracefully to standard defaults if values are missing, invalid, or negative.
- Setting any budget to `0` acts as an explicit disable switch for that section.

### Alternatives Considered
- *Hardcoding token constants in source code*: Rejected because it prevents dynamic tuning across different LLM context window tiers (e.g. 8k vs 32k vs 128k models) and complicates unit testing with low ceilings.
- *Single global token ceiling*: Rejected because it does not guarantee section balance (e.g. memories could starve dialogue history or vice-versa).

---

## 2. History Window Eviction Strategy (Oldest First)

### Decision
When the combined token estimate of messages in the conversational history window exceeds `CONTEXT_BUDGET_WINDOW`, messages are pruned in chronological order, discarding the oldest messages first.

### Rationale
- In operational and incident triage dialogues, the most recent messages contain active state, tool execution outputs, and current user instructions.
- Older messages have already been periodically condensed into the rolling summary (`conversation_summaries`), ensuring no long-term operational loss.
- Algorithm: Iterate from newest to oldest message, accumulating tokens. Once adding the next older message would breach the budget, discard that message and all preceding older messages.

### Alternatives Considered
- *FIFO sliding window by message count alone (e.g. exactly 8 messages)*: Insufficient on its own because individual messages (e.g. large tool dumps or logs) can wildly vary from 10 tokens to 2,000 tokens, easily overflowing model token limits.
- *LLM-based selective pruning*: Too slow, costly, and nondeterministic for real-time prompt assembly per turn.

---

## 3. Semantic Memory Eviction Strategy (Lowest Score First)

### Decision
Recalled memories provided to `ContextBuilder` are sorted descending by their similarity/relevance score. Memories are added in descending score order until the cumulative token count reaches `CONTEXT_BUDGET_MEMORY`. Any memory exceeding the budget is evicted (lowest score first).

### Rationale
- Semantic memory recall produces relevance scores (`0.0` to `1.0`) indicating similarity to the current turn.
- Pruning memories with lower scores guarantees that the highest-fidelity domain facts and runbook hints are preserved when token space is tight.
- Ties in score are broken deterministically using the original order of recall or memory ID.

### Alternatives Considered
- *Chronological memory pruning (oldest created memory first)*: Rejected because older memories might be much more relevant to the current alert than recent unrelated facts.
- *Truncating individual facts partially*: Distorts or truncates domain knowledge, risking incorrect operational conclusions.

---

## 4. Summary Section Bounding

### Decision
If a conversation summary's estimated token count exceeds `CONTEXT_BUDGET_SUMMARY`, it is bounded to `budget * 4` characters with a clear truncation indicator or word-boundary slice.

### Rationale
- Summaries are designed to stay ~150 tokens. Under pathological growth or misconfigured summarizers, bounding ensures the summary section cannot starve other prompt sections.
- Bounding is deterministic and pure.

---

## 5. Unified Prompt Assembly Across All Strategies

### Decision
`ContextBuilder` will expose a pure function `buildContext(input: BuildContextInput): BuiltContext` returning:
1. `messages`: Standard array of `{ role: string; content: string }` ready for LangChain / LangGraph (`SystemMessage`, `HumanMessage`, `AIMessage`).
2. `userPrompt`: Enriched user prompt string combining recalled memories and user message (for strategies like Plan-and-Execute that expect a single input string).
3. `breakdown`: Accurate token counts and counts of retained items.

Every strategy (`react`, `reflection`, `plan-and-execute`) will consume this builder instead of ad-hoc prompt formatting.

### Rationale
- Centralizes prompt composition in a single tested location adhering to MVC architecture.
- Eliminates code duplication across `react.ts`, `reflection.ts`, and `plan-and-execute.ts`.
- Guarantees uniform adherence to section budgets and untouchable guarantees.
