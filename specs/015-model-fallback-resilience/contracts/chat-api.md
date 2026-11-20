# Interface Contract: Resilient Chat API & Telemetry

**Feature Branch**: `015-model-fallback-resilience`  
**Date**: 2026-10-21  

## Endpoint: `POST /chat`

### Request Body
```json
{
  "message": "Quais serviços estão instáveis?",
  "strategy": "react"
}
```

---

### Response 200 OK (With Model Fallback)

Returned when a primary model error triggered automatic fallback to a secondary model:

```json
{
  "conversationId": "conv-a1b2c3d4-e5f6-7890",
  "answer": "Identifiquei 2 alertas firing no serviço payment-api.",
  "trace": [
    {
      "type": "route",
      "node": "router",
      "route": "react",
      "reason": "Direct alert inspection",
      "timestamp": 1729500000000
    },
    {
      "type": "fallback",
      "node": "react",
      "fromModel": "anthropic/claude-3.5-sonnet",
      "toModel": "openai/gpt-4o-mini",
      "reason": "429 Rate limit exceeded on primary model",
      "content": "Switching model from anthropic/claude-3.5-sonnet to openai/gpt-4o-mini due to: 429 Rate limit exceeded",
      "timestamp": 1729500000800
    },
    {
      "type": "thought",
      "node": "react",
      "content": "Consultando ferramentas de alerta...",
      "timestamp": 1729500001000
    },
    {
      "type": "answer",
      "node": "response",
      "content": "Identifiquei 2 alertas firing no serviço payment-api.",
      "timestamp": 1729500001500
    }
  ],
  "metrics": {
    "llmCalls": 2,
    "latencyMs": 1500,
    "historyMessages": 0,
    "promptTokens": 320,
    "completionTokens": 95,
    "totalTokens": 415,
    "modelUsed": "openai/gpt-4o-mini"
  }
}
```

---

### Response 200 OK (Normal Primary Model Execution)

```json
{
  "conversationId": "conv-a1b2c3d4-e5f6-7890",
  "answer": "Todos os serviços estão operando normalmente.",
  "trace": [
    {
      "type": "route",
      "node": "router",
      "route": "react",
      "reason": "Direct alert query",
      "timestamp": 1729500000000
    },
    {
      "type": "thought",
      "node": "react",
      "content": "Verificando alertas ativos...",
      "timestamp": 1729500000200
    },
    {
      "type": "answer",
      "node": "response",
      "content": "Todos os serviços estão operando normalmente.",
      "timestamp": 1729500000600
    }
  ],
  "metrics": {
    "llmCalls": 1,
    "latencyMs": 600,
    "historyMessages": 0,
    "promptTokens": 180,
    "completionTokens": 40,
    "totalTokens": 220,
    "modelUsed": "anthropic/claude-3.5-sonnet"
  }
}
```

---

### Response 503 Service Unavailable (All Models Exhausted)

Returned when both primary and all configured fallback models fail to respond:

```json
{
  "error": "model_unavailable",
  "message": "All configured models (primary and fallbacks) failed to respond"
}
```
