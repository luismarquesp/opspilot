# Quickstart: History Pruning & Rolling Summary

**Feature**: `012-history-summary-pruning` | **Date**: 2026-10-03

---

## 1. Store Unit Tests (Table & Eviction Logic)

```bash
node --import tsx --test "src/store/conversation-store.test.ts"
```

**Expected**:
- Table `conversation_summaries` is initialized.
- `getSummary` returns `null` for new conversations.
- `getEvictedUnsummarizedMessages(convId, 8)` returns empty when message count $\le 8$.
- When 16 messages are added, returns the first 8 messages.
- After calling `setSummary(convId, summary, lastId)`, `getEvictedUnsummarizedMessages` excludes already summarized messages.

---

## 2. Summarizer Unit Tests (Prompt & Fake LLM)

```bash
node --import tsx --test "src/context/summarizer.test.ts"
```

**Expected**:
- Distills decisions, facts, and open pending items into ~150 tokens.
- Merges with previous summary correctly.
- Handles LLM failures gracefully.

---

## 3. HTTP Integration Tests (Event `"summarize"` & Context Injection)

```bash
node --import tsx --test "src/http/chat.test.ts"
```

**Expected**:
- Sending 15 messages produces 0 summarize events.
- Sending message 16 triggers summarization and emits event `"summarize"` in `res.body.trace`.
- Sending message 17 retains existing summary without emitting `"summarize"`.
- Summary is injected ahead of raw messages in the agent prompt context.
