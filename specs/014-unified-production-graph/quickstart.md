# Quickstart Validation Guide: Unified Production Graph (`production-graph.ts`)

**Feature**: Unified Production Graph  
**Branch**: `014-unified-production-graph`  
**Date**: 2026-10-19  

This guide provides runnable scenarios to validate that the unified production graph autonomously routes requests, respects manual overrides, and attributes every trace event to its originating graph node.

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

## Scenario 1: Autonomous Routing (No Strategy Specified)

### Step
Run an integration test or send a request to `/chat` omitting the `strategy` field with a direct alert inquiry:
```bash
# In test or curl:
POST /chat
Content-Type: application/json
{
  "message": "Quais alertas estão com status firing agora?"
}
```

### Expected Outcome
1. HTTP status is `200 OK`.
2. `trace` starts with a `"route"` event where:
   - `type`: `"route"`
   - `node`: `"router"`
   - `route`: `"react"`
   - `reason`: Contains the router's rationale grounded in the decision table.
3. Subsequent events (`thought`, `action`, `observation`) carry `node: "react"`.
4. Final answer carries `node: "response"`.

---

## Scenario 2: Operator Strategy Override

### Step
Send a request explicitly specifying a strategy override for a multi-step resolution task:
```bash
POST /chat
Content-Type: application/json
{
  "message": "Mitigue o alerta crítico do payment-api e resolva o incidente",
  "strategy": "plan-and-execute"
}
```

### Expected Outcome
1. HTTP status is `200 OK`.
2. Router node does not call the classification model; routes directly to `plan-and-execute`.
3. `trace` contains a `"route"` event with:
   - `node`: `"router"`
   - `route`: `"plan-and-execute"`
   - `reason`: Indicates manual override.
4. Strategy events (`plan`, `action`, `observation`, `critique`) carry `node: "plan-and-execute"`.

---

## Scenario 3: Complete Node Attribution in All Trace Events

### Step
Execute the unified graph test suite:
```bash
node --import tsx --test "src/agents/production-graph.test.ts"
```

### Expected Outcome
1. 100% of trace events contain a valid, non-empty `node` property (`"context" | "router" | "react" | "plan-and-execute" | "reflection" | "response"`).
2. No events omit the `node` field.
3. Tests assert that both autonomous routing and manual overrides produce correctly attributed events.

---

## Scenario 4: Full Quality Gate Verification

```bash
npm run typecheck
npm test
```

### Expected Outcome
Zero TypeScript diagnostic errors and all test suites pass.
