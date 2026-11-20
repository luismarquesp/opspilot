# API Contract: POST /chat (Multi-Turn)

**Feature**: 007-persistent-conversation | **Date**: 2026-09-29

---

## Endpoint

```
POST /chat
Content-Type: application/json
```

## Request Body

| Field            | Type    | Required | Default   | Description                                                      |
|------------------|---------|----------|-----------|------------------------------------------------------------------|
| `message`        | string  | ✅       | —         | User's operational query. Trimmed; must be non-empty after trim. |
| `strategy`       | string  | ❌       | `"react"` | Reasoning strategy name from registry.                           |
| `reflect`        | boolean | ❌       | `false`   | Enable self-critique reflection layer.                           |
| `conversationId` | string  | ❌       | —         | Conversation ID to continue. Omit to start a new conversation.   |

### Example: New Conversation

```json
{
  "message": "What alerts are currently firing?"
}
```

### Example: Continue Conversation

```json
{
  "message": "Now check the payment-api runbook",
  "conversationId": "conv-m1a2b3c4-f9e8"
}
```

---

## Response Body (200 OK)

| Field                      | Type     | Description                                                   |
|----------------------------|----------|---------------------------------------------------------------|
| `conversationId`           | string   | Conversation identifier (generated or echoed from request).   |
| `answer`                   | string   | Agent's final answer text.                                    |
| `trace`                    | array    | Ordered array of trace events (thought, action, observation, answer, etc.). |
| `metrics.llmCalls`         | integer  | Number of LLM invocations during execution.                  |
| `metrics.latencyMs`        | integer  | Total execution wall-clock time in milliseconds.              |
| `metrics.historyMessages`  | integer  | Count of prior messages injected into prompt context (0–12).  |

### Example: First Turn Response

```json
{
  "conversationId": "conv-m1a2b3c4-f9e8",
  "answer": "There are 3 firing alerts: ...",
  "trace": [
    { "type": "thought", "content": "Checking alerts", "timestamp": 1000 },
    { "type": "action", "tool": "list_alerts", "args": { "status": "firing" }, "content": "Call list_alerts", "timestamp": 1001 },
    { "type": "observation", "content": "[...]", "timestamp": 1002 },
    { "type": "answer", "content": "There are 3 firing alerts: ...", "timestamp": 1003 }
  ],
  "metrics": {
    "llmCalls": 2,
    "latencyMs": 850,
    "historyMessages": 0
  }
}
```

### Example: Follow-Up Turn Response

```json
{
  "conversationId": "conv-m1a2b3c4-f9e8",
  "answer": "The payment-api runbook recommends: ...",
  "trace": [ "..." ],
  "metrics": {
    "llmCalls": 2,
    "latencyMs": 620,
    "historyMessages": 2
  }
}
```

---

## Error Responses

### 400 Bad Request — Validation Error

Returned when request body fails Zod schema validation (missing/empty `message`, wrong types, etc.).

```json
{
  "error": "validation_error",
  "issues": [
    { "path": ["message"], "message": "String must contain at least 1 character(s)" }
  ]
}
```

### 422 Unprocessable Entity — Unknown Strategy

Returned when the requested `strategy` is not found in the registry.

```json
{
  "error": "unknown_strategy",
  "strategy": "nonexistent"
}
```

### 504 Gateway Timeout

Returned when strategy execution exceeds the 180-second timeout.

```json
{
  "error": "gateway_timeout"
}
```

### 500 Internal Server Error

Returned on unhandled strategy runtime errors.

```json
{
  "error": "internal_error"
}
```

---

## Backward Compatibility

- `conversationId` is **optional** in the request. Existing clients that omit it will receive a new `conversationId` in the response (single-turn mode).
- `metrics.historyMessages` is a **new field** in the response. Existing clients that don't consume it are unaffected (additive change).
- All existing error codes and response fields remain unchanged.
