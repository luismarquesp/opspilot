# Implementation Plan: Learning Reflector & Memory Distillation

**Branch**: `009-learning-reflector` | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-learning-reflector/spec.md`

## Summary

Implement a post-response learning reflector using LangChain's `withStructuredOutput` (`{ hasLearning: boolean, fact?: string }`) that distills durable operational facts from user interactions while strictly ignoring punctual requests and confidential secrets. Extracted facts are asynchronously persisted via `memoryStore.remember(userId, fact)` in a non-blocking background microtask. Additionally, expose a `forget_preference` agent tool allowing operators to naturally revoke obsolete preferences.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM, `strict: true`

**Primary Dependencies**: Express 5, Zod, `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, `@huggingface/transformers`

**Storage**: SQLite via `node:sqlite` (`memories` table, `DatabaseSync`)

**Testing**: `node:test` via `tsx`

**Target Platform**: Node.js 22 server (single-process)

**Project Type**: Web service + Agent reasoning engine

**Performance Goals**:
- Reflection distillation model call execution < 1500ms
- 0ms blocking impact on `/chat` HTTP response latency (detached asynchronous execution)

**Constraints**:
- Strict negative filtering: never distill one-off action commands or credentials
- Only execute reflection when `userId` is present
- Backward compatible with existing `/chat` and agent loops

**Scale/Scope**:
- One background reflection per `/chat` request with `userId`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Pure Functions & MVC | ✅ Pass | Reflector is in the memory service layer; tool is in agents/tools; controller dispatches asynchronous execution at boundary. |
| II. Strict Boundary Validation (Zod) | ✅ Pass | `LearningExtractionSchema` and `ForgetPreferenceSchema` defined and validated with Zod. |
| III. Test-First & Quality Gates | ✅ Pass | Mock-model unit tests for reflection rules and negative constraints; tool tests for `forget_preference`. |
| IV. Secret & Environment Safety | ✅ Pass | Negative constraint explicitly rejects distilling secrets/credentials. |
| V. Agent-Centric Orchestration | ✅ Pass | `forget_preference` added as an agent tool in `opsTools`. |

## Project Structure

### Documentation (this feature)

```text
specs/009-learning-reflector/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── reflector-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── memory/
│   ├── reflector.ts                 # NEW — LearningReflector class & prompt
│   ├── reflector.test.ts            # NEW — unit tests for distillation & negative filtering
│   ├── memory-store.ts              # Existing
│   └── embeddings.ts                # Existing
├── agents/
│   ├── tools.ts                     # MODIFIED — add forget_preference tool to opsTools
│   ├── tools.test.ts                # MODIFIED/NEW — tests for forget_preference
│   ├── react.ts                     # Existing
│   └── plan-and-execute.ts          # Existing
└── http/
    ├── chat.controller.ts           # MODIFIED — dispatch background reflection when userId present
    └── chat.test.ts                 # MODIFIED — integration tests for background reflection
```

**Structure Decision**: Place the reflector inside `src/memory/reflector.ts` alongside `memory-store.ts`. The `forget_preference` tool lives in `src/agents/tools.ts` alongside existing operational tools.

## Complexity Tracking

No constitution violations — no complexity justifications needed.
