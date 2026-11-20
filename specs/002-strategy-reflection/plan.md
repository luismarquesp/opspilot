# Implementation Plan: Strategy Reflection Layer

**Branch**: `002-strategy-reflection` | **Date**: 2026-09-13 | **Spec**: [specs/002-strategy-reflection/spec.md](file:///c:/Users/luism/OneDrive/Documentos/P%C3%B3s%20gradua%C3%A7%C3%A3o/Handsome/me/modulo04-agentes-autonomos/ops-pilot/specs/002-strategy-reflection/spec.md)

**Input**: User description: "Camada Reflection: withReflection (strategy, opts) decora qualquer ReasoningStrategy: executa a base, um crítico (mesmo modelo, saída estruturada { approved, feedback }) avalia a resposta contra as observações do trace; se reprovar, regenera com o feedback no contexto; para approved ou maxReflection (default:2). Evento 'critique' no trace; métricas somam as chamadas extras. Arena: reflect:react e reflect:plan-and-execute."

## Summary

The Strategy Reflection Layer enhances any `ReasoningStrategy` via a higher-order decorator `withReflection(strategy, options)`. It executes the underlying strategy, runs an LLM-based critic (using the same OpenRouter model with structured output `{ approved: boolean, feedback: string }`) that checks the proposed answer against real tool observations recorded in the execution trace. If the answer is rejected, it triggers bounded regeneration by feeding the critique feedback back into context, repeating until approved or until reaching `maxReflection` (default: 2). Every critique pass appends a typed `critique` event to the trace and aggregates telemetry (LLM calls and latency). The Strategy Arena CLI is extended to benchmark `reflect:react` and `reflect:plan-and-execute` side-by-side with baseline strategies.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript with ECMAScript Modules (ESM), `strict: true`, `moduleResolution: "NodeNext"`

**Primary Dependencies**: `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, `zod`

**Storage**: In-memory operational store (`InMemoryOpsStore`) / MySQL via Sequelize (`IOpsStore`)

**Testing**: Node.js native test runner (`node:test`) executed via `tsx`

**Target Platform**: Node.js 22 LTS / CLI (`arena.ts`) and agent services

**Project Type**: CLI tool and autonomous agent service layer

**Performance Goals**: Minimal overhead: exactly 1 critic evaluation call when approved on first attempt; bounded deterministic execution at `maxReflection` (default: 2)

**Constraints**: Pure functions for data extraction/formatting; no secret leakage (`.env` never read directly); `npm run typecheck` and `npm test` 100% green

**Scale/Scope**: Universal decorator for any `ReasoningStrategy` (currently ReAct and Plan-and-Execute); extensible to future reasoning strategies

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I: Pure Functions & MVC Architecture**: PASS. Trace extraction, context prompt formatting, and telemetry accumulation are implemented as pure functions. Decorator acts as a service layer orchestrator; Arena acts as the CLI controller.
- **Principle II: Strict Boundary Validation with Zod**: PASS. `CritiqueVerdictSchema` validates the structured output of the critic model; `ReflectionOptionsSchema` and `ArenaArgsSchema` validate external configuration and CLI arguments with Zod.
- **Principle III: Test-First & Non-Negotiable Quality Gates**: PASS. Unit tests in `src/agents/reflection.test.ts` and `src/arena.test.ts` will cover first-pass approval, feedback-guided regeneration, bounded termination on max reflection, metric aggregation, and arena integration. All tests and typechecks must remain green.
- **Principle IV: Secret & Environment Safety**: PASS. Critic model instantiates via `createModel()` from `src/agents/model.ts`, which reads from validated config and never accesses `.env` directly.
- **Principle V: Agent-Centric Orchestration (OpsPilot)**: PASS. Uses LangChain structured outputs with OpenRouter, emits inspectable and deterministic `critique` trace events, and handles LLM failure modes gracefully with fallback mechanisms.

## Project Structure

### Documentation (this feature)

```text
specs/002-strategy-reflection/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (architectural decisions & trade-offs)
├── data-model.md        # Phase 1 output (entities, schemas, state tracking)
├── quickstart.md        # Phase 1 output (runnable validation guide)
├── contracts/           # Phase 1 output (interface specifications)
│   ├── critique-schema.md
│   ├── reflection-contract.md
│   └── arena-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── types.ts               # Core contracts (ReasoningStrategy, TraceEvent, ReflectionOptions)
│   ├── reflection.ts          # withReflection decorator, critic evaluation, context feedback
│   ├── reflection.test.ts     # Unit tests for reflection decorator and loop semantics
│   ├── react.ts               # Existing ReAct strategy
│   ├── plan-and-execute.ts    # Existing Plan-and-Execute strategy
│   ├── trace.ts               # Trace formatting and message extraction utilities
│   ├── model.ts               # OpenRouter ChatOpenAI factory
│   └── ops-store.ts           # Store instance for tools
├── arena.ts                   # Arena CLI supporting reflect:react and reflect:plan-and-execute
└── arena.test.ts              # Unit tests for CLI parsing and strategy execution
```

**Structure Decision**: Single project modular layout adhering to MVC principles with pure function utilities and strict boundary validation.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None      | N/A        | All implementations adhere strictly to the Constitution and minimal modular design. |
