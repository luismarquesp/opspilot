# Feature Specification: History Pruning & Rolling Summary

**Feature Branch**: `012-history-summary-pruning`  
**Created**: 2026-10-03  
**Status**: Draft  
**Input**: User description: "Sumarização de histórico (pruning): tabela conversation_summaries; o que sai das 8 mensagens recentes vira resumo de ~150 tokens preservando decisões, fatos e pendências, MESCLADO ao resumo anterior e persistido - refeito só quando 8 novas mensagens saem da janela, nunca a cada request. Resumo entra no contexto; evento 'summarize'. Com teste fake"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chunked Pruning & Summary Storage (Priority: P1) 🎯 MVP

As an on-call engineer engaged in extended troubleshooting sessions, I want OpsPilot to retain only the 8 most recent raw messages while condensing older messages into a rolling summary stored in `conversation_summaries`, so that the conversational context remains bounded without losing track of past interactions.

**Why this priority**: Prevents unbounded context growth and memory leaks in long sessions while maintaining operational continuity.

**Independent Test**:
Append 16 messages to a conversation. Verify that messages 1 to 8 are pruned from the active raw window and distilled into a consolidated summary in `conversation_summaries`, while messages 9 to 16 remain as the raw history window. When message 17 is added, verify that summarization is NOT triggered again until 8 more messages exit the window.

**Acceptance Scenarios**:
1. **Given** a conversation with 8 or fewer messages, **When** evaluated, **Then** no summarization is performed and all messages are returned as raw history.
2. **Given** a conversation where between 1 and 7 messages have exited the 8-message window, **When** evaluated, **Then** existing summary (if any) is preserved and the summarizer is NOT called.
3. **Given** a conversation where 8 or more unsummarized messages have exited the window, **When** evaluated, **Then** the summarizer is triggered on the evicted chunk, and `last_summarized_message_id` is updated in `conversation_summaries`.

---

### User Story 2 - Rolling Consolidated Summary & Context Injection (Priority: P1)

As an on-call engineer, I want the summary to preserve critical operational decisions, discovered facts, and pending items in ~150 tokens, merged with the prior summary and injected into the copilot's context, so that the agent remembers previous steps without re-reading the entire conversation history.

**Why this priority**: Ensures the assistant maintains full situational awareness of the ongoing incident mitigation across long dialogues.

**Independent Test**:
In a conversation with an existing summary ("auth-service reiniciado com sucesso; pendente investigar logs de checkout"), accumulate 8 new messages resolving checkout. Verify the updated summary in `conversation_summaries` merges both chunks into ~150 tokens. Inspect the `/chat` prompt context to verify the summary is injected ahead of the 8 raw messages.

**Acceptance Scenarios**:
1. **Given** an existing summary and 8 newly pruned messages, **When** summarization runs, **Then** the model produces a unified summary of ~150 tokens preserving decisions, facts, and open pending tasks.
2. **Given** a conversation with an active summary, **When** `POST /chat` is processed, **Then** the summary is injected into the context as `[Resumo da Conversa Anterior]` before the 8 raw messages.
3. **Given** the injected summary, **When** `metrics.contextBreakdown` is calculated, **Then** the summary tokens are accounted for in the context breakdown.

---

### User Story 3 - Trace Event `"summarize"` Observability (Priority: P2)

As an operator observing agent execution traces, I want a trace event of type `"summarize"` to appear in the execution trace whenever a summarization occurs, so that I have complete visibility into when context compression happens.

**Why this priority**: Provides clear operational transparency during debugging and audit of agent behavior.

**Independent Test**:
Trigger a chat request that causes a 8-message pruning threshold crossing. Inspect `res.body.trace` and verify an event with `type: "summarize"` is present with the newly generated summary text. In the next turn (where no new summarization occurs), verify no `"summarize"` event is emitted.

**Acceptance Scenarios**:
1. **Given** a turn where summarization is executed, **When** the response is assembled, **Then** `trace` includes an event `{ type: "summarize", content: <summary>, timestamp }`.
2. **Given** a turn where summarization is not triggered, **When** the response is assembled, **Then** `trace` does not contain a `"summarize"` event.

---

## Edge Cases

- **First Eviction Chunk**: First summarization occurs when message count reaches at least 16 (8 evicted + 8 raw in window).
- **Subsequent Eviction Chunks**: Next summarization occurs at message 24 (another 8 evicted), then 32, etc.
- **Model Failure during Summarization**: If the summary LLM fails or times out, the previous summary is preserved without interrupting the user request or crashing `/chat`.
- **Very Short Evicted Messages**: Even if evicted messages are short (e.g., "ok", "sim"), the 8-message count trigger strictly applies to avoid erratic per-request invocations.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create SQLite table `conversation_summaries` with columns `conversation_id TEXT PRIMARY KEY`, `summary TEXT NOT NULL`, `last_summarized_message_id INTEGER NOT NULL`, and `updated_at TEXT NOT NULL`.
- **FR-002**: `IConversationStore` and `SqliteConversationStore` MUST retain the 8 most recent messages as the active conversational window.
- **FR-003**: System MUST identify messages that have exited the 8-message window and trigger summarization ONLY when the count of unsummarized evicted messages reaches 8 or more.
- **FR-004**: Summarization MUST NEVER run on every individual request.
- **FR-005**: The summarizer prompt MUST instruct the model to produce a concise summary of ~150 tokens preserving:
  - Decisões tomadas (decisions taken)
  - Fatos operacionais descobertos (discovered operational facts)
  - Pendências / tarefas em aberto (pending tasks and unresolved issues)
- **FR-006**: When a prior summary exists, the summarizer MUST merge the prior summary with the new chunk of 8 evicted messages into a single updated summary.
- **FR-007**: System MUST inject the active summary ahead of the 8 raw messages in the agent context during `/chat`.
- **FR-008**: System MUST emit a trace event `{ type: "summarize", content: summary, timestamp }` whenever summarization occurs.
- **FR-009**: System MUST support fake/mock LLMs for deterministic unit and integration testing.

---

## Key Entities

- **ConversationSummary**:
  - `conversationId`: Unique identifier for the conversation.
  - `summary`: Consolidated summary text (~150 tokens) containing decisions, facts, and open items.
  - `lastSummarizedMessageId`: ID of the latest message incorporated into the summary.
  - `updatedAt`: ISO timestamp of the last summary update.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In any conversation of arbitrary length, the active raw message history sent to the LLM never exceeds 8 messages.
- **SC-002**: Summarization triggers exactly once per block of 8 evicted messages (e.g. at 16, 24, 32 messages), with 0 redundant executions on intervening requests.
- **SC-003**: Summary length stabilizes at approximately 150 tokens (between 100 and 200 tokens) even across multiple successive rolling consolidations.
- **SC-004**: Trace event `"summarize"` is emitted if and only if summarization occurred during that turn.
- **SC-005**: 100% of unit and integration tests pass with fake LLM verification.
