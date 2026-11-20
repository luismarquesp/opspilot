# Tasks: External Provider Status Check — Feature 005

**Branch**: `005-external-provider-status` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**User Stories**:
- US1 (P1): Query External Provider Status
- US2 (P2): Resilient Status Retrieval (timeout + retry)
- US3 (P2): Validated and Compact Response

---

## Phase 1: Foundational — Pure Logic Module (Blocks All US)

**Purpose**: Create `src/agents/provider-status.ts` with everything US1–US3 depends on: provider config, Zod schema, fetcher type, and the `checkProviderStatus` function skeleton.

> ⚠️ **CRITICAL**: US1–US3 all depend on this foundation. Complete before any user story work.

- [x] T001 Create `src/agents/provider-status.ts` with:
  - `PROVIDERS` map: `{ github: "https://www.githubstatus.com/api/v2/status.json", cloudflare: "https://www.cloudflarestatus.com/api/v2/status.json" }`
  - `StatusApiResponseSchema` Zod schema: `z.object({ status: z.object({ indicator: z.string(), description: z.string() }) })`
  - `type StatusApiResponse` inferred from schema
  - `type Fetcher = (url: string, init?: RequestInit) => Promise<Response>` exported type alias
  - `checkProviderStatus(provider: "github" | "cloudflare", fetcher: Fetcher = globalThis.fetch): Promise<string>` — stub that returns `""` (implementation in US phases)
- [x] T002 Run `npm run typecheck` — must pass with zero errors

**Checkpoint**: Module scaffolding compiles cleanly. US phases can now flesh out the implementation. ✅

---

## Phase 2: User Story 1 — Query External Provider Status (P1) 🏆 MVP

**Goal**: `checkProviderStatus("github")` calls the real URL and returns a compact string on HTTP 200 with valid JSON.

**Independent Test**: Inject a fake fetch returning a valid 200 response → function returns `"none — All Systems Operational"`.

### Tests for US1

- [x] T003 [US1] Create `src/agents/provider-status.test.ts` with suite `checkProviderStatus — Happy Path`:
  - `"github: operational → compact string"` — fake fetch returns `200` + `{ status: { indicator: "none", description: "All Systems Operational" } }` → assert result === `"none — All Systems Operational"`
  - `"cloudflare: major outage → compact string"` — fake fetch returns `200` + major indicator → assert compact result
  - Verify tests **FAIL** before implementation

### Implementation for US1

- [x] T004 [US1] Implement the success path in `checkProviderStatus`
- [x] T005 [US1] Run `npm run typecheck` and `npm test` — T003 tests must now pass

**Checkpoint**: Happy path works end-to-end with a fake fetch. ✅

---

## Phase 3: User Story 2 — Resilient Status Retrieval (P2)

**Goal**: On timeout or 5xx, exactly one retry is made; total attempts ≤ 2; errors are returned as readable strings, never thrown.

**Independent Test**: Inject a fake fetch that throws `AbortError` twice → function returns a readable error string (does not throw); inject a fake that fails once then succeeds → returns compact success string.

### Tests for US2

- [x] T006 [US2] Extend `src/agents/provider-status.test.ts` with suite `checkProviderStatus — Retry Behaviour`:
  - `"timeout on attempt 1, success on attempt 2"` — 1st call throws `AbortError`; 2nd returns 200 → compact result
  - `"double timeout → readable error string"` — both calls throw `AbortError` → readable error, no exception
  - `"HTTP 503 on attempt 1, success on attempt 2"` — 1st returns 503; 2nd returns 200 → compact result
  - `"double HTTP 503 → readable error string"` — both return 503 → readable error
  - `"fake called exactly twice on double failure"` — verify call count === 2
  - Verify tests **FAIL** before implementation

### Implementation for US2

- [x] T007 [US2] Wrap the fetch call in `checkProviderStatus` with a retry loop (`for (let attempt = 1; attempt <= 2; attempt++)`)
- [x] T008 [US2] Handle retriable errors: `AbortError` / `TimeoutError` / `TypeError` / 5xx → continue to next attempt
- [x] T009 [US2] Run `npm run typecheck` and `npm test` — T006 tests must now pass

**Checkpoint**: Retry logic correct; no exceptions propagate; US1 tests still green. ✅

---

## Phase 4: User Story 3 — Validated and Compact Response (P2)

**Goal**: Malformed API responses produce a readable error (not an exception); HTTP 4xx responses are non-retriable and return a readable error immediately; the tool output is always a single compact line.

**Independent Test**: Inject a fake fetch returning 200 with `{ unexpected: "shape" }` → function returns a readable error, does not throw, and fetch was called exactly once.

### Tests for US3

- [x] T010 [US3] Extend `src/agents/provider-status.test.ts` with suite `checkProviderStatus — Error Containment`:
  - `"Zod validation failure → readable error, no exception"` — fake returns 200 + `{}` → readable error string
  - `"HTTP 404 (non-retriable) → readable error, fetch called once"` — fake returns 404 → readable error, call count === 1
  - `"network TypeError → readable error after 2 attempts"` — fake throws `TypeError("ECONNREFUSED")` twice → readable error string
  - `"never throws under any condition"` — run all failure cases through `assert.doesNotThrow`
  - Verify tests **FAIL** before implementation

### Implementation for US3

- [x] T011 [US3] Handle Zod failure → return readable error immediately (no retry)
- [x] T012 [US3] Handle non-retriable HTTP: 4xx → break loop, return readable error
- [x] T013 [US3] Ensure catch block covers `TypeError` (network error)
- [x] T014 [US3] Run `npm run typecheck` and `npm test` — all suites must pass

**Checkpoint**: All 3 error categories handled; function never throws; all US1+US2+US3 tests green. ✅

---

## Phase 5: Tool Registration — Wire into Agent (All US)

**Goal**: `check_provider_status` tool registered in `opsTools`; agent can invoke it from conversation.

**Independent Test**: Import `opsTools` array → assert it has 6 entries and one is named `"check_provider_status"`.

### Tests for Tool Registration

- [x] T015 [P] Extend `src/agents/tools.test.ts` with suite `Operational Tools — check_provider_status`

### Implementation for Tool Registration

- [x] T016 Add `CheckProviderStatusSchema` to `src/agents/tools.ts`
- [x] T017 Add `checkProviderStatusTool` tool to `src/agents/tools.ts`
- [x] T018 Add `checkProviderStatusTool` to `opsTools` array (6th entry)
- [x] T019 Run `npm run typecheck` and `npm test` — all suites must pass

**Checkpoint**: Tool wired; `opsTools` has 6 entries; `npm test` fully green. ✅

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T020 Run full `npm run typecheck` — zero errors
- [x] T021 Run full `npm test` with `OPSPILOT_DB=:memory:` — all 147 tests pass
- [x] T022 Manual validation: `npm run dev` and confirm agent answers provider status queries
- [x] T023 Verify `opsTools` exports 6 tools — confirmed by test T015

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phases 2–4 (US1–US3)**: Depend on Phase 1 (T001–T002)
- **Phase 5 (Tool Registration)**: Depends on Phase 4 complete
- **Phase 6 (Polish)**: Depends on Phase 5 complete

---

## Notes

- `[P]` = safe to work in parallel (different files, no shared state)
- `[USN]` label maps each task to its user story
- All test files use injected fake fetch — zero real network calls in unit tests
- `checkProviderStatus` is in `provider-status.ts`; tool wrapper is in `tools.ts`
- No new npm dependencies; uses Node.js 22 built-in `fetch` + `AbortSignal.timeout`
- Implementation was complete in T001 (all US1+US2+US3 logic written together as specified in the reference snippet)
