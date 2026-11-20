# Data Model: HTTP Chat API Endpoint
**Feature**: `003-chat-api-endpoint` | **Phase**: 1 — Design & Contracts
**Date**: 2026-09-15

---

## Boundary Entities

These entities live at the HTTP boundary layer (`src/http/schemas.ts`) and are validated with Zod.

---

### ChatRequestBody

Represents the JSON body of a `POST /chat` request.

| Field | Type | Required | Constraints | Default |
|---|---|:---:|---|---|
| `message` | `string` | ✅ | Non-empty after trim (min 1 char) | — |
| `strategy` | `string` | ❌ | Any string; validated against registry at runtime | `"react"` |
| `reflect` | `boolean` | ❌ | Boolean — enables reflection wrapper | `false` |

**Validation rules**:
- `message` trimmed of whitespace before length check; blank strings are rejected with HTTP 400.
- `strategy` is syntactically any string but semantically validated against the registry; unknown values yield HTTP 422.
- `reflect` must be a JSON boolean if provided; string `"true"` is not accepted.

---

### ChatResponseBody

Represents the successful HTTP 200 JSON response.

| Field | Type | Description |
|---|---|---|
| `answer` | `string` | Final textual answer produced by the reasoning strategy |
| `trace` | `TraceEvent[]` | Ordered list of trace events emitted during strategy execution |
| `metrics` | `StrategyMetrics` | Aggregate execution telemetry |

**`StrategyMetrics`** (re-uses existing domain type from `src/agents/types.ts`):

| Field | Type | Description |
|---|---|---|
| `llmCalls` | `number` (int ≥ 0) | Total LLM invocations including critic calls |
| `latencyMs` | `number` (int ≥ 0) | Wall-clock ms from request acceptance to response |

**`TraceEvent`** — discriminated union (re-uses existing `TraceEventSchema`):

| `type` | Extra fields | Description |
|---|---|---|
| `"thought"` | — | Internal reasoning step |
| `"action"` | `tool: string`, `args: Record<string, unknown>` | Tool invocation |
| `"observation"` | — | Tool result |
| `"plan"` | — | Plan produced by plan-and-execute strategy |
| `"critique"` | — | Reflection critic evaluation result |
| `"answer"` | — | Final answer event |

---

### ValidationErrorResponse (HTTP 400)

| Field | Type | Description |
|---|---|---|
| `error` | `"validation_error"` | Discriminant literal |
| `issues` | `ZodIssue[]` | Array of Zod validation issue objects (path + message) |

---

### UnknownStrategyResponse (HTTP 422)

| Field | Type | Description |
|---|---|---|
| `error` | `"unknown_strategy"` | Discriminant literal |
| `strategy` | `string` | The strategy name that was not found in the registry |

---

### TimeoutErrorResponse (HTTP 504)

| Field | Type | Description |
|---|---|---|
| `error` | `"gateway_timeout"` | Discriminant literal |

---

### InternalErrorResponse (HTTP 500)

| Field | Type | Description |
|---|---|---|
| `error` | `"internal_error"` | Discriminant literal |

---

## Domain Entities (existing — unchanged)

These entities are defined in `src/agents/types.ts` and consumed by the HTTP layer but not modified by this feature:

- **`ReasoningStrategy`** — interface `{ name: string; run(input, options?): Promise<StrategyResult> }`
- **`StrategyResult`** — `{ answer: string; trace: TraceEvent[]; metrics: StrategyMetrics }`
- **`CritiqueVerdict`** — `{ approved: boolean; feedback: string }` (used internally by reflection)
- **`ReflectionOptions`** — `{ maxReflection: number; criticPrompt?: string; criticModel?: any }`

---

## Registry Entity

### StrategyRegistry

A plain `Record<string, ReasoningStrategy>` mapping strategy name strings to their implementations. Defined and exported from `src/agents/index.ts`.

| Name Key | Strategy | Notes |
|---|---|---|
| `"react"` | `reactStrategy` | Singleton imported from `react.ts` |
| `"plan-and-execute"` | `planAndExecuteStrategy` | Singleton imported from `plan-and-execute.ts` |

The `resolveStrategy(name, reflect)` pure function:
- Returns `undefined` if the name is not in the registry.
- Returns the base strategy if `reflect` is falsy.
- Returns `withReflection(strategy)` if `reflect` is truthy.

**Note**: The registry intentionally does NOT include pre-built `reflect:*` keys. Reflection is always applied dynamically by `resolveStrategy`. This avoids double-wrapping and keeps the registry minimal.
