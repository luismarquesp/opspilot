# Contract: Arena CLI Interface

The Arena CLI is executed via `npm run arena -- [options]` or `tsx src/arena.ts [options]`.

## CLI Arguments Schema

```typescript
import { z } from 'zod';

export const ArenaArgsSchema = z.object({
  prompt: z
    .string()
    .default('Investigate firing alerts, open an incident for any critical service, and report status'),
  strategies: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .pipe(z.array(z.enum(['react', 'plan-and-execute'])))
    .default(['react', 'plan-and-execute']),
  maxIterations: z
    .coerce
    .number()
    .int()
    .positive()
    .default(8),
});

export type ArenaArgs = z.infer<typeof ArenaArgsSchema>;
```

## CLI Invocation Examples

```bash
# Run both strategies with default prompt
npm run arena

# Run specific strategy with custom iteration limit
npm run arena -- --strategies react --max-iterations 5

# Run with custom operational prompt
npm run arena -- --strategies plan-and-execute --prompt "Resolve incident inc-101"
```

## Output Format Specification

```text
============================================================
              OpsPilot Strategy Arena
============================================================
Input: "Investigate firing alerts and open incident for payment-api"
Config: Max Iterations = 8 | Strategies = react, plan-and-execute

------------------------------------------------------------
[1/2] Running Strategy: react
------------------------------------------------------------
[THOUGHT] Checking active firing alerts in the system.
[ACTION]  list_alerts({"status":"firing"})
[OBSERV.] Found 3 firing alerts (alt-001: payment-api, alt-002: database-cluster, alt-003: order-processor).
[THOUGHT] payment-api has a critical 5xx alert. Opening incident.
[ACTION]  open_incident({"title":"High 5xx error rate on /v1/charges","service":"payment-api","severity":"critical"})
[OBSERV.] Incident inc-101 created.
[ANSWER]  Created critical incident inc-101 for payment-api due to high 5xx error rate.

Metrics: LLM Calls: 3 | Latency: 2450ms

------------------------------------------------------------
[2/2] Running Strategy: plan-and-execute
------------------------------------------------------------
[PLAN]    1. List firing alerts. 2. Identify critical services. 3. Open incident. 4. Summarize.
[ACTION]  list_alerts({"status":"firing"})
[OBSERV.] Found 3 firing alerts.
[CRITIQUE] Step 1 complete. Proceeding to step 2 & 3.
...
[ANSWER]  Incident inc-102 created for payment-api.

Metrics: LLM Calls: 4 | Latency: 3120ms

============================================================
                    Arena Summary
============================================================
| Strategy         | Answer Length | LLM Calls | Latency (ms) |
|------------------|---------------|-----------|--------------|
| react            | 84 chars      | 3         | 2450         |
| plan-and-execute | 91 chars      | 4         | 3120         |
============================================================
```
