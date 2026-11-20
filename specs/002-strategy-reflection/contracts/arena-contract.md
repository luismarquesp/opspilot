# Contract: Arena CLI Reflected Strategy Extensions

## Overview

The Strategy Arena (`src/arena.ts`) allows comparative benchmarking between reasoning strategies. Feature `002-strategy-reflection` extends the Arena CLI to support reflected strategy variants side-by-side with baseline strategies.

## 1. Supported Strategy Identifiers

The Arena CLI accepts the `--strategies` parameter with any combination of:

- `react`: Baseline ReAct agent (`reactStrategy`).
- `plan-and-execute`: Baseline Plan-and-Execute agent (`planAndExecuteStrategy`).
- `reflect:react`: Reflection-decorated ReAct agent (`withReflection(reactStrategy)`).
- `reflect:plan-and-execute`: Reflection-decorated Plan-and-Execute agent (`withReflection(planAndExecuteStrategy)`).

### Default Selection
When `--strategies` is not provided, the default remains:
`["react", "plan-and-execute"]` or can include reflected strategies as configured.

## 2. Zod Validation Schema

`ArenaArgsSchema` in `src/arena.ts` validates incoming arguments:

```typescript
export const SupportedStrategies = [
  "react",
  "plan-and-execute",
  "reflect:react",
  "reflect:plan-and-execute",
] as const;

export type StrategyKey = (typeof SupportedStrategies)[number];

export const ArenaArgsSchema = z.object({
  prompt: z
    .string()
    .default("Investigate firing alerts, open an incident for any critical service, and report status"),
  strategies: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => {
      if (Array.isArray(val)) return val;
      return val.split(",").map((s) => s.trim()).filter(Boolean);
    })
    .pipe(z.array(z.enum(SupportedStrategies)))
    .default(["react", "plan-and-execute"]),
  maxIterations: z.coerce.number().int().positive().default(8),
  maxReflection: z.coerce.number().int().positive().default(2),
});
```

## 3. Formatted Summary Output Contract

The summary table columns must accommodate longer strategy identifiers up to 26 characters (e.g. `reflect:plan-and-execute`):

```text
======================================================================
                         Arena Summary
======================================================================
| Strategy                   | Answer Length | LLM Calls | Latency (ms) |
|----------------------------|---------------|-----------|--------------|
| react                      | 245 chars     | 3         | 1250         |
| reflect:react              | 250 chars     | 4         | 1890         |
| plan-and-execute           | 310 chars     | 5         | 3420         |
| reflect:plan-and-execute   | 315 chars     | 6         | 4100         |
======================================================================
```
