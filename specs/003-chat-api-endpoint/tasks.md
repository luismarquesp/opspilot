# Tasks: HTTP Chat API Endpoint

**Feature**: `003-chat-api-endpoint` | **Branch**: `003-chat-api-endpoint`
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Generated**: 2026-09-15

> **Stack**: Node.js 22 LTS · TypeScript ESM strict · Express 5 · Zod 4 · `node:test` via `tsx`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the `src/http/` directory skeleton and ensure `src/agents/index.ts` module file exists so downstream tasks have their target paths ready.

- [X] T001 Create directory `src/http/` (empty placeholder — no code yet, just the directory for subsequent tasks)
- [X] T002 [P] Create `src/agents/index.ts` as an empty TypeScript ESM module stub (`export {};`) so the file exists for T003 to fill

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the two core cross-cutting building blocks — the Zod boundary schemas and the strategy registry — that every user-story phase depends on. No HTTP handler or test can be written until these are in place.

> **⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Implement `src/http/schemas.ts` — define and export `ChatRequestSchema` (`message: z.string().trim().min(1)`, `strategy: z.string().optional()`, `reflect: z.boolean().optional()`), `ChatResponseSchema` (re-uses `StrategyResultSchema` from `src/agents/types.ts`), and error-response literals `ValidationErrorResponseSchema`, `UnknownStrategyResponseSchema`, `TimeoutErrorResponseSchema`, `InternalErrorResponseSchema`; also export inferred TypeScript types for each schema

- [X] T004 Implement `src/agents/index.ts` — replace the stub with a concrete implementation exporting:
  - `STRATEGY_REGISTRY: Record<string, ReasoningStrategy>` mapping `"react"` → `reactStrategy` and `"plan-and-execute"` → `planAndExecuteStrategy` (imported from `./react.js` and `./plan-and-execute.js`)
  - `resolveStrategy(name: string, reflect: boolean): ReasoningStrategy | undefined` — pure function: returns `undefined` if name not in registry; returns base strategy if `reflect` is falsy; returns `withReflection(strategy)` if `reflect` is truthy (imports `withReflection` from `./reflection.js`)

**Checkpoint**: Foundation ready — schemas and registry exist; user story implementation can now begin.

---

## Phase 3: User Story 1 — Interactive Incident Chat via HTTP (Priority: P1) 🏆 MVP

**Goal**: Expose `POST /chat` and return HTTP 200 `{ answer, trace, metrics }` for a valid request using the default `react` strategy with no optional parameters.

**Independent Test**: `POST /chat` with `{"message": "Check service health"}` → HTTP 200 with non-empty `answer`, non-empty `trace` array, and `metrics` object.

### Implementation for User Story 1

- [X] T005 [US1] Implement `src/http/chat.controller.ts` — export `chatHandler` as a pure Express 5 async request handler (`RequestHandler`). The handler must:
  1. Parse body with `ChatRequestSchema.safeParse(req.body)` — on failure return 400 (body handled in US3, keep the slot wired but returning 400 is sufficient for MVP)
  2. Resolve strategy via `resolveStrategy(strategy ?? "react", reflect ?? false)` — on `undefined` return 422 (handled in US3)
  3. Await `strategy.run(message)` and return HTTP 200 JSON `{ answer, trace, metrics }` from the result
  4. Export `CHAT_TIMEOUT_MS = 180_000` as a named constant for injection in tests

- [X] T006 [US1] Implement `src/http/server.ts` — export `createApp(options?: { strategyRegistry?: Record<string, ReasoningStrategy>; timeoutMs?: number })` factory that:
  - Creates an Express 5 app with `express.json()` middleware
  - Mounts `POST /chat` → `chatHandler` (importing from `./chat.controller.js`)
  - Registers a global error handler `(err, req, res, next)` that returns HTTP 500 `{ error: "internal_error" }`
  - The `options` are forwarded to the controller context via a closure or app-level locals (for test injection of registry/timeout)
  - Export `app` as a default export (singleton for `npm run dev`)

- [X] T007 [US1] Implement `src/http/index.ts` — the HTTP server startup entrypoint:
  - Imports `createApp` from `./server.js` and `getEnv` from `../config/env.js`
  - Calls `createApp()` and starts listening on `env.PORT` (default 3000)
  - Logs `[OpsPilot] HTTP server listening on port {PORT}`
  - Handles startup errors with `process.exit(1)`

- [X] T008 [US1] Update `package.json` `"dev"` script from `tsx --env-file=.env src/index.ts` to `tsx --env-file=.env src/http/index.ts` so `npm run dev` starts the HTTP server

**Checkpoint**: `npm run dev` starts the HTTP server; a `curl POST /chat '{"message":"test"}'` with a live OPENROUTER_API_KEY returns HTTP 200. US1 is fully functional.

---

## Phase 4: User Story 2 — Configurable Reasoning Strategy and Reflection (Priority: P2)

**Goal**: Wire `strategy` and `reflect` fields so the caller can select any registered strategy and enable `withReflection` decoration per-request.

**Independent Test**: `POST /chat {"message":"...", "strategy":"plan-and-execute", "reflect":true}` → HTTP 200 with at least one `critique` event in the trace.

### Implementation for User Story 2

- [X] T009 [US2] Update `src/http/chat.controller.ts` to propagate `strategy` and `reflect` fields from the parsed body:
  - Extract `strategy` (default `"react"`) and `reflect` (default `false`) from `parsedBody.data`
  - Call `resolveStrategy(strategy, reflect)` from `src/agents/index.ts`
  - Ensure `reflect: true` causes `withReflection` to be applied (the logic already lives in `resolveStrategy` — this task ensures the controller wires the fields correctly from the request body)
  - No changes needed to `resolveStrategy` itself; only the controller field extraction is updated

**Checkpoint**: `POST /chat {"message":"x","strategy":"plan-and-execute","reflect":true}` executes the plan-and-execute strategy with reflection. US2 is fully functional.

---

## Phase 5: User Story 3 — Robust Boundary Validation & Error Reporting (Priority: P3)

**Goal**: Return HTTP 400 with Zod issue details on malformed body; HTTP 422 on unknown strategy name.

**Independent Test**: Send `{}` → 400 with `issues`. Send `{"message":"hi","strategy":"bogus"}` → 422 with `strategy: "bogus"`.

### Implementation for User Story 3

- [X] T010 [US3] Update `src/http/chat.controller.ts` to fully implement the 400 validation error path:
  - When `ChatRequestSchema.safeParse` fails, serialize `error.issues` and return HTTP 400 JSON `{ error: "validation_error", issues: parsedError.error.issues }`
  - Each issue should include `path` and `message` fields (Zod 4 `ZodIssue` shape is already structured this way)

- [X] T011 [US3] Update `src/http/chat.controller.ts` to fully implement the 422 unknown strategy path:
  - When `resolveStrategy` returns `undefined`, return HTTP 422 JSON `{ error: "unknown_strategy", strategy: strategyName }` where `strategyName` is the raw value from the parsed request body

**Checkpoint**: All validation error branches return correct status codes and structured payloads. US3 is fully functional.

---

## Phase 6: User Story 4 — Long-Running Execution Timeout Protection (Priority: P4)

**Goal**: Enforce a 180-second deadline per request; respond with HTTP 504 if strategy execution exceeds it.

**Independent Test**: Register a slow strategy that resolves after `timeoutMs + 1 ms`; inject a `timeoutMs` of 50 ms; assert HTTP 504 response.

### Implementation for User Story 4

- [X] T012 [US4] Update `src/http/server.ts` `createApp` to accept and forward `timeoutMs` option (defaults to `CHAT_TIMEOUT_MS = 180_000` from `chat.controller.ts`)

- [X] T013 [US4] Update `src/http/chat.controller.ts` to implement the `Promise.race` timeout:
  - Create a `timeoutPromise(ms: number): Promise<never>` helper (pure function, local to the file) that returns a promise that rejects with a custom `class TimeoutError extends Error` after `ms` milliseconds
  - Wrap `strategy.run(message)` in `Promise.race([strategy.run(message, {}), timeoutPromise(timeoutMs)])` inside a `try/catch`
  - On `TimeoutError`, send HTTP 504 JSON `{ error: "gateway_timeout" }`
  - On any other caught error, send HTTP 500 JSON `{ error: "internal_error" }` (absorbed here before the global error handler)

**Checkpoint**: Slow executions reliably return HTTP 504. Fast executions still return HTTP 200. US4 is fully functional.

---

## Phase 7: User Story 5 — Deterministic Offline Integration Testing (Priority: P5)

**Goal**: Write the full integration test suite in `src/http/chat.test.ts` using `node:test`, offline fake strategies, and test-injected registries/timeouts. All tests pass with `npm test` in < 10 seconds.

**Independent Test**: `npm test` runs `src/http/chat.test.ts` and all assertions pass without any network calls.

### Implementation for User Story 5

- [X] T014 [US5] Implement `src/http/chat.test.ts` — full integration test suite using `node:test` and `supertest` (or Node's built-in `fetch`/`http.request` against the in-process Express app). The test file must include all of the following test cases:

  **Test helpers (define at the top of the file)**:
  - `makeFakeStrategy(result: StrategyResult): ReasoningStrategy` — returns a deterministic strategy resolving immediately with the provided result
  - `makeSlowStrategy(delayMs: number): ReasoningStrategy` — returns a strategy that resolves after `delayMs` ms (for timeout tests)

  **Test cases**:
  1. `POST /chat` with `{"message": "hello"}` and a fake registry → HTTP 200 with `answer`, `trace` array, `metrics` object
  2. `POST /chat` with no body / `{}` → HTTP 400 with `{ error: "validation_error", issues: [...] }` containing at least one issue
  3. `POST /chat` with `{"message": "  "}` (whitespace-only) → HTTP 400 (trimmed to empty by Zod)
  4. `POST /chat` with `{"message": "hi", "strategy": "nonexistent"}` and a fake registry missing that strategy → HTTP 422 with `{ error: "unknown_strategy", strategy: "nonexistent" }`
  5. `POST /chat` with a slow fake strategy and `timeoutMs: 50` injected → HTTP 504 with `{ error: "gateway_timeout" }`
  6. `POST /chat` with `{"message": "hi", "reflect": true}` and a fake registry → HTTP 200 and response `answer` matches the fake strategy's result (reflection does not break the flow; since `withReflection` wraps a fake critic-less strategy, the controller must handle this without network — use a fake strategy that also produces a valid result so no LLM is invoked)
  7. `POST /chat` with `{"message": "hi", "strategy": "plan-and-execute"}` and fake registry including `"plan-and-execute"` → HTTP 200

  **Note**: Use `app.listen(0)` (random port) in `before` and `server.close()` in `after` to avoid port conflicts.

- [X] T015 [US5] Install `supertest` as a `devDependency` if not already present (`npm install --save-dev supertest @types/supertest`) to enable in-process HTTP assertion in tests without `fetch`

**Checkpoint**: `npm test` passes all tests in `src/http/chat.test.ts` in under 10 seconds with zero network calls. US5 is fully functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, typecheck green, and optional quality improvements.

- [X] T016 [P] Run `npm run typecheck` and fix any TypeScript errors introduced by the new files (especially around Express 5 `RequestHandler` generics and Zod 4 `.issues` shape)

- [X] T017 [P] Run `npm test` and ensure all existing tests (`reflection.test.ts`, `react.test.ts`, `plan-and-execute.test.ts`, `trace.test.ts`, `tools.test.ts`) still pass alongside the new `chat.test.ts`

- [X] T018 [P] Review `src/http/chat.controller.ts` for any `any` escape hatches and replace with explicit types (Express `Request`/`Response` from `@types/express`)

- [X] T019 Run end-to-end quickstart validation from [quickstart.md](./quickstart.md) — confirm `npm run dev` starts the HTTP server and `curl POST /chat` returns HTTP 200 with a live OPENROUTER_API_KEY (manual verification only; not CI)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — **BLOCKS all user story phases**
- **US1 (Phase 3)**: Depends on Phase 2 (schemas + registry must exist)
- **US2 (Phase 4)**: Depends on US1 (controller already wired; only field extraction update)
- **US3 (Phase 5)**: Depends on US1 (400/422 paths are additions to the same handler)
- **US4 (Phase 6)**: Depends on US1 (adds timeout wrapping inside the existing handler)
- **US5 (Phase 7)**: Depends on US1–US4 (tests cover all four error paths)
- **Polish (Phase 8)**: Depends on all user story phases

### Parallel Opportunities

```
T001 ──────┐
T002 ──────┼──> T003 ──> T004 ──> T005 ──> T006 ──> T007 ──> T008  [Phase 1→2→US1 sequential]
           │
           │    After US1 complete:
           │    T009 (US2) ──┐
           │    T010 (US3) ──┤  all parallelizable once T005–T008 done
           │    T011 (US3) ──┤
           │    T012 (US4) ──┤
           │    T013 (US4) ──┘
           │
           └──> T014 (US5) ──> T015 (US5)  [after all above complete]

Polish (T016, T017, T018 parallelizable):
T016 [P] ──┐
T017 [P] ──┼──> T019 (manual)
T018 [P] ──┘
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T004)
3. Complete Phase 3: User Story 1 (T005–T008)
4. **STOP and VALIDATE**: `npm run dev` + `curl POST /chat` returns HTTP 200
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (T005–T008) → Basic chat endpoint working (**MVP**)
3. US2 (T009) → Strategy selection + reflection enabled
4. US3 (T010–T011) → Full validation error handling
5. US4 (T012–T013) → Timeout protection
6. US5 (T014–T015) → Full offline integration test suite
7. Polish (T016–T019) → Quality gates green

---

## Notes

- `[P]` tasks touch different files and have no shared dependencies — safe to run in parallel
- `[US?]` labels map tasks to user stories for traceability
- `supertest` (T015) should be installed before T014 is coded
- The `createApp` factory pattern (accepting `strategyRegistry` + `timeoutMs`) is the key design that enables offline tests without any network or environment variables
- `npm run typecheck` and `npm test` MUST remain green after every task
- Avoid modifying `src/index.ts`, `src/arena.ts`, or any existing agent files — this feature only adds new files in `src/http/` and `src/agents/index.ts`
