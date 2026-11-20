# Quickstart Validation Guide: Model Fallback & Retry Resilience

**Feature Branch**: `015-model-fallback-resilience`  
**Date**: 2026-10-21  

This guide provides runnable scenarios to validate that OpsPilot retries transient failures, fails over to configured backup models when the primary fails, records `"fallback"` trace events with `modelUsed` metrics, and returns HTTP 503 when all models are exhausted.

---

## Prerequisites

1. Node.js 22 LTS installed.
2. Dependencies installed via `npm install`.
3. Quality gates green:
   ```bash
   npm run typecheck
   npm test
   ```

---

## Scenario 1: Primary Model Fails $\rightarrow$ Successful Failover to Fallback

### Step
Run a test simulating primary model rate limit (HTTP 429) while a fallback model (`openai/gpt-4o-mini`) is available:

```bash
node --import tsx --test "src/agents/model.test.ts"
```

### Expected Outcome
1. Primary model exhausts retries.
2. Invocation cascades to the fallback model.
3. Execution trace contains a `"fallback"` event:
   - `type`: `"fallback"`
   - `fromModel`: Primary model name
   - `toModel`: Fallback model name
   - `reason`: Contains the failure reason (e.g. rate limit error)
4. Telemetry metrics show `metrics.modelUsed` equal to the fallback model name.

---

## Scenario 2: Transient Primary Failure $\rightarrow$ Retry and Success

### Step
Run a test where the primary model fails on attempt 1 with a 500 error but succeeds on attempt 2:

```bash
node --import tsx --test "src/agents/model.test.ts"
```

### Expected Outcome
1. Primary model retries and succeeds on the second attempt.
2. No `"fallback"` event is emitted in the trace.
3. `metrics.modelUsed` remains the primary model.

---

## Scenario 3: Complete Outage $\rightarrow$ HTTP 503 Service Unavailable

### Step
Send a request to `/chat` when both primary and all fallback models fail:

```bash
# In integration test or curl:
POST /chat
Content-Type: application/json
{
  "message": "Status dos alertas"
}
```

### Expected Outcome
1. HTTP status code is `503 Service Unavailable`.
2. Response body:
   ```json
   {
     "error": "model_unavailable",
     "message": "All configured models (primary and fallbacks) failed to respond"
   }
   ```
3. Request terminates gracefully without unhandled crashes.

---

## Scenario 4: Full Quality Gate Verification

```bash
npm run typecheck
npm test
```

### Expected Outcome
Zero TypeScript diagnostic errors and all test suites pass.
