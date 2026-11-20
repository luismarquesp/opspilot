# Quickstart: Semantic Memory Store & Context Recall

**Feature**: `008-semantic-memory` | **Date**: 2026-09-30

---

## Prerequisites

- Node.js 22 LTS
- `@huggingface/transformers` installed (`npm install`)
- `npm run typecheck` passes cleanly
- `npm test` passes

---

## Validation Scenarios

### 1. Store Unit Tests (`remember`, `recall`, `forget`, deduplication)

Run memory store unit tests using `:memory:` SQLite:

```bash
node --import tsx --test "src/memory/memory-store.test.ts"
```

**Expected**:
- `remember(userId, fact)` stores unique facts and returns assigned `id`.
- Duplicate check: Storing a fact with > 0.92 similarity returns `{ stored: false }` and does not insert a new row.
- `recall(userId, query)` returns top-3 scored memories with scores $\ge 0.3$.
- `recall` retrieves facts even when query and fact have 0 common words (e.g. "felinos" matching "gatos").
- `forget(userId, id)` permanently deletes the memory for that user.
- Strict isolation: User A cannot see or delete User B's memories.

---

### 2. HTTP Integration Test (`POST /chat` with `userId`)

Run chat HTTP integration tests:

```bash
node --import tsx --test "src/http/chat.test.ts"
```

**Expected**:
- `POST /chat` without `userId` continues to function normally (backward compatible).
- `POST /chat` with `userId` queries `memoryStore.recall()` and injects recalled facts into agent context.
- Agent answer incorporates the recalled memory fact.

---

### 3. Full Suite & Typecheck

```bash
npm run typecheck
npm test
```

**Expected**:
- All tests pass with zero errors.
- Strict TypeScript ESM compiles cleanly without `any` violations.
