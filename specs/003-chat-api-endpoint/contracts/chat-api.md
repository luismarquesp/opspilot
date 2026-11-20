# POST /chat — HTTP API Contract

**Feature**: `003-chat-api-endpoint`
**Version**: 1.0.0
**Base URL**: `http://localhost:{PORT}` (PORT env var, default 3000)

---

## Endpoint

### `POST /chat`

Submits an operational inquiry to the OpsPilot reasoning agent and returns the generated answer with full execution trace and metrics.

---

## Request

### Headers

| Header | Value | Required |
|---|---|:---:|
| `Content-Type` | `application/json` | ✅ |

### Body

```json
{
  "message": "string (required, non-empty)",
  "strategy": "string (optional, default: \"react\")",
  "reflect": "boolean (optional, default: false)"
}
```

**Field definitions**:

| Field | Type | Required | Description |
|---|---|:---:|---|
| `message` | `string` | ✅ | The operational question or incident description. Must not be blank. |
| `strategy` | `string` | ❌ | Name of the reasoning strategy to use. Defaults to `"react"` if omitted. Registered values: `"react"`, `"plan-and-execute"`. |
| `reflect` | `boolean` | ❌ | When `true`, wraps the resolved strategy with the self-critique reflection layer. Defaults to `false`. |

**Example (minimal)**:
```json
{ "message": "Summarize open critical alerts" }
```

**Example (full)**:
```json
{
  "message": "Investigate memory leak on payment-api",
  "strategy": "plan-and-execute",
  "reflect": true
}
```

---

## Responses

### 200 OK — Success

The strategy completed within the time limit.

```json
{
  "answer": "string",
  "trace": [
    {
      "type": "thought | action | observation | plan | critique | answer",
      "content": "string",
      "timestamp": 1726400000000
    }
  ],
  "metrics": {
    "llmCalls": 3,
    "latencyMs": 4210
  }
}
```

`action` trace events include additional fields:
```json
{
  "type": "action",
  "tool": "list_alerts",
  "args": { "status": "firing" },
  "content": "list_alerts",
  "timestamp": 1726400000001
}
```

---

### 400 Bad Request — Validation Error

The request body failed schema validation.

```json
{
  "error": "validation_error",
  "issues": [
    {
      "path": ["message"],
      "message": "String must contain at least 1 character(s)"
    }
  ]
}
```

**Triggered by**:
- Missing `message` field
- `message` is empty or whitespace-only
- `reflect` is not a boolean
- Unexpected type on any field

---

### 422 Unprocessable Entity — Unknown Strategy

The `strategy` value was syntactically valid but not found in the registry.

```json
{
  "error": "unknown_strategy",
  "strategy": "gpt-turbo-mode"
}
```

**Triggered by**: `strategy` field contains a name not registered in the strategy registry.

---

### 504 Gateway Timeout — Execution Timeout

The strategy did not complete within 180 seconds.

```json
{
  "error": "gateway_timeout"
}
```

---

### 500 Internal Server Error — Unexpected Error

An unhandled error occurred during strategy execution.

```json
{
  "error": "internal_error"
}
```

---

## Registered Strategies

| Strategy Name | Description |
|---|---|
| `react` | Default single-pass ReAct agent with operational tools |
| `plan-and-execute` | Multi-phase plan-then-execute agent |

Any strategy can be combined with `"reflect": true` to enable automatic self-critique.

---

## Timeout Behaviour

- Server-side timeout: **180 seconds** per request.
- If the agent execution exceeds this duration, the connection returns **HTTP 504**.
- The timeout applies to the total execution including all reflection iterations.
