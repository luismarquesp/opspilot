# Implementation Plan: External Provider Status Check

**Branch**: `005-external-provider-status` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

---

## Summary

Add a new agent tool `check_provider_status` that queries the public statuspage.io v2 API for GitHub or Cloudflare, with a 5-second timeout per attempt, one automatic retry on retriable failures, Zod validation of the response, and full error containment (never throws). The result is a compact one-line string consumed as an agent observation.

---

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22 LTS, ESM strict

**Primary Dependencies**:
- `globalThis.fetch` (Node.js 22 built-in) — no npm package
- `AbortSignal.timeout(5000)` (Node.js 22 built-in) — no npm package
- `zod` (already present) — response validation
- `@langchain/core` (already present) — `tool()` registration

**No new npm dependencies**

**Architecture Impact**: Single new source file (`src/agents/provider-status.ts`) + one new tool in `src/agents/tools.ts` + one test file. No changes to HTTP layer, store, or env config.

---

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Pure Functions & MVC | ✅ PASS | `checkProviderStatus` is a pure function; tool wrapper is controller boundary |
| II. Strict Boundary Validation (Zod) | ✅ PASS | External API response validated with Zod before use |
| III. Test-First & Quality Gates | ✅ PASS | Tests with injected fake fetch; no real network in test suite |
| IV. Secret & Environment Safety | ✅ PASS | No API key; no `.env` read in feature code |
| V. Agent-Centric Orchestration | ✅ PASS | Tool registered in `opsTools`; agent can invoke autonomously |
| SQLite / node:sqlite | ✅ PASS (N/A) | No persistence; feature is stateless |

No violations.

---

## Project Structure

### Documentation (this feature)
```text
specs/005-external-provider-status/
├── plan.md              ← this file
├── research.md          ← Phase 0 ✅
├── data-model.md        ← Phase 1 ✅
├── quickstart.md        ← Phase 1 ✅
├── contracts/
│   └── tools.md         ← Phase 1 ✅
├── checklists/
│   └── requirements.md  ← from /speckit-specify ✅
└── tasks.md             ← Phase 2 output (/speckit-tasks)
```

### Source Code Changes
```text
src/
├── agents/
│   ├── provider-status.ts      [NEW]    checkProviderStatus() pure function + PROVIDERS map + Zod schema
│   ├── provider-status.test.ts [NEW]    Tests with injected fake fetcher (no network)
│   └── tools.ts                [MODIFY] Add check_provider_status tool + add to opsTools
└── (no changes to any other file)
```

---

## Detailed Change Descriptions

### `src/agents/provider-status.ts` — New File

**Exports**:
- `PROVIDERS: Record<"github" | "cloudflare", string>` — URL map
- `StatusApiResponseSchema` — Zod schema
- `type StatusApiResponse` — inferred type
- `type Fetcher` — injectable fetch type alias
- `checkProviderStatus(provider, fetcher?)` — the main function

**Logic**:
1. Look up URL from `PROVIDERS[provider]`
2. Loop `attempt = 0; attempt < 2`:
   - Call `fetcher(url, { signal: AbortSignal.timeout(5000) })`
   - On catch: if retriable error → continue; else → break and return error string
   - On 5xx response → continue (retry); on 4xx → break (non-retriable)
   - On 2xx: parse JSON, run `StatusApiResponseSchema.safeParse()`, return `"indicator — description"` or Zod error string
3. After loop exhausted → return last readable error string

### `src/agents/tools.ts` — Modify

Add after the `consultarRunbook` tool:
```ts
export const CheckProviderStatusSchema = z.object({
  provider: z.enum(["github", "cloudflare"]).default("github").describe("..."),
});

export const checkProviderStatusTool = tool(
  async ({ provider }) => checkProviderStatus(provider),
  {
    name: "check_provider_status",
    description: "...",
    schema: CheckProviderStatusSchema,
  }
);
```

Update `opsTools`:
```ts
export const opsTools = [listAlerts, openIncident, resolveIncident, listIncidents, consultarRunbook, checkProviderStatusTool];
```

### `src/agents/provider-status.test.ts` — New File

All tests use injected fake fetch — zero real network.

**Test suites**:
- `checkProviderStatus — Happy Path`: GitHub operational, Cloudflare major outage
- `checkProviderStatus — Retry Behaviour`: 1st timeout + 2nd success, double timeout, 1st 5xx + 2nd success, double 5xx
- `checkProviderStatus — Error Containment`: Zod failure, 404 non-retriable, network TypeError
- `checkProviderStatus — Retry Count`: verify fake is called exactly 2 times on double failure, 1 time on 404

---

## Test Plan

| Scenario | Fake fetch behaviour | Expected result |
|----------|---------------------|-----------------|
| GitHub operational | Returns 200 + valid JSON | `"none — All Systems Operational"` |
| Cloudflare major outage | Returns 200 + major indicator | `"major — Major Service Outage"` |
| 1st timeout, 2nd success | 1st throws `AbortError`, 2nd returns 200 | compact success string |
| Double timeout | Both throw `AbortError` | readable error string |
| 1st 503, 2nd 200 | 1st returns 503, 2nd returns 200 | compact success string |
| Double 503 | Both return 503 | readable error string |
| Zod validation failure | Returns 200 + unexpected JSON shape | readable error string |
| HTTP 404 | Returns 404 | readable error, fetch called once |
| Network TypeError | Throws `TypeError("ECONNREFUSED")` | readable error string |

---

## Verification Plan

### Automated Tests
```bash
$env:OPSPILOT_DB=":memory:"; npm test
npm run typecheck
```

### Manual Verification
1. `npm run dev`
2. `curl -X POST http://localhost:3000/v1/chat -d '{"message": "Verifica o status do GitHub"}'`
3. Confirm agent response contains provider status or graceful error
4. Verify `opsTools` array has 6 tools via Node.js one-liner (see quickstart.md)
