# Implementation Plan: Section-Budget Context Builder (`ContextBuilder`)

**Branch**: `013-context-budget-builder` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-context-budget-builder/spec.md`

## Summary

Implement a centralized context builder (`src/context/context-builder.ts`) that builds prompts for ALL reasoning strategies (`react`, `reflection`, `plan-and-execute`) with token ceilings per section configured via environment variables `CONTEXT_BUDGET_*`.
System prompt and current user message are untouchable (never truncated or dropped).
Rolling summary has a default budget of 200 tokens (`CONTEXT_BUDGET_SUMMARY`), history window has a default budget of 1200 tokens (`CONTEXT_BUDGET_WINDOW`, cuts oldest messages first), and semantic memories have a default budget of 300 tokens (`CONTEXT_BUDGET_MEMORY`, cuts lowest score first).
Unit tests will assert that constrained budgets cut in the exact specified priority orders while preserving untouchable sections.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM, `strict: true`

**Primary Dependencies**: Express 5, Zod, `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`

**Storage**: In-memory prompt synthesis and budget pruning, interacting with existing SQLite conversation and memory stores.

**Testing**: `node:test` via `tsx`

**Target Platform**: Node.js 22 server

**Project Type**: Agent reasoning engine & web service

**Performance Goals**:
- Sub-millisecond deterministic context assembly.
- Token ceilings strictly respected across all sections.
- 100% preservation of system prompt and user message across all turns.

**Constraints**:
- System prompt and current user message must never be truncated or omitted.
- Pure functions for context assembly and pruning algorithms.
- Full type safety and green test suite (`npm run typecheck` and `npm test`).

**Scale/Scope**:
- Unified across all three reasoning strategies (`react`, `reflection`, `plan-and-execute`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Pure Functions & MVC | ✅ Pass | `ContextBuilder` functions (`buildContext`, `pruneHistoryWindow`, `pruneMemoriesByScore`, `boundSummary`) are pure functions with no hidden side effects. Fits MVC architecture under context service layer. |
| II. Strict Boundary Validation (Zod) | ✅ Pass | `CONTEXT_BUDGET_*` environment variables and input configurations validated via `ContextBudgetsSchema`. |
| III. Test-First & Quality Gates | ✅ Pass | Unit tests cover budget truncation orders (oldest first for history, lowest score first for memories) with 100% passing tests. |
| IV. Secret & Environment Safety | ✅ Pass | Never reads `.env` directly; uses dedicated validated configuration helper. |
| V. Agent-Centric Orchestration | ✅ Pass | Standardizes prompt construction across LangChain / LangGraph strategies (`react`, `reflection`, `plan-and-execute`). |

## Project Structure

### Documentation (this feature)

```text
specs/013-context-budget-builder/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── context-builder-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── context-builder.ts           # NEW — ContextBuilder module with section budgets and pure pruning algorithms
│   ├── context-builder.test.ts      # NEW — Unit tests for section budgets, eviction orders, untouchable guarantees
│   ├── tokens.ts                    # EXISTING — Token estimation heuristics (~4 chars/token)
│   └── summarizer.ts                # EXISTING — ConversationSummarizer
├── agents/
│   ├── types.ts                     # MODIFIED — StrategyOptions & RecalledMemory types supporting score
│   ├── react.ts                     # MODIFIED — Delegate prompt building to ContextBuilder
│   ├── reflection.ts                # MODIFIED — Delegate prompt building to ContextBuilder
│   └── plan-and-execute.ts          # MODIFIED — Delegate prompt building to ContextBuilder
└── http/
    └── chat.controller.ts           # MODIFIED — Pass recalled memories with scores to strategy options
```

**Structure Decision**: Place the core logic in `src/context/context-builder.ts` with comprehensive unit tests in `src/context/context-builder.test.ts`. Wire strategies in `src/agents/` to adopt the centralized builder.

## Complexity Tracking

No constitution violations — no complexity justifications needed.
