# Implementation Plan: OpsPilot Reasoning Core

**Branch**: `001-reasoning-core` | **Date**: 2026-09-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-reasoning-core/spec.md`

## Summary

Implement the core reasoning engine for OpsPilot, enabling autonomous triage and resolution of production alerts and incidents. The solution provides a unified `ReasoningStrategy` contract, a centralized OpenRouter model factory, operational mock tools backed by a seeded store (5 services, 6 alerts: 3 firing, 3 resolved), two distinct reasoning strategies (LangGraph prebuilt ReAct and a custom Plan-and-Execute graph with an 8-step cap), an Arena CLI for comparative benchmarking, and offline deterministic tests.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM (`strict: true`)  
**Primary Dependencies**: `@langchain/core` (`^1.2.9`), `@langchain/langgraph` (`^1.4.14`), `@langchain/openai` (`^1.5.11`), `express` (`^5.2.1`), `sequelize` (`^6.37.8`), `mysql2` (`^3.24.3`), `zod` (`^4.5.4`)  
**Storage**: MySQL via Sequelize with in-memory store/SQLite fallback for deterministic offline testing  
**Testing**: Node.js native test runner (`node:test`) executed via `tsx`  
**Target Platform**: Linux / Cross-platform server environment  
**Project Type**: CLI / Agent Core Service  
**Performance Goals**: Offline tests execute in < 5s; reasoning strategies report latency and LLM call counts per execution  
**Constraints**: Zero network calls in unit tests; Plan-and-Execute hard-capped at 8 steps; temperature fixed at 0; no direct `.env` reading outside config module  
**Scale/Scope**: 5 core services, 6 baseline alerts, 3 operational tools, 2 reasoning strategies, Arena CLI  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **Principle I (Pure Functions & MVC Architecture)**: PASS. System separates persistence models (`src/models/`), agent services and strategies (`src/agents/`), and CLI boundary controllers (`src/arena.ts`). Domain logic uses pure functions; errors are modeled as typed domain errors.
- **Principle II (Strict Boundary Validation with Zod)**: PASS. All tool arguments (`list_alerts`, `open_incident`, `resolve_incident`), CLI parameters (`ArenaArgsSchema`), and trace event payloads are validated strictly via Zod.
- **Principle III (Test-First & Green Quality Gates)**: PASS. Test suite uses `node:test` via `tsx` with zero network dependencies. `npm run typecheck` and `npm test` are maintained green.
- **Principle IV (Secret & Environment Safety)**: PASS. Centralized configuration module (`src/config/env.ts`) parses environment variables with Zod; `.env` is never committed or accessed directly in domain code.
- **Principle V (Agent-Centric Orchestration)**: PASS. Built on LangChain (`@langchain/openai`, `@langchain/core`) and LangGraph (`@langchain/langgraph`) over OpenRouter, with deterministic state and bounded iteration loops.

## Project Structure

### Documentation (this feature)

```text
specs/001-reasoning-core/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── strategy-contract.md
│   ├── tools-contract.md
│   └── arena-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - to be created)
```

### Source Code (repository root)

```text
src/
├── config/
│   └── env.ts                  # Zod-validated environment config
├── models/
│   ├── db.ts                   # Sequelize database connection & setup
│   ├── service.model.ts        # Service Sequelize model
│   ├── alert.model.ts          # Alert Sequelize model
│   ├── incident.model.ts       # Incident Sequelize model
│   ├── store.ts                # IOpsStore interface, Sequelize & in-memory implementations
│   └── store.test.ts           # Deterministic store & seeding tests
├── agents/
│   ├── types.ts                # ReasoningStrategy, TraceEvent, StrategyMetrics contracts
│   ├── model.ts                # Centralized OpenRouter ChatOpenAI factory
│   ├── tools.ts                # list_alerts, open_incident, resolve_incident with Zod schemas
│   ├── react.ts                # LangGraph ReAct agent strategy with trace capture
│   ├── plan-and-execute.ts     # Custom LangGraph Plan-and-Execute graph (planner, executor, replanner)
│   ├── trace.ts                # Trace formatter & serialization utilities
│   ├── trace.test.ts           # Deterministic trace format unit tests
│   └── tools.test.ts           # Deterministic tools validation unit tests
├── scripts/
│   └── seed.ts                 # Database seed script (5 services, 6 alerts: 3 firing, 3 resolved)
├── arena.ts                    # Arena CLI runner with --strategies & --max-iterations flags
└── index.ts                    # Application entrypoint
```

**Structure Decision**: Standard MVC and modular agent layout matching repository conventions, separating database models (`src/models/`), agent strategies and tools (`src/agents/`), scripts (`src/scripts/`), and CLI interfaces (`src/arena.ts`).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *None*    | N/A        | Cleanly conforms to all project architectural rules and conventions |
