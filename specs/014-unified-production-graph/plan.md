# Implementation Plan: Unified Production Graph (`production-graph.ts`)

**Branch**: `014-unified-production-graph` | **Date**: 2026-10-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-unified-production-graph/spec.md`

## Summary

Implement the unified LangGraph production graph in `src/agents/production-graph.ts`, consolidating all operations workflows into a clean state machine:
`context` -> `router` -> (`react` | `plan-and-execute` | `reflection`) -> `response`.
- **Router Node**: Leverages `model.withStructuredOutput(RouteDecisionSchema)` to classify queries according to an operational decision table, emitting a `"route"` trace event with the rationale.
- **Node Attribution**: Guarantees that 100% of trace events carry a mandatory `node` attribute (`"context"`, `"router"`, `"react"`, `"plan-and-execute"`, `"reflection"`, or `"response"`).
- **`/chat` Endpoint Integration**: The `strategy` parameter becomes optional; when omitted, the router selects the best strategy autonomously; when specified, the router skips LLM classification and honors the operator's manual override while recording the override in the `"route"` trace event.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM, `strict: true`

**Primary Dependencies**: Express 5, Zod, `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`

**Storage**: SQLite via `node:sqlite` (`DatabaseSync`) for conversation persistence and semantic memory recall, with in-memory graph state transitions during execution.

**Testing**: Native `node:test` via `tsx`

**Target Platform**: Node.js 22 server

**Project Type**: Autonomous agent graph & web service

**Performance Goals**:
- Router latency overhead < 800ms on autonomous routing calls.
- 0ms / 0 LLM calls spent on router when a manual `strategy` override is provided.
- 100% of trace events enriched with valid `node` property.

**Constraints**:
- Pure functions and immutable state reducers where possible.
- Strict boundary validation via Zod schemas at HTTP and graph boundaries.
- No direct `.env` access.
- Green quality gates (`npm run typecheck` and `npm test`).

**Scale/Scope**:
- Unifies all 3 core reasoning strategies (`react`, `plan-and-execute`, `reflection`) under a single production graph.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Pure Functions & MVC | ✅ Pass | `production-graph.ts` acts as the service orchestration layer for agent reasoning. Graph node transitions and route decisions are deterministic functions. Controller in `chat.controller.ts` remains pure dispatch & validation. |
| II. Strict Boundary Validation (Zod) | ✅ Pass | `RouteDecisionSchema`, updated `TraceEventSchema`, and `/chat` request/response validated via Zod schemas. |
| III. Test-First & Quality Gates | ✅ Pass | Unit and integration tests in `production-graph.test.ts` and updated `chat.test.ts` will validate autonomous routing, override mechanics, and node trace attribution. |
| IV. Secret & Environment Safety | ✅ Pass | OpenRouter and model creation accessed via existing config/model utilities; no `.env` reading. |
| V. Agent-Centric Orchestration | ✅ Pass | Replaces fragmented ad-hoc strategy dispatch with a stateful LangGraph (`StateGraph`) connecting `context`, `router`, strategies, and `response`. |

## Project Structure

### Documentation (this feature)

```text
specs/014-unified-production-graph/
├── spec.md              # Feature specification
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── production-graph-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── production-graph.ts          # NEW — Unified LangGraph state graph with context, router, strategies & response
│   ├── production-graph.test.ts     # NEW — Comprehensive tests for routing, override, and node trace attribution
│   ├── types.ts                     # MODIFIED — Add 'route' to TraceEventType, add mandatory 'node' to TraceEventSchema, add RouteDecisionSchema
│   ├── trace.ts                     # MODIFIED — Ensure formatTrace & toTrace support 'node' attribute and 'route' event
│   ├── react.ts                     # MODIFIED — Ensure all generated trace events contain node: 'react'
│   ├── plan-and-execute.ts          # MODIFIED — Ensure all generated trace events contain node: 'plan-and-execute'
│   └── reflection.ts                # MODIFIED — Ensure all generated trace events contain node: 'reflection'
├── http/
│   ├── chat.controller.ts           # MODIFIED — Adopt production graph execution; make strategy optional with override support
│   ├── schemas.ts                   # MODIFIED — Update ChatRequestSchema (optional strategy enum) and ChatResponseSchema
│   └── chat.test.ts                 # MODIFIED — Tests verifying autonomous routing and manual overrides via HTTP
└── index.ts                         # Unchanged entrypoint
```

**Structure Decision**:
Place the unified graph implementation in `src/agents/production-graph.ts` with focused unit/integration tests in `src/agents/production-graph.test.ts`. Update `src/agents/types.ts` and `src/agents/trace.ts` to support the new `"route"` event type and mandatory `node` field. Wire the HTTP controller `src/http/chat.controller.ts` to delegate to `production-graph.ts`.

## Complexity Tracking

No constitution violations — no complexity justifications needed.
