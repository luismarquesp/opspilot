# Quickstart: Strategy Reflection Layer

This quickstart guide documents how to validate and run the Strategy Reflection Layer (`002-strategy-reflection`) end-to-end.

## Prerequisites

- Node.js 22 LTS
- OpenRouter API key configured in `.env` (with `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`)
- Local dependencies installed:
  ```bash
  npm install
  ```

## Validation Scenarios

### 1. Automated Typecheck and Unit Tests

Verify that TypeScript types and all unit tests (trace, tools, base strategies, reflection decorator, arena) pass cleanly without regression:

```bash
npm run typecheck
npm test
```

**Expected Outcome**:
- `npm run typecheck` exits with code 0 (no TypeScript errors).
- `npm test` runs all test suites (`src/**/*.test.ts`), passing all assertions including reflection approval, bounded rejections, context feedback regeneration, and metric aggregation.

---

### 2. Standalone Programmatic Reflection Validation

Wrap an existing reasoning strategy with `withReflection` in an operational script or node REPL:

```typescript
import { reactStrategy } from "./src/agents/react.js";
import { withReflection } from "./src/agents/reflection.js";

const reflectedReact = withReflection(reactStrategy, { maxReflection: 2 });
const result = await reflectedReact.run(
  "Investigate firing alerts and summarize service health"
);

console.log("Answer:", result.answer);
console.log("Trace events:", result.trace.map(e => `[${e.type}] ${e.content}`));
console.log("Metrics:", result.metrics);
```

**Expected Outcome**:
- Result trace contains at least one `[critique]` event.
- The answer accurately reflects tool observations.
- Cumulative metrics count base LLM calls + critique evaluations (+ any regeneration passes).

---

### 3. Arena Comparative Execution

Execute the Strategy Arena CLI to benchmark baseline vs. reflected strategies side-by-side:

```bash
npm run arena -- --strategies react,reflect:react,plan-and-execute,reflect:plan-and-execute
```

Or targeting specifically reflected strategies:

```bash
npm run arena -- --strategies reflect:react,reflect:plan-and-execute --prompt "Check all alerts and open an incident for any down service"
```

**Expected Outcome**:
1. Arena runs each specified strategy against the prompt.
2. Formatted trace logs display the event stream for each strategy, including `[CRITIQUE]` tags with reviewer feedback.
3. The Arena Summary table renders comparison columns (`Answer Length`, `LLM Calls`, `Latency (ms)`) for all strategies including `reflect:react` and `reflect:plan-and-execute`.

---

### 4. Edge Case Validation: Bounded Loop Ceiling

When the critic rejects an answer repeatedly, verify that reflection terminates strictly at `maxReflection` (default: 2):

```typescript
// With a mock critic or forced rejection
const reflected = withReflection(baseStrategy, { maxReflection: 1 });
const result = await reflected.run("test prompt");
// Exactly 1 regeneration pass occurs (2 total runs + 2 critiques), loop halts cleanly.
```

**Expected Outcome**:
- Loop halts deterministically; no infinite recursion.
- Final trace includes all review attempts and final verdict.
