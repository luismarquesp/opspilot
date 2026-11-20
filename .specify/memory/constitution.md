<!--
Sync Impact Report:
- Version change: 1.0.0 -> 1.1.0 (MINOR – replaced MySQL/Sequelize with SQLite via node:sqlite)
- List of modified principles:
  - Technology Stack & Execution Constraints: "Database & Persistence" updated
    - Before: MySQL via mysql2 and sequelize ORM
    - After: SQLite via Node.js built-in node:sqlite (DatabaseSync); zero external DB dependency
- Added sections:
  - None
- Removed sections:
  - None
- Follow-up TODOs:
  - None
-->

# OpsPilot Constitution

## Core Principles

### I. Pure Functions & MVC Architecture
- The system MUST adhere to standard Model-View-Controller (MVC) separation of concerns: Model for data access and persistence, Service for business logic and agent workflows, and Controller for incoming HTTP and CLI boundary dispatch.
- Domain logic MUST be implemented using pure functions without hidden side effects whenever possible.
- Domain errors MUST be modeled as explicit domain error classes and translated into boundary responses (e.g. HTTP status codes or formatted CLI output) exclusively at the controller/boundary layer.

### II. Strict Boundary Validation with Zod
- All incoming and outgoing data at external boundaries (HTTP requests/responses, CLI arguments/output, environment parameters) MUST be strictly validated using Zod schemas.
- Untyped or unvalidated data MUST NOT penetrate past the boundary layer into services or domain models.

### III. Test-First & Non-Negotiable Quality Gates
- Any new business or domain logic MUST be accompanied by automated unit/integration tests using Node.js native test runner (`node:test`) executed via `tsx`.
- Quality gates MUST remain green at all times: `npm run typecheck` (`tsc --noEmit`) and `npm test` (`node --import tsx --test "src/**/*.test.ts"`) MUST pass with zero errors before changes are merged or deployed.

### IV. Secret & Environment Safety
- Secret files, specifically `.env`, MUST NEVER be committed to version control and MUST NEVER be read directly in application or domain code.
- Configuration and environment variables MUST be parsed, validated, and accessed through dedicated configuration modules.

### V. Agent-Centric Orchestration (OpsPilot)
- OpsPilot acts as an autonomous on-call copilot for triaging, managing, and resolving production alerts and incidents.
- Agent workflows MUST be constructed with LangChain (`@langchain/core`, `@langchain/openai`) and LangGraph (`@langchain/langgraph`) connecting via OpenRouter.
- Agent interactions, decision paths, and state transitions MUST be deterministic, inspectable, and resilient to LLM failure modes.

## Technology Stack & Execution Constraints

- **Runtime & Language**: Node.js 22 LTS, TypeScript with ECMAScript Modules (ESM) and `strict: true`.
- **Web Framework**: Express 5 (`express`).
- **Database & Persistence**: SQLite via the Node.js built-in `node:sqlite` module (`DatabaseSync`); no external database driver or ORM required. The database file path is controlled by the `OPSPILOT_DB` environment variable (default `./data/opspilot.db`); tests MUST use `":memory:"`.
- **Agent Stack**: `@langchain/core`, `@langchain/langgraph`, `@langchain/openai` (over OpenRouter).
- **Validation**: `zod` at all system boundaries.
- **Execution & Testing**: `tsx` for TypeScript execution and `node:test` for test execution.
- **Standard Tooling & Commands**:
  - `npm run dev`: Starts local development server (`tsx src/index.ts`).
  - `npm run arena`: Executes evaluation/arena environment (`tsx src/arena.ts`).
  - `npm run bench`: Runs benchmark suite (`tsx src/bench.ts`).
  - `npm test`: Runs test suite (`node --import tsx --test "src/**/*.test.ts"`).
  - `npm run typecheck`: Runs TypeScript type checking (`tsc --noEmit`).

## Development Workflow & Spec Kit Process

- **Spec Kit Lifecycle**: All work MUST follow the structured lifecycle: `/speckit.specify` -> `plan` -> `task` -> `implement`.
- **Specification Versioning**: Feature specifications, architectural plans, and task breakdowns MUST be committed and versioned alongside the code.
- **Code Quality Requirements**: No PR or implementation task is complete without passing both `npm run typecheck` and `npm test`.

## Governance

This Constitution supersedes all informal practices and serves as the primary governing standard for OpsPilot.
- **Compliance Review**: All proposed changes, PRs, and agent tasks MUST be validated against this Constitution.
- **Amendments**: Amending this Constitution requires updating `.specify/memory/constitution.md`, incrementing the version according to SemVer rules, and documenting the rationale in the Sync Impact Report.
- **Runtime Guidance**: Developers and autonomous agents MUST consult [AGENTS.md](file:///c:/Users/luism/OneDrive/Documentos/P%C3%B3s%20gradua%C3%A7%C3%A3o/Handsome/me/modulo04-agentes-autonomos/ops-pilot/AGENTS.md) and this Constitution during all implementation cycles.

**Version**: 1.1.0 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-09-16
