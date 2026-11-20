# Implementation Plan: Persistent Conversation Store and Multi-Turn Chat

**Branch**: `007-persistent-conversation` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-persistent-conversation/spec.md`

## Summary

Add multi-turn conversation persistence to OpsPilot via a `ConversationStore` backed by SQLite (`node:sqlite` / `DatabaseSync`), extending `POST /chat` with an optional `conversationId` field. The store exposes `create`, `append`, and `lastMessages` operations over a new `messages` table. The chat controller composes up to the 12 most recent historical messages into the agent prompt and reports `historyMessages` in `metrics`. The conversation store follows the same architectural patterns established by `SqliteOpsStore` (DDL on construction, prepared statements, `:memory:` in tests).

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM, `strict: true`

**Primary Dependencies**: Express 5, Zod 4, `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`

**Storage**: SQLite via `node:sqlite` (`DatabaseSync`) — same database file as `SqliteOpsStore` (`OPSPILOT_DB` / `./data/opspilot.db`); `:memory:` for tests

**Testing**: `node:test` via `tsx`, `supertest` for HTTP integration tests

**Target Platform**: Node.js 22 server (single process)

**Project Type**: Web service (Express 5 REST API) + LangGraph agent

**Performance Goals**: Sub-second message persistence; 12-message context retrieval latency < 10ms for typical conversation sizes

**Constraints**: Single-process SQLite; `DatabaseSync` is synchronous; no external migration tools; prompt context bounded to 12 messages

**Scale/Scope**: Single-user to small-team on-call; conversations are per-session, not long-term archives

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Pure Functions & MVC | ✅ Pass | `ConversationStore` is a Model-layer class. Prompt composition is a pure function in service layer. Controller dispatches boundary validation. |
| II. Strict Boundary Validation (Zod) | ✅ Pass | `conversationId` added to `ChatRequestSchema` with Zod. `historyMessages` added to response schema. |
| III. Test-First & Quality Gates | ✅ Pass | Store tests with `:memory:` SQLite. HTTP integration tests with fake strategy + in-memory store. |
| IV. Secret & Environment Safety | ✅ Pass | No new secrets. Reuses existing `OPSPILOT_DB` env var via config module. |
| V. Agent-Centric Orchestration | ✅ Pass | History injected as LangChain message objects into agent `invoke()`. No changes to core agent loop. |

**Gate result**: All principles satisfied — proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/007-persistent-conversation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── chat-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── store/
│   ├── sqlite-ops-store.ts          # Existing — operational data store
│   ├── sqlite-ops-store.test.ts     # Existing — operational store tests
│   ├── conversation-store.ts        # NEW — IConversationStore + SqliteConversationStore
│   └── conversation-store.test.ts   # NEW — store unit tests (:memory:)
├── models/
│   ├── store.ts                     # Existing — IOpsStore, baseline data
│   └── conversation.ts              # NEW — IConversationStore interface, ConversationMessage type
├── http/
│   ├── server.ts                    # MODIFIED — pass conversationStore into createApp
│   ├── chat.controller.ts           # MODIFIED — multi-turn conversation flow
│   ├── chat.test.ts                 # MODIFIED — add multi-turn integration tests
│   └── schemas.ts                   # MODIFIED — add conversationId, historyMessages
├── agents/
│   ├── types.ts                     # MODIFIED — extend StrategyMetrics with historyMessages
│   ├── react.ts                     # MODIFIED — accept messages[] for history injection
│   ├── plan-and-execute.ts          # MODIFIED — accept messages[] for history injection
│   └── index.ts                     # Existing — resolveStrategy unchanged
└── config/
    └── env.ts                       # Existing — no changes (OPSPILOT_DB already defined)
```

**Structure Decision**: Single project layout following existing MVC conventions. The `ConversationStore` sits in `src/store/` alongside `SqliteOpsStore`, with its interface in `src/models/conversation.ts` mirroring how `IOpsStore` lives in `src/models/store.ts`. No new directories needed beyond the `contracts/` spec artifact.

## Complexity Tracking

No constitution violations — no complexity justifications needed.
