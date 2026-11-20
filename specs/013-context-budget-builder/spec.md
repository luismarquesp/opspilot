# Feature Specification: Section-Budget Context Builder (`ContextBuilder`)

**Feature Branch**: `013-context-budget-builder`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "ContextBuilder com orçamento por seção. src/context/context-builder.ts monta o prompt de TODAS as estratégias com teto por seção via env CONTEXT_BUDGET_*; system e mensagem intocáveis, resumo 200, janela 1200 (corta as mais antigas), memória 300 (corta menor score). Teste: tetos baixos cortam na ordem certa"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unified Prompt Composition with Section Ceilings (Priority: P1) 🎯 MVP

As an on-call engineer interacting with OpsPilot across diverse operational situations, I want every reasoning strategy (ReAct, Reflection, and Plan-and-Execute) to assemble its LLM prompt through a centralized context builder with strict token ceilings per section, so that prompt payloads remain within model limits and avoid uncontrolled token growth.

**Why this priority**: Eliminates fragmented prompt formatting across agents, prevents context window overflows, and ensures predictable token consumption.

**Independent Test**:
Provide system instructions, a rolling summary, conversation history, recalled memories, and a user message to the context builder. Verify that all sections are properly synthesized into the prompt structure according to each section's defined budget, and that system instructions and the current user message are never truncated or omitted.

**Acceptance Scenarios**:
1. **Given** a prompt assembly request with all sections present, **When** processed by the context builder, **Then** system instructions and the current user query are preserved in full without alteration.
2. **Given** any reasoning strategy (ReAct, Reflection, Plan-and-Execute), **When** preparing context for model execution, **Then** the strategy invokes the unified context builder to construct its prompt messages or structured input.
3. **Given** all prompt sections within their respective token budgets, **When** assembled, **Then** all items from all sections are retained in the compiled context.

---

### User Story 2 - Chronological History Eviction (Oldest First) (Priority: P1)

As an on-call engineer troubleshooting an active incident over multiple turns, I want older messages to be pruned first when the conversational history exceeds the window budget (default 1200 tokens), so that the assistant preserves the freshest context and recent diagnostic steps.

**Why this priority**: Recent context is critical for real-time incident resolution; older details are already condensed into the rolling summary.

**Independent Test**:
Supply a conversation history whose accumulated estimated tokens exceed 1200 (or a configured lower test budget like 100 tokens). Verify that messages are removed starting from the oldest, keeping only the most recent messages that fit within the budget.

**Acceptance Scenarios**:
1. **Given** a conversational history exceeding the window token ceiling, **When** pruned by the context builder, **Then** messages are discarded in chronological order (oldest first) until total estimated history tokens are within the ceiling.
2. **Given** a constrained window budget where only 2 of 5 messages fit, **When** evaluated, **Then** the latest 2 messages are retained and the earliest 3 are evicted.
3. **Given** an individual recent message whose size alone exceeds the window ceiling, **When** evaluated, **Then** the system retains at least the single most recent message to maintain conversational continuity.

---

### User Story 3 - Relevance-Based Memory Eviction (Lowest Score First) (Priority: P1)

As an engineer querying OpsPilot, I want recalled semantic memories exceeding the memory budget (default 300 tokens) to drop lower-scoring facts first, so that only the most pertinent institutional knowledge and runbook facts are provided to the agent.

**Why this priority**: Higher-relevance memories have direct bearing on the current problem; lower-relevance noise must not displace critical context.

**Independent Test**:
Supply multiple recalled memories with varying relevance scores where total tokens exceed 300 (or a lower test budget). Verify that memories are pruned in ascending score order (lowest score first) until remaining items fit within the budget.

**Acceptance Scenarios**:
1. **Given** a set of recalled memories whose tokens exceed the memory ceiling, **When** evaluated, **Then** memories with the lowest relevance scores are evicted first.
2. **Given** two memories with identical relevance scores where only one fits, **When** evaluated, **Then** deterministic pruning occurs (e.g. keeping the more recently recorded or higher priority).
3. **Given** a low memory budget (e.g. 50 tokens), **When** tested, **Then** higher-score items are retained over lower-score items that would otherwise fit.

---

### User Story 4 - Summary Budget Enforcement (Priority: P2)

As an operator relying on rolling conversation summaries, I want the summary section to be constrained to its allocated budget (default 200 tokens), so that excessively verbose summaries do not degrade available window or memory space.

**Why this priority**: Ensures the rolling summary maintains its role as a compact representation without unbounded text expansion.

**Independent Test**:
Supply a long summary exceeding 200 tokens (or a lower test threshold). Verify that the context builder truncates or bounds the summary text to stay within the allocated token budget.

**Acceptance Scenarios**:
1. **Given** a summary within the token ceiling (<= 200 tokens), **When** assembled, **Then** the full summary is included.
2. **Given** a summary exceeding the ceiling, **When** assembled, **Then** the summary content is bounded to not exceed the token limit.

---

### User Story 5 - Configurable Ceilings via Environment Variables (Priority: P2)

As a DevOps engineer deploying OpsPilot in diverse environments, I want section token budgets to be configurable via environment variables (`CONTEXT_BUDGET_*`), so that context capacity can be adjusted for different models and cost tiers without changing code.

**Why this priority**: Allows operational flexibility and straightforward tuning in production and automated test pipelines.

**Independent Test**:
Set `CONTEXT_BUDGET_SUMMARY=50`, `CONTEXT_BUDGET_WINDOW=300`, and `CONTEXT_BUDGET_MEMORY=100`. Verify that the context builder applies these exact ceilings instead of default values. When variables are unset, verify defaults (200, 1200, 300) are used.

**Acceptance Scenarios**:
1. **Given** environment variables `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_WINDOW`, and `CONTEXT_BUDGET_MEMORY` defined with valid positive integers, **When** initialized, **Then** the context builder enforces those custom ceilings.
2. **Given** missing or invalid environment variables, **When** initialized, **Then** the context builder defaults to 200 (summary), 1200 (window), and 300 (memory).
3. **Given** a budget variable set to 0, **When** initialized, **Then** that section is effectively suppressed from context injection.

---

## Edge Cases

- **Zero Budget**: If an environment variable sets a budget to 0 (e.g., `CONTEXT_BUDGET_MEMORY=0`), the corresponding section is completely omitted from the constructed context.
- **Single Oversized Item**: If a single memory or history message alone exceeds the respective section budget, the builder retains the highest-priority item (e.g., the newest message or highest-scored memory) with safe character bounding to avoid completely empty context while preventing unbounded overflow.
- **Untouchable Core**: Regardless of how small budgets are configured, the system prompt and the active user input message remain untouched and are never truncated or discarded.
- **Empty Sections**: When optional sections (summary, history, memories) are empty, the builder formats the prompt cleanly without orphan section headers or formatting artifacts.
- **Tie-Breaking for Memories**: When two memories share the identical relevance score, deterministic ordering (by insertion date or memory ID) is preserved to ensure test repeatability.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a centralized context builder module (`src/context/context-builder.ts`) for composing model prompts across all reasoning strategies.
- **FR-002**: System MUST enforce independent token budgets per section:
  - System instructions: Untouchable (never dropped or truncated).
  - Current user message: Untouchable (never dropped or truncated).
  - Summary: Default 200 tokens, configurable via `CONTEXT_BUDGET_SUMMARY`.
  - Recent history window: Default 1200 tokens, configurable via `CONTEXT_BUDGET_WINDOW`.
  - Recalled semantic memories: Default 300 tokens, configurable via `CONTEXT_BUDGET_MEMORY`.
- **FR-003**: System MUST prune history messages exceeding the window budget in chronological order (oldest messages removed first), retaining the most recent interactions.
- **FR-004**: System MUST prune recalled memories exceeding the memory budget in score order (lowest relevance score removed first), retaining the highest-scoring facts.
- **FR-005**: System MUST bound or truncate the summary section if it exceeds the summary budget.
- **FR-006**: System MUST parse and validate `CONTEXT_BUDGET_*` environment variables with resilient fallback to the specified defaults (200 summary, 1200 window, 300 memory).
- **FR-007**: All reasoning strategies (`react`, `reflection`, `plan-and-execute`) MUST utilize the centralized context builder for prompt construction.
- **FR-008**: System MUST include automated tests verifying that low budget limits trigger pruning in the exact specified priority orders while leaving untouchable sections fully intact.

---

### Key Entities

- **SectionBudgets**:
  - `summary`: Maximum tokens allocated for the rolling conversation summary (default: 200).
  - `window`: Maximum tokens allocated for raw message history (default: 1200).
  - `memory`: Maximum tokens allocated for recalled semantic memories (default: 300).
- **RecalledMemoryItem**:
  - `fact`: Textual fact or operational note.
  - `score`: Relevance similarity score between 0.0 and 1.0.
- **HistoryMessageItem**:
  - `role`: Role identifier ("user" or "assistant").
  - `content`: Message text.
  - `timestamp`: Message creation timestamp or index for chronological ordering.
- **ContextBuildResult**:
  - `messages`: Formatted message list or prompt input for model execution.
  - `retainedCounts`: Number of retained history messages and memories.
  - `estimatedTokens`: Token breakdown per section and total token estimation.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of agent reasoning strategies in OpsPilot assemble their prompts via `ContextBuilder`.
- **SC-002**: History and memory sections never exceed their configured or default token ceilings in assembled prompts.
- **SC-003**: 100% of user input messages and system prompts remain intact and unpruned across all execution scenarios.
- **SC-004**: Automated unit and integration tests pass with 100% success rate, specifically demonstrating that constrained budgets evict oldest messages and lowest-scoring memories first.
- **SC-005**: All quality gates (`npm run typecheck` and `npm test`) remain completely green.

---

## Assumptions

- Token estimation uses the established heuristic of ~4 characters per token (`estimateTokens` in `src/context/tokens.ts`).
- Semantic memories supplied to the context builder contain their similarity score from the memory store recall step.
- When `CONTEXT_BUDGET_*` variables are undefined, default values (200 for summary, 1200 for window, 300 for memory) take effect automatically.
