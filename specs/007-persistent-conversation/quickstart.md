# Quickstart: Persistent Conversation Store and Multi-Turn Chat

**Feature**: 007-persistent-conversation | **Date**: 2026-09-29

---

## Prerequisites

- Node.js 22 LTS installed
- `npm install` completed
- `npm run typecheck` passes
- `npm test` passes (existing suite)

---

## Validation Scenarios

### 1. Store Unit Tests

Run conversation store tests in isolation to verify `create`, `append`, and `lastMessages`:

```bash
node --import tsx --test "src/store/conversation-store.test.ts"
```

**Expected**:
- `create()` returns a string matching `conv-` prefix
- `append()` persists messages, retrievable via `lastMessages()`
- `lastMessages(convId, 12)` returns at most 12 messages in chronological order (oldest → newest)
- Messages from different `conversationId`s are isolated
- `lastMessages()` on a non-existent conversation returns an empty array

### 2. HTTP Integration Tests

Run the full chat integration test suite to validate multi-turn HTTP flow:

```bash
node --import tsx --test "src/http/chat.test.ts"
```

**Expected** (new tests added to existing suite):
- `POST /chat` without `conversationId` → 200 with `conversationId` in response and `metrics.historyMessages: 0`
- `POST /chat` with existing `conversationId` → 200 with same `conversationId` echoed and `metrics.historyMessages > 0`
- Multi-turn sequence: send 3 turns → verify `historyMessages` increments (`0`, `2`, `4`)
- Sliding window: 14+ messages in store → `metrics.historyMessages` capped at `12`
- Validation: `conversationId` does not bypass `message` validation (empty message + valid convId → 400)

### 3. Full Suite Validation

Run the complete test suite and type checker:

```bash
npm run typecheck
npm test
```

**Expected**: Zero errors on both commands.

### 4. Manual Smoke Test (optional)

Start the dev server and test multi-turn chat via curl:

```bash
npm run dev
```

```bash
# Turn 1: new conversation
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What alerts are firing?"}' | jq .

# Note the conversationId from the response, then:
# Turn 2: continue conversation
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Open an incident for the most critical one", "conversationId": "<ID_FROM_TURN_1>"}' | jq .
```

**Expected**:
- Turn 1: response includes a `conversationId` and `metrics.historyMessages: 0`
- Turn 2: response echoes same `conversationId`, `metrics.historyMessages: 2` (user + assistant from turn 1), and agent answer reflects awareness of the prior turn's context

---

## Key Validation Criteria

| Criteria | How to verify | Reference |
|----------|---------------|-----------|
| `conversationId` always in response | Check 200 responses from all `/chat` calls | [chat-api contract](./contracts/chat-api.md) |
| `historyMessages` accuracy | Assert against known message counts in tests | [data-model](./data-model.md) |
| 12-message cap | Populate 14+ messages, assert `historyMessages ≤ 12` | [spec FR-010](./spec.md) |
| Backward compatibility | Existing `chat.test.ts` tests still pass unchanged | [chat-api contract](./contracts/chat-api.md) |
| Store isolation | Test 2 conversations don't leak messages | [data-model](./data-model.md) |
