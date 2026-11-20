# Implementation Plan: Model Fallback & Retry Resilience

**Branch**: `015-model-fallback-resilience` | **Date**: 2026-10-21 | **Spec**: [specs/015-model-fallback-resilience/spec.md](file:///c:/Users/luism/OneDrive/Documentos/P%C3%B3s%20gradua%C3%A7%C3%A3o/Handsome/me/modulo04-agentes-autonomos/ops-pilot/specs/015-model-fallback-resilience/spec.md)

**Input**: Feature specification from `/specs/015-model-fallback-resilience/spec.md`

## Summary

Implement multi-tier model resilience in OpsPilot:
1. Environment variable `OPENROUTER_MODEL_FALLBACK` parsed as an ordered list of fallback models.
2. Model factory `createModel()` in `src/agents/model.ts` enhanced with `withRetry` on the primary model (for transient 429/5xx/timeout errors) and `withFallbacks([reservas])` for cascading failover.
3. Structured execution trace updated with a `"fallback"` trace event schema (`fromModel`, `toModel`, `reason`, and mandatory `node: string`).
4. Response telemetry updated to record `metrics.modelUsed`.
5. Domain error `ModelUnavailableError` defined and translated at the HTTP controller boundary into HTTP 503 (`model_unavailable`) when all models fail.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM (`strict: true`)  
**Primary Dependencies**: `@langchain/core` (^1.2.9), `@langchain/openai` (^1.5.11), `zod` (^4.5.4), `express` (^5.2.1)  
**Storage**: N/A (stateless model resilience)  
**Testing**: Native Node.js test runner (`node:test`) executed via `tsx`  
**Target Platform**: Node.js server environment (Linux / Windows / Docker)  
**Project Type**: Agent reasoning engine and web service API  
**Performance Goals**: Model failover switch within 2.5s; primary retry backoff bounded to preserve timeout budgets; HTTP 503 within request deadline  
**Constraints**: Zero unhandled crashes; 100% trace events carry `node: string`; zero reading of `.env` directly; `npm run typecheck` and `npm test` exit with 0 errors  
**Scale/Scope**: Core model factory (`src/agents/model.ts`), configuration schema (`src/config/env.ts`), agent types and trace (`src/agents/types.ts`, `src/agents/trace.ts`), and HTTP boundary (`src/http/chat.controller.ts`)  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status | Verification |
|---|---|---|---|
| **I. Pure Functions & MVC Architecture** | Domain error `ModelUnavailableError` translated exclusively at the controller layer into HTTP 503; helper parsing functions (`parseFallbackModels`) are pure | **PASS** | Clear separation between model factory, domain errors, and HTTP controller |
| **II. Strict Boundary Validation with Zod** | `OPENROUTER_MODEL_FALLBACK` validated via Zod in `EnvSchema`; `FallbackTraceEventSchema` and `StrategyMetricsSchema` validated with Zod | **PASS** | Zod schemas enforce type safety at external and internal boundaries |
| **III. Test-First & Quality Gates** | Unit tests for fallback parser, model factory retry/fallbacks, trace formatting, and HTTP 503 boundary response | **PASS** | `npm run typecheck` and `npm test` required |
| **IV. Secret & Environment Safety** | Configuration accessed strictly via `src/config/env.ts` with no direct `.env` reads | **PASS** | `getEnv()` supplies validated `OPENROUTER_MODEL_FALLBACK` |
| **V. Agent-Centric Orchestration** | LangChain `withRetry` and `withFallbacks` leveraged across LangGraph strategies | **PASS** | Preserves LangGraph and LangChain agent contracts |

## Project Structure

### Documentation (this feature)

```text
specs/015-model-fallback-resilience/
├── plan.md              # Implementation plan (this file)
├── research.md          # Phase 0 technical decisions and research
├── data-model.md        # Phase 1 data entities and state transitions
├── contracts/
│   └── chat-api.md      # Phase 1 API contract (200 OK with fallback trace, 503 error)
├── quickstart.md        # Phase 1 validation scenarios
└── checklists/
    └── requirements.md  # Quality validation checklist
```

### Source Code (repository root)

```text
src/
├── config/
│   └── env.ts                 # Add OPENROUTER_MODEL_FALLBACK to EnvSchema & parseFallbackModels
├── agents/
│   ├── types.ts               # Add "fallback" to TraceEventTypeSchema, FallbackTraceEventSchema, modelUsed
│   ├── trace.ts               # Add [FALLBACK] formatter to formatTraceEvent
│   ├── errors.ts              # Define ModelUnavailableError domain error
│   ├── model.ts               # Enhance createModel with withRetry & withFallbacks
│   ├── model.test.ts          # Unit tests for retry, fallback chain, and modelUsed
│   ├── react.ts               # Ensure strategy propagates modelUsed & fallback events
│   ├── plan-and-execute.ts    # Ensure strategy propagates modelUsed & fallback events
│   └── reflection.ts          # Ensure strategy propagates modelUsed & fallback events
└── http/
    ├── chat.controller.ts     # Map ModelUnavailableError to HTTP 503
    └── chat.test.ts           # Integration tests for fallback traces, modelUsed, and 503
```

**Structure Decision**: Single project MVC adhering to existing OpsPilot structure. Model resilience logic is localized to `src/agents/model.ts` and `src/config/env.ts`, with trace schemas updated in `src/agents/types.ts` and controller boundary mapping in `src/http/chat.controller.ts`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations detected.*
