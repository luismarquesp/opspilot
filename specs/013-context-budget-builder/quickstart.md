# Quickstart Guide: Section-Budget Context Builder

**Feature**: Section-Budget Context Builder (`ContextBuilder`)  
**Branch**: `013-context-budget-builder`  
**Date**: 2026-10-06  

---

## Prerequisites

- Node.js 22 LTS
- TypeScript & tsx configured in repository
- Database initialized (or `:memory:` for automated tests)

---

## Automated Validation Scenarios

### 1. Run Unit Tests for ContextBuilder
Validate that:
1. Low window budget prunes oldest messages first.
2. Low memory budget prunes lowest-scoring memories first.
3. Summary bounding adheres to budget.
4. System prompt and current user message are never truncated.
5. Environment variable overrides are respected.

```bash
node --import tsx --test "src/context/context-builder.test.ts"
```

**Expected Outcome**: All unit tests pass with zero failures.

---

### 2. Verify Whole Test Suite
Run the full automated test suite to ensure zero regressions across ReAct, Reflection, Plan-and-Execute, and HTTP chat controllers:

```bash
npm test
```

**Expected Outcome**: 100% tests pass.

---

### 3. Verify TypeScript Type Safety
Run compiler verification without emit:

```bash
npm run typecheck
```

**Expected Outcome**: Zero type errors (`tsc --noEmit` exits with status code 0).

---

## Interactive / Verification Snippet

```typescript
import { buildContext } from "./src/context/context-builder.js";

// Verify low ceilings enforce strict eviction orders
const context = buildContext({
  systemPrompt: "You are OpsPilot.",
  userMessage: "Check database alert",
  history: [
    { role: "user", content: "Old message 1 (100 tokens long...)" },
    { role: "assistant", content: "Old response 2 (100 tokens long...)" },
    { role: "user", content: "Recent message 3" },
  ],
  memories: [
    { fact: "Unimportant note", score: 0.35 },
    { fact: "Critical runbook fact", score: 0.95 },
  ],
  budgets: {
    window: 50,  // low budget forces eviction of oldest messages
    memory: 20,  // low budget retains only score 0.95
  },
});

console.log("Retained history count:", context.stats.retainedHistoryCount); // 1
console.log("Retained memories count:", context.stats.retainedMemoriesCount); // 1
```
