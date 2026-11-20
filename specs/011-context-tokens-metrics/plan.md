# Implementation Plan: Context Token Measurement & Metrics Breakdown

**Branch**: `011-context-tokens-metrics` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-context-tokens-metrics/spec.md`

## Summary

Instrument context token measurement for OpsPilot by implementing `src/context/tokens.ts` with `estimateTokens` (~4 chars per token) and LangChain real usage extraction (`extractTokenUsage`). Enrich `/chat` HTTP responses with real `promptTokens` and an estimated `contextBreakdown` partitioned by source (system, conversation history, semantic memories, user message). Provide an interactive demonstration script `conversa-long.sh` displaying progressive context growth per turn, backed by automated unit and integration tests.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM, `strict: true`

**Primary Dependencies**: Express 5, Zod, `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`

**Storage**: SQLite (`node:sqlite`) for conversation history and memories (read-only for metric extraction)

**Testing**: `node:test` via `tsx`

**Target Platform**: Node.js 22 server (single-process)

**Project Type**: Web service + Agent reasoning engine

**Performance Goals**:
- `estimateTokens` and `estimateContextBreakdown` execution time < 1ms (pure synchronous heuristic)
- 0ms network overhead added to `/chat` request processing

**Constraints**:
- Robust fallback when models do not report `usage_metadata` (e.g. mock models in test environments)
- Strict backward compatibility for `ChatResponse` metrics
- Shell script `conversa-long.sh` must be cross-platform compatible (Git Bash / Linux / macOS)

**Scale/Scope**:
- Applies to all conversational turns and reasoning strategies (`react`, `plan-and-execute`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Pure Functions & MVC | ✅ Pass | `src/context/tokens.ts` consists of pure calculation functions; controllers and agents use them as utilities. |
| II. Strict Boundary Validation (Zod) | ✅ Pass | `StrategyMetricsSchema` and `ContextBreakdownSchema` strictly validated on border schemas in `src/http/schemas.ts` and `src/agents/types.ts`. |
| III. Test-First & Quality Gates | ✅ Pass | Unit tests in `src/context/tokens.test.ts` and integration tests in `src/http/chat.test.ts`. |
| IV. Secret & Environment Safety | ✅ Pass | Never logs or stores sensitive contents; only calculates lengths and numeric token counts. |
| V. Agent-Centric Orchestration | ✅ Pass | Plugs into LangGraph message trajectory to harvest real usage. |

## Project Structure

### Documentation (this feature)

```text
specs/011-context-tokens-metrics/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── tokens-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts                    # NEW — estimateTokens, extractTokenUsage, estimateContextBreakdown
│   └── tokens.test.ts               # NEW — unit tests for token heuristics & LangChain usage extraction
├── agents/
│   ├── types.ts                     # MODIFIED — ContextBreakdownSchema & updated StrategyMetricsSchema
│   ├── trace.ts                     # MODIFIED — extract token usage from AI messages in trace
│   ├── react.ts                     # MODIFIED — pass real token metrics in StrategyResult
│   └── plan-and-execute.ts          # MODIFIED — pass real token metrics in StrategyResult
├── http/
│   ├── chat.controller.ts           # MODIFIED — compute contextBreakdown and include in response metrics
│   ├── schemas.ts                   # MODIFIED — update ChatResponseSchema if needed
│   └── chat.test.ts                 # MODIFIED — assert promptTokens and contextBreakdown in /chat responses
conversa-long.sh                     # NEW — multi-turn CLI demonstration script
```

**Structure Decision**: Create `src/context/` directory for context budgeting and token instrumentation. Update `StrategyMetrics` in `src/agents/types.ts` so all agents expose standard token metrics.

## Complexity Tracking

No constitution violations — no complexity justifications needed.
