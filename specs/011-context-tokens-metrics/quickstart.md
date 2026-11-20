# Quickstart: Context Token Measurement & Metrics Breakdown

**Feature**: `011-context-tokens-metrics` | **Date**: 2026-10-03

---

## 1. Unit Tests (Token Estimation & Extraction)

```bash
node --import tsx --test "src/context/tokens.test.ts"
```

**Expected**:
- `estimateTokens` computes character/4 heuristic correctly.
- `extractTokenUsage` extracts and sums `usage_metadata` and `response_metadata`.
- `estimateContextBreakdown` correctly calculates partitioned estimates.

---

## 2. HTTP Integration Tests (`POST /chat`)

```bash
node --import tsx --test "src/http/chat.test.ts"
```

**Expected**:
- `POST /chat` returns `metrics.promptTokens` and `metrics.contextBreakdown`.
- In multi-turn chat, `contextBreakdown.history` increases across turns.

---

## 3. Interactive Multi-Turn CLI Script (`conversa-long.sh`)

Ensure the server is running (`npm run dev`):

```bash
bash ./conversa-long.sh
```

**Expected**:
- Sends consecutive turns reusing the same `conversationId`.
- Logs prompt tokens and history message counts for each turn.
