# Quickstart: HTTP Chat API Endpoint
**Feature**: `003-chat-api-endpoint`
**Date**: 2026-09-15

---

## Prerequisites

- Node.js 22 LTS installed
- `npm install` completed in repository root
- `.env` file present with valid `OPENROUTER_API_KEY` (for live runs; not needed for offline tests)
- MySQL running if using persistent storage (not required for `DB_DIALECT=memory`)

---

## 1. Offline Integration Tests (No Network)

Run the full test suite — integration tests for `/chat` use deterministic fake strategies and make zero network calls:

```bash
npm test
```

**Expected output**: All test files pass, including `src/http/chat.test.ts`, with assertions covering:
- `POST /chat` with valid body → HTTP 200 with `answer`, `trace`, `metrics`
- `POST /chat` with missing `message` → HTTP 400 with `issues`
- `POST /chat` with empty `message` → HTTP 400 with `issues`
- `POST /chat` with unknown strategy → HTTP 422 with `strategy` field
- `POST /chat` with a slow strategy exceeding the injected timeout → HTTP 504
- `POST /chat` with `reflect: true` → HTTP 200 with `critique` event in trace

**Expected total test time**: Under 10 seconds.

---

## 2. TypeScript Type Check

```bash
npm run typecheck
```

**Expected output**: No TypeScript errors. Zero `any`-escape regressions.

---

## 3. Start the Development Server (Live)

```bash
npm run dev
```

The server starts on `http://localhost:3000` (or the `PORT` env variable value).

**Expected log line**:
```
[OpsPilot] HTTP server listening on port 3000
```

---

## 4. Send a Chat Request (Live)

**Minimal request** (default `react` strategy, no reflection):

```bash
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "List all firing alerts"}' | jq .
```

**With strategy and reflection**:

```bash
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Investigate memory alerts", "strategy": "plan-and-execute", "reflect": true}' | jq .
```

**Expected 200 response shape**:
```json
{
  "answer": "...",
  "trace": [
    { "type": "thought", "content": "...", "timestamp": 1726400000000 },
    { "type": "action", "tool": "list_alerts", "args": {}, "content": "list_alerts", "timestamp": 1726400000001 },
    { "type": "observation", "content": "...", "timestamp": 1726400000002 },
    { "type": "answer", "content": "...", "timestamp": 1726400000003 }
  ],
  "metrics": { "llmCalls": 2, "latencyMs": 3210 }
}
```

---

## 5. Validate Error Scenarios

**Missing message → 400**:
```bash
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
# Expected: { "error": "validation_error", "issues": [...] }
```

**Unknown strategy → 422**:
```bash
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hello", "strategy": "gpt-X"}' | jq .
# Expected: { "error": "unknown_strategy", "strategy": "gpt-X" }
```

---

## 6. Verify Artifacts

After implementing the feature, these files must exist and pass all gates:

| Artifact | Purpose |
|---|---|
| `src/agents/index.ts` | Strategy registry + `resolveStrategy` pure function |
| `src/http/schemas.ts` | Zod boundary schemas for request/response |
| `src/http/chat.controller.ts` | Pure `chatHandler` request handler |
| `src/http/server.ts` | `createApp()` Express factory + route registration |
| `src/http/index.ts` | HTTP server startup entrypoint |
| `src/http/chat.test.ts` | Integration tests (offline, node:test) |

---

## References

- [API Contract](./contracts/chat-api.md) — Full request/response schema documentation
- [Data Model](./data-model.md) — Entity definitions and validation rules
- [Research](./research.md) — All architectural decisions and rationale
