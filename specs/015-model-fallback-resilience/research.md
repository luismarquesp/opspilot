# Research: Model Fallback & Retry Resilience

**Feature Branch**: `015-model-fallback-resilience`  
**Date**: 2026-10-21  

## Technical Questions & Decisions

### 1. LangChain Native `withRetry` and `withFallbacks` Orchestration

- **Context**: OpsPilot relies on `@langchain/openai` and `@langchain/core`. LangChain runnables provide native `.withRetry(...)` and `.withFallbacks(...)` methods. We need primary models to retry transient failures and failover to a list of fallback models while tracking which model ran and logging trace events.
- **Decision**: 
  - The model factory `createResilientModel(options)` creates the primary `ChatOpenAI` configured with `.withRetry({ stopAfterAttempt: 3 })`.
  - For each model identifier specified in `OPENROUTER_MODEL_FALLBACK`, a backup `ChatOpenAI` instance is created (also equipped with retry).
  - The primary model is chained with `.withFallbacks({ fallbacks: fallbackModels })`.
  - To track fallback transitions and the winning model without intrusive global state, the models are wrapped with an event-emitting runner or callback interceptor (`handleLLMError` / `handleLLMStart`) that registers `"fallback"` trace events and captures `modelUsed`.
- **Alternatives Considered**:
  - *Custom while-loop retry/fallback in controller*: Rejected because it bypasses LangGraph and LangChain's internal agent execution cycles (e.g. multi-step tool calling inside `react` or `plan-and-execute`).
  - *Hardcoding a single fallback*: Rejected because the specification requires supporting a configurable list of fallback models.

---

### 2. Configuration Parsing for `OPENROUTER_MODEL_FALLBACK`

- **Context**: In production or staging, operators may configure one or several fallback models (e.g., `openai/gpt-4o-mini`, `meta-llama/llama-3.3-70b-instruct`).
- **Decision**:
  - Add `OPENROUTER_MODEL_FALLBACK: z.string().optional()` to `EnvSchema` in `src/config/env.ts`.
  - Implement a pure parser function `parseFallbackModels(fallbackString?: string, primaryModel?: string): string[]`.
  - The parser splits on commas, strips whitespace and quotes, filters out empty strings, and deduplicates against the primary model.
- **Alternatives Considered**:
  - *JSON array string in .env*: Rejected because comma-separated lists are simpler, standard for 12-factor apps, and less prone to quoting bugs in shell and docker environments.

---

### 3. Trace Event & Node Attribution

- **Context**: The OpsPilot constitution and feature 014 require 100% of trace events to adhere to the discriminated union schema and include a mandatory `node: string` attribute.
- **Decision**:
  - Add `"fallback"` to `TraceEventTypeSchema`.
  - Define `FallbackTraceEventSchema` extending `BaseTraceEventSchema`:
    ```ts
    export const FallbackTraceEventSchema = BaseTraceEventSchema.extend({
      type: z.literal("fallback"),
      fromModel: z.string(),
      toModel: z.string(),
      reason: z.string(),
    });
    ```
  - Update `TraceEventSchema` discriminated union.
  - Update `formatTraceEvent` in `src/agents/trace.ts` to output `[FALLBACK] fromModel -> toModel (reason)`.
- **Alternatives Considered**:
  - *Logging fallbacks only via console.warn*: Rejected because API clients and audit logs need structured trace visibility inside the `/chat` response.

---

### 4. Telemetry: `metrics.modelUsed`

- **Context**: The API response must report which model generated the final answer.
- **Decision**:
  - Add `modelUsed: z.string().optional()` to `StrategyMetricsSchema` in `src/agents/types.ts`.
  - Ensure all strategy runners (`react`, `plan-and-execute`, `reflection`, `production-graph`) propagate `modelUsed` in their returned metrics.
- **Alternatives Considered**:
  - *Overwriting `OPENROUTER_MODEL` in env dynamically*: Rejected because global mutation violates pure function principles and creates concurrency race conditions across simultaneous requests.

---

### 5. Domain Error Modeling & HTTP 503 Translation

- **Context**: The OpsPilot constitution dictates that domain logic must raise explicit domain error classes and boundary controllers must translate them into standard HTTP status codes.
- **Decision**:
  - Define `ModelUnavailableError extends Error` with `{ name: "ModelUnavailableError", code: "model_unavailable", originalErrors?: unknown[] }`.
  - When primary retries and all fallback models throw errors, wrap the failure in `ModelUnavailableError`.
  - In `chat.controller.ts`, intercept `ModelUnavailableError` and return HTTP 503:
    ```json
    {
      "error": "model_unavailable",
      "message": "All configured models (primary and fallbacks) failed to respond"
    }
    ```
- **Alternatives Considered**:
  - *Returning 500 internal_error*: Rejected because 503 Service Unavailable correctly signals upstream load balancers and clients that this is a temporary external provider outage.
