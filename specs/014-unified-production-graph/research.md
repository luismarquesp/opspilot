# Research: Unified Production Graph (`production-graph.ts`)

**Feature**: Unified Production Graph  
**Branch**: `014-unified-production-graph`  
**Date**: 2026-10-19  

## Technical Decisions & Rationale

### Decision 1: LangGraph StateGraph Architecture for Unified Graph
- **Decision**: Implement `createProductionGraph()` in `src/agents/production-graph.ts` using LangGraph's `StateGraph` and `Annotation.Root`.
- **Rationale**:
  - LangGraph provides native support for state accumulation, conditional branching, and deterministic transitions between nodes.
  - Using a single state graph aligns with Core Principle V (Agent-Centric Orchestration) and allows clean separation between `context` preparation, `router` classification, strategy node execution (`react`, `plan-and-execute`, `reflection`), and final `response` formatting.
- **Alternatives Considered**:
  - *Hardcoded controller chain in Express*: Rejected because controller logic becomes cluttered with agent branching and state accumulation, violating MVC separation.
  - *Nested graph execution*: We embed each existing strategy cleanly as a node function in the graph, preserving modularity while providing a single top-level compiled graph.

---

### Decision 2: Structured Output for Operational Router
- **Decision**: Use `model.withStructuredOutput(RouteDecisionSchema)` with Zod schema `{ route: z.enum(["react", "plan-and-execute", "reflection"]), reason: z.string() }`.
- **Rationale**:
  - Ensures reliable schema enforcement and eliminates JSON parsing errors or hallucinated route names.
  - Structured output provides clear explainability via the `reason` field, which is directly propagated to observability traces.
- **Decision Table in Prompt**:
  | Route | Target Operations | Criteria / Typical Triggers |
  |---|---|---|
  | `react` | Fast queries & direct actions | Status queries, alert listing, single-step lookups, basic tool invocation |
  | `plan-and-execute` | Complex incident triage | Multi-step operational procedures, mitigation sequences, opening + investigating + resolving incidents |
  | `reflection` | High-precision diagnostics | Critical investigations, root-cause verification where hallucination risk is high and factual grounding against real observations is vital |
- **Alternatives Considered**:
  - *Regex/keyword matching*: Brittle and fails on nuanced natural language instructions.
  - *Unstructured prompting*: Prone to returning invalid markdown or varying JSON formats.

---

### Decision 3: Trace Event Schema with Mandatory `node` Field and `"route"` Event Type
- **Decision**:
  - Extend `TraceEventTypeSchema` with `"route"`.
  - Extend `BaseTraceEventSchema` with `node: z.string().min(1)`.
  - Add `RouteTraceEventSchema` to `TraceEventSchema` union.
  - Ensure every event produced during execution has `node` set (e.g. `"context"`, `"router"`, `"react"`, `"plan-and-execute"`, `"reflection"`, `"response"`).
- **Rationale**:
  - Operators and observability systems need to know which graph node generated each thought, action, observation, critique, or route decision.
  - Standardizing `node` on all events provides seamless end-to-end trace auditing.
- **Alternatives Considered**:
  - *Optional `node` field*: Rejected because consistency in metrics and observability requires 100% of events to carry node attribution.
  - *Separate route log outside trace*: Rejected because operators rely on a single chronological trace array.

---

### Decision 4: Strategy Override Handling in `/chat`
- **Decision**:
  - `strategy` in `ChatRequestSchema` remains optional (`z.enum(["react", "plan-and-execute", "reflection"]).optional()`).
  - When provided, the router node bypasses the LLM classification call, immediately selects the specified strategy, and records an explicit override event in the trace (`reason: "Manual override via request parameter"`).
  - When omitted, the router invokes the LLM with structured output and routes autonomously.
- **Rationale**:
  - Saves model latency and token budget when the caller already knows the target strategy.
  - Provides full backward compatibility for callers and automated benchmark suites while enabling autonomous operation by default.
- **Alternatives Considered**:
  - *Separate `/chat/autonomous` and `/chat/override` endpoints*: Adds unnecessary API fragmentation. A single endpoint with an optional override field is cleaner and idiomatic.

---

### Decision 5: Fault Tolerance and Offline Fallback
- **Decision**: If the router model invocation fails (network issue, LLM error, timeout), the router node catches the error and defaults to `"react"`, recording the fallback reason in the trace.
- **Rationale**:
  - Core Principle V requires resilience against LLM failure modes. OpsPilot must remain operational even if a router classification fails.
