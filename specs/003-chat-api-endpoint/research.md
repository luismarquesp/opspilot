# Research: HTTP Chat API Endpoint
**Feature**: `003-chat-api-endpoint` | **Phase**: 0 — Outline & Research
**Date**: 2026-09-15

---

## Decision 1: HTTP Server Placement and Entrypoint

- **Decision**: Create `src/http/server.ts` as the Express application factory and mount the `/chat` route there. The existing `src/index.ts` should remain as the library/seed entrypoint; a new `src/http/index.ts` will be the HTTP server startup entrypoint.
- **Rationale**: Decouples the HTTP serving concern from the existing CLI/library barrel. Allows unit-testing the Express app (`createApp`) without binding a real port — consistent with MVC conventions already used in the codebase.
- **Alternatives considered**: Adding the route directly to `src/index.ts` — rejected because `index.ts` already serves as a re-export barrel and a seed CLI entrypoint; merging HTTP concerns would break the single-responsibility rule.

---

## Decision 2: Strategy Registry

- **Decision**: Implement `src/agents/index.ts` as a named registry module exporting:
  - `STRATEGY_REGISTRY: Record<string, ReasoningStrategy>` — maps string names (`"react"`, `"plan-and-execute"`) to singleton strategy instances.
  - `resolveStrategy(name: string, reflect: boolean): ReasoningStrategy | undefined` — pure factory function; if `reflect` is true, wraps the resolved strategy with `withReflection(strategy)`.
- **Rationale**: The existing `src/arena.ts` already defines `DEFAULT_STRATEGIES` as a `Record<string, ReasoningStrategy>`. The new registry follows that same pattern but lives in `src/agents/` for clean dependency layering (agents layer does not import from `arena.ts`), and exposes a resolver function that encapsulates the reflection decoration logic.
- **Alternatives considered**: Re-using `DEFAULT_STRATEGIES` from `arena.ts` — rejected because `arena.ts` already exports CLI-related logic and would create a circular or cross-layer dependency. A dedicated `src/agents/index.ts` file cleanly separates concerns.

---

## Decision 3: Zod Request/Response Schemas

- **Decision**: Define all HTTP boundary schemas in `src/http/schemas.ts`:
  - `ChatRequestSchema` — `z.object({ message: z.string().trim().min(1), strategy: z.string().optional(), reflect: z.boolean().optional() })`
  - `ChatResponseSchema` — `z.object({ answer: z.string(), trace: z.array(TraceEventSchema), metrics: StrategyMetricsSchema })`
  - `ValidationErrorResponseSchema` — `z.object({ error: z.literal("validation_error"), issues: z.array(z.object({ path: ..., message: ... })) })`
- **Rationale**: Centralising schemas in one file makes them easy to reference in both the controller and the test suite. Zod v4 (used in this project) provides `.flatten()` and `.format()` for structured issue serialisation.
- **Alternatives considered**: Inline schemas in the controller — rejected because it makes testing schema logic separately harder and violates the single-responsibility principle.

---

## Decision 4: Controller Architecture (MVC)

- **Decision**: Implement a `ChatController` module at `src/http/chat.controller.ts` exporting a single pure function `chatHandler(req, res)` (Express 5 request handler). The controller:
  1. Parses + validates body with `ChatRequestSchema.safeParse`.
  2. Returns 400 with `issues` if parsing fails.
  3. Resolves strategy via `resolveStrategy`; returns 422 if `undefined`.
  4. Races `strategy.run(message)` against a 180-second timeout `Promise`.
  5. Returns 504 on timeout, 200 with `{answer, trace, metrics}` on success, 500 on unexpected error.
- **Rationale**: Pure handler function (no class-based controller) is idiomatic for functional TypeScript and consistent with the constitution's preference for pure functions.
- **Alternatives considered**: Class-based controller — rejected for needless complexity. Middleware-based timeout — rejected because `AbortController`-based timeout within the handler is simpler and more explicit.

---

## Decision 5: Timeout Implementation

- **Decision**: Use `Promise.race` with a `setTimeout`-based sentinel promise (180 000 ms). The handler creates a `timeoutPromise` that rejects with a custom `TimeoutError` after 180s. `Promise.race([strategy.run(...), timeoutPromise])` is awaited; on `TimeoutError`, the response is sent with 504.
- **Rationale**: `Promise.race` is idiomatic, testable, and does not require any middleware or external packages. The timeout constant (`CHAT_TIMEOUT_MS = 180_000`) will be a named export in `src/http/server.ts` so integration tests can override it via dependency injection.
- **Alternatives considered**: `AbortSignal` passed into strategy — rejected because `ReasoningStrategy.run` does not currently accept a signal, and changing the interface is out of scope for this feature.

---

## Decision 6: Integration Test Strategy (Fake Deterministic Strategy)

- **Decision**: Create a `makeFakeStrategy(result: StrategyResult): ReasoningStrategy` factory in the test file `src/http/chat.test.ts`. This factory returns a deterministic `ReasoningStrategy` that resolves immediately without any LLM or network calls. A second variant `makeSlowStrategy(delayMs)` resolves after a configurable delay to test timeout behaviour. The `createApp` factory accepts an optional `options` parameter including `strategyRegistry` and `timeoutMs` overrides.
- **Rationale**: Completely offline tests that run in < 10 seconds. Matches the constitution requirement that all new logic ships with tests using `node:test` via `tsx`. Pattern mirrors the existing `reflection.test.ts` which creates fake strategies inline.
- **Alternatives considered**: Using `sinon`/`jest.mock` — rejected because the project intentionally avoids test frameworks beyond `node:test`.

---

## Decision 7: Express 5 Error Handling

- **Decision**: Express 5 (`^5.2.1`) is already a dependency. Async errors in route handlers are automatically propagated to the next error handler in Express 5 (no `try/catch` + `next(err)` boilerplate needed for unhandled rejections). A global error handler will be registered in `createApp` to catch any unhandled errors and respond with 500.
- **Rationale**: Express 5's native async error propagation removes boilerplate and aligns with the codebase's clean functional style.
- **Alternatives considered**: Manual `try/catch` in every handler — rejected as verbose and error-prone.

---

## Resolved Clarifications

| Topic | Resolution |
|---|---|
| Server entrypoint | New `src/http/index.ts`; existing `src/index.ts` unchanged |
| Registry location | `src/agents/index.ts` — new file |
| `reflect` decoration | `resolveStrategy` applies `withReflection` when `reflect: true` |
| Timeout testability | `createApp({ timeoutMs })` injectable default for tests |
| 400 body format | `{ error: "validation_error", issues: ZodIssue[] }` |
| 422 body format | `{ error: "unknown_strategy", strategy: string }` |
| 504 body format | `{ error: "gateway_timeout" }` |
| 500 body format | `{ error: "internal_error" }` |
