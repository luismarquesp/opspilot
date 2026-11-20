# Implementation Plan: HTTP Chat API Endpoint

**Branch**: `003-chat-api-endpoint` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-chat-api-endpoint/spec.md`

---

## Summary

Expose a `POST /chat` HTTP endpoint on the OpsPilot Express server. The endpoint accepts `{ message, strategy?, reflect? }`, validates at the boundary with Zod, resolves the named strategy from a new registry (`src/agents/index.ts`), optionally wraps it in `withReflection`, races execution against a 180-second timeout, and returns `{ answer, trace, metrics }` on success or structured error payloads on 400/422/504/500. A deterministic offline integration test suite ships with the feature.

---

## Technical Context

**Language/Version**: TypeScript ESM, strict: true — Node.js 22 LTS

**Primary Dependencies**: Express 5 (`^5.2.1`), Zod 4 (`^4.5.4`), `@langchain/langgraph`, `@langchain/core`, `@langchain/openai` — all already in `package.json`

**Storage**: N/A (this feature adds no new persistence)

**Testing**: `node:test` via `tsx` — `npm test` runs `node --import tsx --test "src/**/*.test.ts"`

**Target Platform**: Linux/macOS/Windows server — Node.js 22 LTS process

**Project Type**: Web service (Express HTTP API) layered on an agentic reasoning core

**Performance Goals**: P95 response time determined by LLM latency (external); server overhead < 5 ms per request for routing/validation

**Constraints**: 180s hard execution timeout enforced by `Promise.race`; no breaking changes to existing exports in `src/index.ts` or `src/arena.ts`

**Scale/Scope**: Single-process HTTP server; feature adds ~6 new files

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|---|:---:|---|
| **I. Pure Functions & MVC** | ✅ | `chatHandler` is a pure function; controller imports from service/agent layers only |
| **II. Strict Boundary Validation with Zod** | ✅ | `ChatRequestSchema.safeParse` at HTTP entry; response serialized via `StrategyResultSchema` |
| **III. Test-First & Quality Gates** | ✅ | `src/http/chat.test.ts` ships with the feature; `npm test` and `npm run typecheck` must remain green |
| **IV. Secret & Environment Safety** | ✅ | No `.env` reads in new code; `getEnv()` already handles env parsing |
| **V. Agent-Centric Orchestration** | ✅ | HTTP layer is a thin adapter; all agent logic remains in `src/agents/` |

No violations.

---

## Project Structure

### Documentation (this feature)

```text
specs/003-chat-api-endpoint/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── chat-api.md      # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── index.ts          # [NEW] Strategy registry + resolveStrategy()
│   ├── types.ts          # [EXISTING — unchanged]
│   ├── react.ts          # [EXISTING — unchanged]
│   ├── plan-and-execute.ts  # [EXISTING — unchanged]
│   └── reflection.ts     # [EXISTING — unchanged]
├── http/
│   ├── schemas.ts        # [NEW] Zod boundary schemas (request, response, errors)
│   ├── chat.controller.ts  # [NEW] chatHandler pure function
│   ├── server.ts         # [NEW] createApp() Express factory, route mounting
│   ├── index.ts          # [NEW] HTTP server startup entrypoint
│   └── chat.test.ts      # [NEW] Integration tests (node:test, offline)
├── config/
│   └── env.ts            # [EXISTING — PORT already present]
└── index.ts              # [EXISTING — no changes]
```

**Structure Decision**: Single-project layout, Option 1. The `src/http/` directory is added as a new layer sitting above `src/agents/` with no reverse dependencies. The existing `src/index.ts` barrel is not modified.

---

## Complexity Tracking

No constitution violations to justify.
