# Feature Specification: Context Token Measurement & Metrics Breakdown

**Feature Branch**: `011-context-tokens-metrics`  
**Created**: 2026-10-03  
**Status**: Draft  
**Input**: User description: "Instumente a medição de contexto: src/context/tokens.ts com estimateTokens (char/4) e o usuage real do LangChain; métricas do /chat com promptTokens real e contextBreakdown estimado por fontes; conversa-long.sh imprime o promptTokens por turno. Com testes"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Token Estimation & Real LangChain Usage Extraction (Priority: P1) 🎯 MVP

As an on-call engineer or system developer, I want a dedicated module `src/context/tokens.ts` providing both fast token estimation (heuristic ~4 characters per token) and extraction of real token consumption from LangChain AI messages, so that the system can track context consumption accurately across all LLM operations.

**Why this priority**: Foundational core for all token observability. Required by both the reasoning strategies and the HTTP API metrics.

**Independent Test**:
Call `estimateTokens("12345678")` and assert it returns 2. Pass a mock LangChain message containing `usage_metadata: { input_tokens: 42, output_tokens: 15, total_tokens: 57 }` to `extractTokenUsage` and assert it returns `{ promptTokens: 42, completionTokens: 15, totalTokens: 57 }`.

**Acceptance Scenarios**:
1. **Given** any string, **When** `estimateTokens(text)` is invoked, **Then** return `Math.ceil(text.length / 4)` (or 0 for empty string).
2. **Given** a list of LangChain messages containing `usage_metadata` or `response_metadata.tokenUsage`, **When** `extractTokenUsage(messages)` is called, **Then** return aggregated real `promptTokens`, `completionTokens`, and `totalTokens`.
3. **Given** context components (`system`, `history`, `memories`, `userMessage`), **When** `estimateContextBreakdown(...)` is called, **Then** return estimated token counts partitioned by each source.

---

### User Story 2 - `/chat` API Metrics with Real Prompt Tokens & Context Breakdown (Priority: P1)

As an on-call engineer interacting with the OpsPilot HTTP API, I want the `/chat` response `metrics` object to report the real `promptTokens` consumed by the LLM along with the estimated `contextBreakdown` by source, so that I can monitor context window consumption, costs, and diagnose prompt bloat.

**Why this priority**: Delivers end-to-end operational visibility directly in the API payload returned to clients and monitoring dashboards.

**Independent Test**:
Send `POST /chat` with a user message, active `conversationId`, and `userId`. Verify the returned `metrics` contains `promptTokens` (positive integer) and `contextBreakdown` containing `history`, `memories`, `userMessage`, and `system`.

**Acceptance Scenarios**:
1. **Given** a valid `POST /chat` request, **When** the response is returned, **Then** `metrics` includes `promptTokens` representing the real token count reported by the model.
2. **Given** a `POST /chat` request with conversation history and semantic memories, **When** evaluated, **Then** `metrics.contextBreakdown` partitions estimated tokens into `{ system, history, memories, userMessage }`.
3. **Given** multiple LLM reasoning calls within a single strategy execution, **When** metrics are aggregated, **Then** `promptTokens` reflects the total prompt tokens across all calls in the execution trace.

---

### User Story 3 - Multi-Turn Long Conversation Inspection Script (`conversa-long.sh`) (Priority: P2)

As an on-call engineer, I want an executable script `conversa-long.sh` that runs a sequential multi-turn dialogue against the OpsPilot server and prints the `promptTokens` and history count per turn, so that I can visually verify how context scales and observe sliding window limits.

**Why this priority**: Provides a quick CLI verification tool for developers and operators to test real context scaling against a running server.

**Independent Test**:
Run `./conversa-long.sh` against a local OpsPilot server. Verify it performs at least 3 conversational turns and outputs `Turn 1: promptTokens=X`, `Turn 2: promptTokens=Y (Y > X)`, etc.

**Acceptance Scenarios**:
1. **Given** a running OpsPilot server, **When** `./conversa-long.sh` is executed, **Then** it sends sequential messages reusing the same `conversationId`.
2. **Given** each conversational turn, **When** the response arrives, **Then** the script outputs the turn index, message snippet, `promptTokens`, `historyMessages`, and assistant response.
3. **Given** server unavailability, **When** the script is executed, **Then** it prints a helpful error message and exits cleanly.

---

## Edge Cases

- **Empty or Whitespace-only Inputs**: `estimateTokens("")` returns 0.
- **Missing LangChain `usage_metadata`**: When running mock models or offline tests without usage metadata, the system falls back gracefully to `estimateTokens` or returns 0.
- **Empty History or Memories**: In turn 1 without semantic memory, `contextBreakdown.history` and `contextBreakdown.memories` are 0.
- **Multiple AI Calls**: If an agent makes multiple tool calls (e.g. ReAct loops), prompt tokens from all steps are accumulated or reported transparently.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create `src/context/tokens.ts` exporting `estimateTokens(text: string): number` calculated as `Math.ceil(text.length / 4)`.
- **FR-002**: `src/context/tokens.ts` MUST export `extractTokenUsage(messages: readonly unknown[])` returning `{ promptTokens: number; completionTokens: number; totalTokens: number }`.
- **FR-003**: `src/context/tokens.ts` MUST export `estimateContextBreakdown(components: { system?: string; history?: readonly { role: string; content: string }[]; memories?: readonly string[]; userMessage?: string })` returning `{ system: number; history: number; memories: number; userMessage: number; totalEstimated: number }`.
- **FR-004**: System MUST update `StrategyMetricsSchema` and `StrategyMetrics` in `src/agents/types.ts` to include `promptTokens`, `completionTokens`, `totalTokens`, and `contextBreakdown`.
- **FR-005**: Reasoning strategies (`react`, `plan-and-execute`) MUST extract real token usage from agent execution results and attach them to `StrategyResult.metrics`.
- **FR-006**: `POST /chat` controller MUST compute `contextBreakdown` from the assembled prompt sources (system prompt, conversation history, recalled memories, user message) and return it in `metrics`.
- **FR-007**: System MUST provide an executable script `conversa-long.sh` in the project root that runs a multi-turn conversation and prints the `promptTokens` per turn.
- **FR-008**: System MUST include comprehensive tests in `src/context/tokens.test.ts` and integration assertions in `src/http/chat.test.ts`.

---

## Key Entities

- **TokenUsage**:
  - `promptTokens`: Number of input tokens processed by the LLM.
  - `completionTokens`: Number of output tokens generated by the LLM.
  - `totalTokens`: Sum of prompt and completion tokens.
- **ContextBreakdown**:
  - `system`: Estimated tokens from system prompts and tool descriptions.
  - `history`: Estimated tokens from previous conversation turns.
  - `memories`: Estimated tokens from semantically recalled user facts.
  - `userMessage`: Estimated tokens from the user's latest query.
  - `totalEstimated`: Sum of estimated tokens across all sources.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `estimateTokens` is accurate to within standard 4-char heuristic for arbitrary English and Portuguese operational texts.
- **SC-002**: 100% of `/chat` responses with real LLM invocations return non-zero `metrics.promptTokens` and populated `metrics.contextBreakdown`.
- **SC-003**: In multi-turn chat, `contextBreakdown.history` strictly increases as conversation turns are added, reflecting context accumulation.
- **SC-004**: `conversa-long.sh` executes successfully end-to-end and outputs formatted turn-by-turn prompt token metrics.
- **SC-005**: All existing and new test suites pass with 100% success (`npm test` and `npm run typecheck`).
