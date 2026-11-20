# Implementation Plan: History Pruning & Rolling Summary

**Branch**: `012-history-summary-pruning` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-history-summary-pruning/spec.md`

## Summary

Implement conversational history pruning and rolling summarization. Restrict the active raw history window to the 8 most recent messages. When older messages exit the window, accumulate them until a chunk of 8 newly evicted messages is reached. Trigger a rolling summarization distilling decisions, facts, and open pending tasks into ~150 tokens, merged with the previous summary and persisted into `conversation_summaries`. Inject the summary ahead of the 8 raw messages in agent context, emit a `"summarize"` trace event, and verify behavior with fake LLM tests.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM, `strict: true`

**Primary Dependencies**: Express 5, Zod, `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`

**Storage**: SQLite (`node:sqlite`) table `conversation_summaries` alongside `messages`

**Testing**: `node:test` via `tsx`

**Target Platform**: Node.js 22 server (single-process)

**Project Type**: Web service + Agent reasoning engine

**Performance Goals**:
- Active raw history bounded to exactly 8 messages
- Summarization triggered strictly on 8-message eviction increments (never per-request)
- Target summary length ~150 tokens

**Constraints**:
- Summarizer failure must never crash the main request; fallback to preserving previous summary
- Zero summarization invocations on requests where fewer than 8 new messages were evicted

**Scale/Scope**:
- Automatically scales long-running dialogues indefinitely within bounded token budgets

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Pure Functions & MVC | ✅ Pass | Summarizer engine in `src/context/summarizer.ts`; storage in `src/store/conversation-store.ts`; controller orchestrates execution. |
| II. Strict Boundary Validation (Zod) | ✅ Pass | Trace event schema extended to validate `"summarize"` events. |
| III. Test-First & Quality Gates | ✅ Pass | Unit tests for storage and fake LLM summarizer; integration tests for threshold triggering and context injection. |
| IV. Secret & Environment Safety | ✅ Pass | Summaries discard ephemeral chit-chat and credentials. |
| V. Agent-Centric Orchestration | ✅ Pass | Emits `"summarize"` trace event; injects summary into agent prompt. |

## Project Structure

### Documentation (this feature)

```text
specs/012-history-summary-pruning/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── summary-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── models/
│   └── conversation.ts              # MODIFIED — ConversationSummary type & IConversationStore methods
├── store/
│   ├── conversation-store.ts        # MODIFIED — conversation_summaries DDL, getSummary, setSummary, getEvictedUnsummarizedMessages
│   └── conversation-store.test.ts   # MODIFIED — test eviction query & summary persistence
├── context/
│   ├── summarizer.ts                # NEW — ConversationSummarizer class, prompt & fake model support
│   ├── summarizer.test.ts           # NEW — unit tests for summarizer merging & operational retention
│   ├── tokens.ts                    # MODIFIED — include summary in ContextBreakdownInput & calculation
│   └── tokens.test.ts               # MODIFIED — test summary breakdown calculation
├── agents/
│   ├── types.ts                     # MODIFIED — add "summarize" to TraceEventTypeSchema & update ContextBreakdownSchema
│   └── react.ts                     # MODIFIED — inject summary before raw history messages
└── http/
    ├── chat.controller.ts           # MODIFIED — check 8-message eviction chunk, run summarizer, emit trace event, inject into context
    └── chat.test.ts                 # MODIFIED — integration tests for threshold triggering & summarize event
```

**Structure Decision**: Place summarization logic in `src/context/summarizer.ts` alongside `tokens.ts`. Extend `SqliteConversationStore` to manage `conversation_summaries`.

## Complexity Tracking

No constitution violations — no complexity justifications needed.
