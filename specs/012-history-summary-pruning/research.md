# Technical Research: History Pruning & Rolling Summary

**Feature**: `012-history-summary-pruning` | **Date**: 2026-10-03

---

## 1. Sliding Window & Pruning Trigger Algorithm

### Decision
Set the active conversational raw window to **8 messages**. Identify unsummarized evicted messages using a monotonic boundary check:
1. Total messages in conversation $N$. If $N \le 8$, 0 messages have been evicted.
2. If $N > 8$, the 8 most recent messages form the active window. The 8th message from the end has ID $M_{\text{cutoff}}$.
3. Evicted candidate messages are all messages with `id < M_cutoff`.
4. A conversation summary tracks `last_summarized_message_id` (initialized to 0).
5. Unsummarized evicted messages are:
   ```sql
   SELECT id, conversation_id, role, content, created_at
   FROM messages
   WHERE conversation_id = ?
     AND id > ?
     AND id < ?
   ORDER BY id ASC
   ```
   where `id > last_summarized_message_id` and `id < M_cutoff`.
6. **Trigger Condition**:
   - If `unsummarized.length >= 8`: take the chunk of 8 messages (`unsummarized.slice(0, 8)`), invoke the summarizer with `(previousSummary, chunk)`, persist the consolidated summary in `conversation_summaries` setting `last_summarized_message_id = chunk[chunk.length - 1].id`, and record a `"summarize"` trace event.
   - If `unsummarized.length < 8` (i.e. 0 to 7 messages): do **not** run summarization. Retain existing summary.
   - This strictly fulfills: *"refeito só quando 8 novas mensagens saem da janela, nunca a cada request"*.

### Rationale
- Completely eliminates per-request LLM summarization overhead and costs.
- Ensures summarization occurs in predictable, discrete batches of 8 messages (e.g. at 16 messages, 24 messages, 32 messages...).
- Safe against concurrent requests and server restarts because `last_summarized_message_id` is durably stored in SQLite.

---

## 2. Table `conversation_summaries` Schema

### Decision
Add the table to `SqliteConversationStore` DDL:
```sql
CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id             TEXT    PRIMARY KEY,
  summary                     TEXT    NOT NULL,
  last_summarized_message_id  INTEGER NOT NULL,
  updated_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

### Rationale
- Normalized 1:1 relationship with conversations.
- Fast index lookup by primary key (`conversation_id`).
- Durability across server restarts, aligning with `SqliteConversationStore`.

---

## 3. Summarization Prompt & Merging Strategy

### Decision
Design a dedicated system prompt in `src/context/summarizer.ts` with explicit focus on operational retention:
- Target length: ~150 tokens.
- Mandatory categories preserved:
  1. **Decisões tomadas**: Actions approved, incident mitigations, runbooks executed, services restarted.
  2. **Fatos operacionais**: Errors identified, root causes found, thresholds breached.
  3. **Pendências em aberto**: Unresolved alerts, ongoing investigations, unverified hypotheses.
- When an existing summary is provided, the prompt instructs the model to merge the existing summary with the new evicted chunk without repeating resolved details.

### Rationale
- Pure focus on operational utility. Discards conversational pleasantries ("olá", "ok", "obrigado").
- Rolling compaction prevents the summary from growing linearly: it stays bounded at ~150 tokens.

---

## 4. Trace Event `"summarize"`

### Decision
Extend `TraceEventTypeSchema` in `src/agents/types.ts`:
```typescript
export const TraceEventTypeSchema = z.enum([
  "thought",
  "action",
  "observation",
  "plan",
  "critique",
  "answer",
  "summarize",
]);
```
When summarization executes, inject `{ type: "summarize", content: newSummary, timestamp: Date.now() }` into the response trace.

### Rationale
- Conforms to the MVC boundary and existing Zod schemas.
- Full auditability: operators and automated tests can verify exactly when summarization was triggered.

---

## 5. Fake Testing Strategy

### Decision
Support dependency injection of a custom model/summarizer function:
```typescript
export interface IConversationSummarizer {
  summarize(previousSummary: string | null, messages: ConversationMessage[]): Promise<string>;
}
```
- In unit tests, inject a `mockSummarizer` that records invocations and returns a deterministic string.
- Assert that sending 1..15 messages results in 0 summarizer calls.
- Assert that sending the 16th message results in exactly 1 call.
- Assert that sending messages 17..23 results in 0 additional calls.
- Assert that sending the 24th message results in call #2 receiving the previous summary.
