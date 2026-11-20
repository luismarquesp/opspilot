# Feature Specification: Unified Production Graph (`production-graph.ts`)

**Feature Branch**: `014-unified-production-graph`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "Grafo unificado:
- production-graph.ts: nós contexto, roteador, as 3 estratégias como nós e resposta.
- Roteador: withStructuredOutput (route, reason); tabela no prompt; evento "route" e campo node em todo evento de trace.
- /chat: strategy opcional (se vier, é override no trace)"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Autonomous Operational Strategy Routing (Priority: P1) 🎯 MVP

As an on-call engineer interacting with OpsPilot during an ongoing incident or routine triage, I want the system to dynamically evaluate my request against an operational decision table and automatically select the most effective reasoning strategy (ReAct, Plan-and-Execute, or Reflection), so that I do not need to manually guess or specify which underlying agent strategy is best suited for the task.

**Why this priority**: Unifies disparate agent workflows into a single autonomous entrypoint, reducing cognitive load on operators and matching problem complexity to optimal execution patterns.

**Independent Test**:
Submit natural language requests with varied operational profiles (e.g., simple alert inspection vs. multi-step incident resolution vs. critical verification) without passing any `strategy` parameter. Verify that the router classifies the request and dispatches execution to the corresponding strategy node, recording a structured `"route"` event with the decision rationale.

**Acceptance Scenarios**:
1. **Given** an operational query requesting direct inspection (e.g., "quais alertas estão firing?"), **When** routed without a strategy override, **Then** the router selects the `react` strategy node with an explicit reason and records a `"route"` trace event.
2. **Given** a multi-step incident orchestration request (e.g., "investigue os alertas, abra um incidente crítico e avise os serviços dependentes"), **When** routed, **Then** the router selects the `plan-and-execute` strategy node.
3. **Given** a request demanding high-precision validation or critical root-cause verification, **When** routed, **Then** the router selects the `reflection` strategy node.
4. **Given** any autonomous routing execution, **When** the router node completes, **Then** a `"route"` trace event is appended containing the chosen `route`, `reason`, and `node: "router"`.

---

### User Story 2 - Operator Strategy Override via `/chat` (Priority: P1)

As an on-call engineer or automated runbook needing strict control over execution mode, I want to optionally specify a `strategy` in the `/chat` request payload, so that I can explicitly force a particular reasoning strategy while having that override transparently audited in the execution trace.

**Why this priority**: Empowers operators and diagnostic tests to bypass automated classification when a specific operational protocol is required.

**Independent Test**:
Send a `/chat` request with `"strategy": "plan-and-execute"` for a simple prompt. Verify that the graph routes directly to the `plan-and-execute` node without performing LLM-based classification, and that the `"route"` trace event explicitly tags the selection as an operator override.

**Acceptance Scenarios**:
1. **Given** a `/chat` request specifying `"strategy": "react"`, **When** executed by the unified production graph, **Then** execution is directed to the `react` node and the `"route"` trace event notes the manual override.
2. **Given** a `/chat` request omitting the `strategy` field, **When** executed, **Then** the system proceeds with autonomous LLM-based routing.
3. **Given** an invalid or unknown `strategy` value provided in the request, **When** validated at the boundary, **Then** the request is rejected with a 422 error or validation error as per API contract.

---

### User Story 3 - Comprehensive Node Attribution in Trace Events (Priority: P1)

As an SRE analyzing OpsPilot execution traces in observability dashboards or post-mortem incident logs, I want every trace event across all nodes to include an explicit `node` field identifying its origin node, so that I can trace the exact graph progression through context preparation, routing, strategy execution, and final response synthesis.

**Why this priority**: Essential for stateful graph observability, debugging agent behaviors, benchmarking individual nodes, and explaining agent actions during live incidents.

**Independent Test**:
Execute an end-to-end request through the unified graph. Inspect all returned `trace` items. Verify that every event contains a non-empty `node` string identifying the originating graph node (`"context"`, `"router"`, `"react"`, `"plan-and-execute"`, `"reflection"`, or `"response"`).

**Acceptance Scenarios**:
1. **Given** any event emitted during graph execution (thought, action, observation, plan, critique, route, answer, summarize), **When** inspected in the trace, **Then** it includes a mandatory `node` attribute specifying the emitting node.
2. **Given** events generated inside strategy nodes (e.g., ReAct actions or Plan-and-Execute plans), **When** merged into the graph state, **Then** their `node` property accurately reflects the executing strategy node.
3. **Given** trace formatting functions (`formatTrace`, `formatTraceEvent`), **When** rendering trace logs, **Then** the originating node identifier is clearly displayed or formatted alongside the event details.

---

### User Story 4 - Unified Production Graph Flow: Context -> Router -> Strategy -> Response (Priority: P2)

As a system architect maintaining OpsPilot, I want a single LangGraph state graph defined in `src/agents/production-graph.ts` linking the sequence of `context`, `router`, the three strategy nodes, and `response`, so that all conversational and incident flows execute through a coherent, maintainable, and inspectable state pipeline.

**Why this priority**: Eliminates disparate ad-hoc execution paths in the controller, consolidating context assembly, prompt budget enforcement, routing, execution, and response finalization into a single state machine.

**Independent Test**:
Instantiate and invoke the compiled production graph with test inputs. Verify that the workflow transitions strictly follow: START -> `context` -> `router` -> conditional branch to one of (`react` | `plan-and-execute` | `reflection`) -> `response` -> END.

**Acceptance Scenarios**:
1. **Given** a new request, **When** entering the graph, **Then** the `context` node executes first, utilizing `ContextBuilder` to construct prompt messages and enforce section budgets.
2. **Given** prepared context, **When** arriving at `router`, **Then** conditional routing directs the graph to exactly one of the three strategy nodes.
3. **Given** completion of any strategy node, **When** transitioning, **Then** control flows to the `response` node, which aggregates output, records final metrics, and transitions to END.

---

## Edge Cases

- **Router LLM Degradation / Timeout**: If the router's structured output model call fails or times out, the system must gracefully fall back to the standard `"react"` strategy, recording the failure reason in the `"route"` trace event.
- **Ambiguous or Mixed Operator Prompts**: Prompts that exhibit traits of both quick queries and complex planning are classified according to the decision matrix; the rationale must be documented in the `reason` field of the `"route"` event.
- **Empty or Whitespace Inputs**: Blocked at boundary validation (`ChatRequestSchema`) before reaching the graph.
- **Strategy Override Precedence**: If an operator provides a valid `strategy` in the HTTP payload, it takes absolute precedence over any internal heuristics, skipping router LLM invocation entirely to save latency and token budget.
- **Reflection Loop Termination**: If the `reflection` strategy node hits its maximum critique attempts or encounters a critique error, it yields the best available answer without halting or breaking the unified graph execution.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST implement a unified production graph in `src/agents/production-graph.ts` using LangGraph (`StateGraph`), containing nodes: `context`, `router`, `react`, `plan-and-execute`, `reflection`, and `response`.
- **FR-002**: The `context` node MUST assemble prompt messages, enforce section budgets, and format conversational history and recalled memories via `ContextBuilder`.
- **FR-003**: The `router` node MUST employ `model.withStructuredOutput` returning a structured decision schema containing `{ route: "react" | "plan-and-execute" | "reflection", reason: string }`.
- **FR-004**: The router prompt MUST incorporate an operational decision table defining clear criteria for each strategy:
  - `react`: direct status queries, quick alert listings, single-step operational lookups.
  - `plan-and-execute`: multi-step mitigations, incident triage workflows requiring sequential plans and tool calls.
  - `reflection`: critical diagnostics, verification against observations, high-risk or ambiguous remediation tasks.
- **FR-005**: The `router` node MUST append a trace event with `type: "route"`, containing the chosen route, rationale, and `node: "router"`.
- **FR-006**: Every event in the execution trace MUST include a `node` field identifying which graph node produced the event (e.g., `"context"`, `"router"`, `"react"`, `"plan-and-execute"`, `"reflection"`, `"response"`).
- **FR-007**: `TraceEventType` and `TraceEventSchema` in `src/agents/types.ts` MUST include `"route"` as a valid event type, and `BaseTraceEventSchema` MUST include `node: z.string().min(1)`.
- **FR-008**: In `/chat` (`src/http/chat.controller.ts`), the `strategy` parameter MUST be optional.
- **FR-009**: When `strategy` is supplied in the `/chat` request, the system MUST use it as a manual override, routing immediately to the specified strategy and recording the override in the `"route"` trace event.
- **FR-010**: When `strategy` is omitted, the production graph MUST autonomously execute the router node to decide the route.
- **FR-011**: In case of routing classification failure, the graph MUST fallback to `"react"` with an explanatory trace record.

---

### Key Entities

- **ProductionGraphState**:
  - `input`: The original user query.
  - `conversationId`: Unique identifier for the conversation session.
  - `userId`: Optional user identifier for memory recall.
  - `strategyOverride`: Optional strategy passed by the caller.
  - `context`: The assembled context object (messages, userPrompt, breakdown).
  - `selectedRoute`: The chosen strategy identifier (`"react"` | `"plan-and-execute"` | `"reflection"`).
  - `routeReason`: Rationale explaining why the strategy was chosen or overridden.
  - `strategyResult`: The raw output from the executed strategy node.
  - `answer`: The consolidated final text answer.
  - `trace`: The sequential list of trace events accumulated across all graph nodes.
  - `metrics`: Aggregated execution metrics (latency, LLM calls, token usage).
- **RouteDecision**:
  - `route`: Target strategy (`"react"` | `"plan-and-execute"` | `"reflection"`).
  - `reason`: Justification grounded in the operational decision table.
- **TraceEvent**:
  - `type`: `"thought"` | `"action"` | `"observation"` | `"plan"` | `"critique"` | `"answer"` | `"summarize"` | `"route"`.
  - `node`: Graph node label (e.g. `"context"`, `"router"`, `"react"`, `"plan-and-execute"`, `"reflection"`, `"response"`).
  - `content`: Textual payload or summary.
  - `timestamp`: Epoch millisecond timestamp.
  - Additional fields depending on event type (`tool`, `args`, `route`, `reason`).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of incoming `/chat` requests without a specified `strategy` are successfully categorized and handled by the automated router without runtime exceptions.
- **SC-002**: 100% of trace events emitted during graph execution include the originating `node` attribute.
- **SC-003**: Specifying a manual `strategy` in `/chat` results in 0 LLM calls spent on the routing decision, with the manual override properly annotated in the trace.
- **SC-004**: Automated unit and integration tests achieve 100% pass rate across routing accuracy, manual override behavior, and trace node attribution.
- **SC-005**: Quality gates remain green (`npm run typecheck` and `npm test` exit with 0 errors).

---

## Assumptions

- The three available strategies in the unified graph are `"react"`, `"plan-and-execute"`, and `"reflection"`.
- Router decision uses a lightweight structured call with low latency.
- Existing tools (`list_alerts`, `open_incident`, `resolve_incident`) remain available to the underlying strategy nodes.
- When an operator provides an override via `/chat`, validation accepts `"react"`, `"plan-and-execute"`, or `"reflection"`.
