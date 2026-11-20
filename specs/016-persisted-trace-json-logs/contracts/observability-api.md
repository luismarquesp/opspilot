# Interface Contract: Persisted Trace & Structured JSON Logs

**Feature Branch**: `016-persisted-trace-json-logs`  
**Date**: 2026-11-17  

---

## 1. Endpoint: `POST /chat` (Correlation Extension)

### Request Headers
| Header | Required | Behavior |
|---|---|---|
| `X-Request-Id` | No | If provided and non-empty after trimming, adopted as `requestId`. If omitted or blank, a UUID v4 is generated automatically. |

### Response Headers (All Responses)
| Header | Example | Description |
|---|---|---|
| `X-Request-Id` | `7b2e6f1c-4c31-4f9e-b1ab-8e92f0123456` | Exact correlation ID assigned to the request. |

### Response `200 OK` Body
```json
{
  "requestId": "7b2e6f1c-4c31-4f9e-b1ab-8e92f0123456",
  "conversationId": "conv-a1b2c3d4-e5f6",
  "answer": "Existem 3 alertas firing no momento.",
  "selectedRoute": "react",
  "routeReason": "Direct status query",
  "trace": [
    {
      "type": "route",
      "node": "router",
      "route": "react",
      "reason": "Direct status query",
      "content": "Rota selecionada: [REACT] - Direct status query",
      "timestamp": 1763375190000
    },
    {
      "type": "action",
      "node": "react",
      "tool": "list_alerts",
      "args": { "status": "firing" },
      "content": "Chamando ferramenta list_alerts",
      "timestamp": 1763375190150
    },
    {
      "type": "observation",
      "node": "react",
      "content": "[{\"id\":\"alt-001\",...}]",
      "timestamp": 1763375190180
    },
    {
      "type": "answer",
      "node": "response",
      "content": "Existem 3 alertas firing no momento.",
      "timestamp": 1763375190500
    }
  ],
  "metrics": {
    "llmCalls": 2,
    "latencyMs": 500,
    "historyMessages": 0,
    "promptTokens": 240,
    "completionTokens": 60,
    "totalTokens": 300,
    "modelUsed": "openai/gpt-4o-mini",
    "contextBreakdown": {
      "system": 120,
      "history": 0,
      "summary": 0,
      "memories": 0,
      "userMessage": 10,
      "totalEstimated": 130
    }
  }
}
```

---

## 2. Endpoint: `GET /requests/:id`

Retrieves a persisted request record, its execution metrics, and its chronologically ordered trace events (`seq ASC`).

### Path Parameters
| Parameter | Type | Validation | Description |
|---|---|---|---|
| `id` | `string` | Non-empty trimmed string | The `requestId` returned by `POST /chat`. |

### Response `200 OK`
```json
{
  "id": "7b2e6f1c-4c31-4f9e-b1ab-8e92f0123456",
  "requestId": "7b2e6f1c-4c31-4f9e-b1ab-8e92f0123456",
  "conversationId": "conv-a1b2c3d4-e5f6",
  "strategy": "react",
  "status": "completed",
  "createdAt": "2026-11-17T10:26:30.500Z",
  "metrics": {
    "llmCalls": 2,
    "latencyMs": 500,
    "historyMessages": 0,
    "promptTokens": 240,
    "completionTokens": 60,
    "totalTokens": 300,
    "modelUsed": "openai/gpt-4o-mini",
    "contextBreakdown": {
      "system": 120,
      "history": 0,
      "summary": 0,
      "memories": 0,
      "userMessage": 10,
      "totalEstimated": 130
    }
  },
  "trace": [
    {
      "type": "route",
      "node": "router",
      "route": "react",
      "reason": "Direct status query",
      "content": "Rota selecionada: [REACT] - Direct status query",
      "timestamp": 1763375190000
    },
    {
      "type": "action",
      "node": "react",
      "tool": "list_alerts",
      "args": { "status": "firing" },
      "content": "Chamando ferramenta list_alerts",
      "timestamp": 1763375190150
    },
    {
      "type": "observation",
      "node": "react",
      "content": "[{\"id\":\"alt-001\",...}]",
      "timestamp": 1763375190180
    },
    {
      "type": "answer",
      "node": "response",
      "content": "Existem 3 alertas firing no momento.",
      "timestamp": 1763375190500
    }
  ]
}
```

### Response `404 Not Found`
Returned when no record exists in `requests` matching `:id`:
```json
{
  "error": "request_not_found",
  "requestId": "non-existent-id"
}
```

---

## 3. Structured NDJSON Log Output (`src/obs/logger.ts`)

Each event emits **exactly 1 single-line JSON string** (no embedded unescaped newlines) containing metadata only. Raw `content`, `message`, `answer`, and `args` values MUST NOT appear.

### Example: `trace_event` Lines (1 Line Per Trace Event)
```json
{"timestamp":"2026-11-17T10:26:30.501Z","level":"info","event":"trace_event","requestId":"7b2e6f1c-4c31-4f9e-b1ab-8e92f0123456","conversationId":"conv-a1b2c3d4-e5f6","seq":0,"type":"route","node":"router","contentLength":46,"route":"react"}
{"timestamp":"2026-11-17T10:26:30.501Z","level":"info","event":"trace_event","requestId":"7b2e6f1c-4c31-4f9e-b1ab-8e92f0123456","conversationId":"conv-a1b2c3d4-e5f6","seq":1,"type":"action","node":"react","contentLength":31,"tool":"list_alerts","argKeys":["status"]}
{"timestamp":"2026-11-17T10:26:30.501Z","level":"info","event":"trace_event","requestId":"7b2e6f1c-4c31-4f9e-b1ab-8e92f0123456","conversationId":"conv-a1b2c3d4-e5f6","seq":2,"type":"observation","node":"react","contentLength":24}
{"timestamp":"2026-11-17T10:26:30.501Z","level":"info","event":"trace_event","requestId":"7b2e6f1c-4c31-4f9e-b1ab-8e92f0123456","conversationId":"conv-a1b2c3d4-e5f6","seq":3,"type":"answer","node":"response","contentLength":36}
```

### Example: `request_completed` Line
```json
{"timestamp":"2026-11-17T10:26:30.502Z","level":"info","event":"request_completed","requestId":"7b2e6f1c-4c31-4f9e-b1ab-8e92f0123456","conversationId":"conv-a1b2c3d4-e5f6","strategy":"react","statusCode":200,"latencyMs":500,"llmCalls":2,"promptTokens":240,"completionTokens":60,"totalTokens":300,"historyMessages":0,"modelUsed":"openai/gpt-4o-mini","traceCount":4}
```

### Example: `request_failed` Line
```json
{"timestamp":"2026-11-17T10:26:30.502Z","level":"error","event":"request_failed","requestId":"7b2e6f1c-4c31-4f9e-b1ab-8e92f0123456","conversationId":"conv-a1b2c3d4-e5f6","statusCode":503,"errorCode":"model_unavailable"}
```
