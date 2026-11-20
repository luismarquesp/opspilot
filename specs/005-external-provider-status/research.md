# Research: External Provider Status Check (Feature 005)

## 1. `AbortSignal.timeout()` — Timeout Mechanism

**Decision**: Use `AbortSignal.timeout(5000)` per fetch attempt.

**Rationale**: Built into Node.js 22 (stable since Node.js 17.3). Requires zero external dependencies. Cleaner than manual `AbortController` + `setTimeout` pairs.

**API surface**:
```ts
const signal = AbortSignal.timeout(5000); // auto-aborts after 5s
const response = await fetch(url, { signal });
```

**Error signature on timeout**: `DOMException` with `name === "TimeoutError"` or `name === "AbortError"`. Both must be caught.

**Alternatives considered**:
- Manual `AbortController` + `clearTimeout`: more boilerplate, same outcome — rejected.
- `node-fetch` with timeout option: adds external dependency — rejected (native fetch is sufficient).

---

## 2. Retry Logic

**Decision**: Simple `for (attempt = 0; attempt < 2; attempt++)` loop — no external retry library.

**Retriable conditions**:
- `TimeoutError` / `AbortError` from AbortSignal
- `TypeError` (network-level failure, e.g. ECONNREFUSED)
- `response.ok === false && response.status >= 500`

**Non-retriable conditions** (break immediately):
- `response.ok === true` — success
- `response.status` is 4xx (except 429) — client error, won't improve with retry
- Zod validation failure — API shape issue, not transient

**Pattern**:
```ts
let lastError: string | null = null;
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok && res.status >= 500) {
      lastError = `HTTP ${res.status}`;
      continue; // retry
    }
    if (!res.ok) break; // 4xx — non-retriable
    const json = await res.json();
    const parsed = Schema.safeParse(json);
    if (!parsed.success) return `Erro: resposta inesperada da API`;
    return `${parsed.data.status.indicator} — ${parsed.data.status.description}`;
  } catch (err) {
    lastError = isAbortError(err) ? "timeout" : String(err);
    // continue to retry
  }
}
return `Erro ao consultar status de ${provider}: ${lastError ?? "falha desconhecida"}`;
```

---

## 3. Dependency Injection of `fetch`

**Decision**: The pure logic function `checkProviderStatus` accepts a `fetcher` parameter typed as `typeof fetch` with default `globalThis.fetch`.

```ts
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function checkProviderStatus(
  provider: "github" | "cloudflare",
  fetcher: Fetcher = globalThis.fetch
): Promise<string>
```

**Rationale**: Keeps the function a pure function in the sense that all side effects are injected. Tests pass a fake that returns `Promise.resolve(new Response(JSON.stringify(...), { status: 200 }))`.

**Alternative**: Mocking `globalThis.fetch` in tests — avoided because it mutates global state and risks test cross-contamination.

---

## 4. Zod Schema for statuspage.io v2

**Endpoint response shape** (from live API inspection):
```json
{
  "page": { "id": "...", "name": "GitHub", ... },
  "status": { "indicator": "none", "description": "All Systems Operational" }
}
```

**Schema** (permissive for extra fields — no `.strict()`):
```ts
const StatusApiResponseSchema = z.object({
  status: z.object({
    indicator: z.string(),
    description: z.string(),
  }),
});
```

**Rationale**: We only extract `status.indicator` and `status.description`. Using `z.string()` instead of `z.enum(...)` for `indicator` makes the schema forward-compatible with new indicator values statuspage.io might introduce without breaking the tool.

---

## 5. File Architecture Decision

**Decision**: Split into two files:

| File | Contents |
|------|----------|
| `src/agents/provider-status.ts` | `checkProviderStatus()` pure async function + `PROVIDER_CONFIG` map + Zod schema |
| `src/agents/tools.ts` | `checkProviderStatus` LangChain tool wrapper (adds to `opsTools` array) |
| `src/agents/provider-status.test.ts` | Tests of `checkProviderStatus()` with injected fake fetch |

**Rationale**: Separating pure logic from the LangChain tool registration allows:
1. Testing the HTTP + retry + validation logic without importing `@langchain/core`
2. Reusing `checkProviderStatus` from non-agent contexts (e.g. bench scripts) in the future
3. Following the existing separation in the project (tools.ts delegates to ops-store.ts)

---

## 6. Provider Configuration Map

**Decision**: Static `PROVIDERS` record with URL mapped to slug:

```ts
export const PROVIDERS: Record<"github" | "cloudflare", string> = {
  github: "https://www.githubstatus.com/api/v2/status.json",
  cloudflare: "https://www.cloudflarestatus.com/api/v2/status.json",
};
```

**Rationale**: A plain record is simpler than a class hierarchy; adding a new provider later is a one-line change.

---

## 7. Constitution Compliance

| Principle | Status |
|-----------|--------|
| I. Pure Functions & MVC | ✅ `checkProviderStatus` is a pure function; tool wrapper is the controller boundary |
| II. Strict Boundary Validation (Zod) | ✅ API response validated with Zod before output |
| III. Test-First & Quality Gates | ✅ Tests with fake fetch; typecheck + test always green |
| IV. Secret & Environment Safety | ✅ No API key; no .env read in domain logic |
| V. Agent-Centric Orchestration | ✅ Tool registered in `opsTools` array; agent can invoke autonomously |

---

## 8. Error Taxonomy

| Condition | Retriable? | Returned Message |
|-----------|-----------|-----------------|
| `AbortError` / `TimeoutError` | Yes (1 retry) | `Erro ao consultar status de {p}: timeout após 2 tentativas` |
| `TypeError` (network) | Yes (1 retry) | `Erro ao consultar status de {p}: falha de rede` |
| HTTP 5xx | Yes (1 retry) | `Erro ao consultar status de {p}: HTTP 503` |
| HTTP 4xx | No | `Erro ao consultar status de {p}: HTTP 404` |
| Zod validation failure | No | `Erro ao consultar status de {p}: resposta inesperada da API` |
| Double failure | — | Last error message from above table |
