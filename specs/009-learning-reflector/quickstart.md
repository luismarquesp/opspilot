# Quickstart: Learning Reflector & Memory Distillation

**Feature**: `009-learning-reflector` | **Date**: 2026-09-30

---

## Prerequisites

- Node.js 22 LTS
- `npm run typecheck` passes
- `npm test` passes

---

## Validation Scenarios

### 1. Reflector Unit Tests (Distillation Rules & Negative Constraints)

```bash
node --import tsx --test "src/memory/reflector.test.ts"
```

**Expected**:
- Durable statements (e.g. "Sou responsável pela API de pagamentos") evaluate to `hasLearning: true` with a clear, concise distilled fact.
- Punctual/ephemeral commands (e.g. "Abra um incidente para auth", "Liste alertas disparando") evaluate to `hasLearning: false`.
- Secret-bearing messages evaluate to `hasLearning: false` and persist no credential.
- If `hasLearning: true`, `memoryStore.remember()` is called.

---

### 2. Tool Unit Tests (`forget_preference`)

```bash
node --import tsx --test "src/agents/tools.test.ts"
```

**Expected**:
- Calling `forget_preference` with matching description or ID deletes the memory and returns success.
- Non-matching query returns a clean informative message without crashing.

---

### 3. HTTP Integration Test (`POST /chat` with Background Reflection)

```bash
node --import tsx --test "src/http/chat.test.ts"
```

**Expected**:
- `POST /chat` with `userId` and a role declaration responds immediately with 200.
- Asynchronous task calls `reflector.reflect` without increasing response latency.
- Subsequent queries for that `userId` find the distilled memory via `recall`.
