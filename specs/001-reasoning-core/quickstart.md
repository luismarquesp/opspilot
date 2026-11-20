# Quickstart Validation Guide: OpsPilot Reasoning Core

This guide details end-to-end runnable scenarios to validate the OpsPilot Reasoning Core.

## Prerequisites

1. **Node.js**: Version 22 LTS or compatible.
2. **Environment Variables**: A valid `.env` file containing:
   ```bash
   OPENROUTER_API_KEY="sk-or-v1-..."
   OPEN_ROUTER_MODEL="openai/gpt-4o-mini"
   ```
3. **Database Configuration** (Optional for tests/memory mode, required for full MySQL mode):
   ```bash
   DB_HOST="localhost"
   DB_PORT="3306"
   DB_USER="root"
   DB_PASSWORD="password"
   DB_NAME="opspilot"
   ```

---

## Scenario 1: Offline Deterministic Test Suite

Validates that store operations, baseline seeding, tool Zod schemas, and trace formatters run deterministically without network access.

### Command
```bash
npm test
```

### Expected Outcome
- Test runner executes `src/**/*.test.ts` via `node:test`.
- Store seeding populates 5 services and 6 alerts (3 firing, 3 resolved).
- Tool schemas reject invalid payloads and accept valid parameters.
- Trace serialization produces valid discriminated union objects.
- Result: 100% tests passing, 0 failures, total execution duration < 5 seconds.

---

## Scenario 2: TypeScript Strict Compilation Gate

Validates that all interfaces, types, and model contracts strictly adhere to TypeScript typing.

### Command
```bash
npm run typecheck
```

### Expected Outcome
- `tsc --noEmit` exits with status code `0` and zero diagnostics/errors.

---

## Scenario 3: Database Seeding Verification

Populates the store with the baseline dataset (5 services, 6 alerts).

### Command
```bash
npm run dev -- --seed
# OR dedicated script:
npx tsx src/scripts/seed.ts
```

### Expected Outcome
- Connects to the database/store.
- Initializes tables/collections.
- Inserts exactly 5 services (`payment-api`, `auth-service`, `order-processor`, `database-cluster`, `notification-hub`).
- Inserts exactly 6 alerts (3 firing, 3 resolved).
- Outputs confirmation log: `[Seed] Successfully seeded 5 services and 6 alerts.`

---

## Scenario 4: Arena Comparative Execution

Executes ReAct and Plan-and-Execute reasoning strategies side-by-side against a live incident scenario.

### Command
```bash
npm run arena -- --strategies react,plan-and-execute --max-iterations 8
```

### Expected Outcome
- **ReAct Strategy**:
  - Emits thought events.
  - Calls `list_alerts` tool to find firing alerts.
  - Calls `open_incident` for the critical payment alert.
  - Emits final answer.
  - Displays metrics: LLM Calls and latency in milliseconds.
- **Plan-and-Execute Strategy**:
  - Planner creates a structured list of steps.
  - Executor carries out each step using tools.
  - Replanner reviews progress and halts when done or at 8 steps.
  - Displays metrics: LLM Calls and latency in milliseconds.
- **Arena Summary Table**:
  - Prints side-by-side comparison table showing Strategy, Answer Length, LLM Calls, and Latency.
