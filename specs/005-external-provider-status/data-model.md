# Data Model: External Provider Status Check (Feature 005)

## Entities

### 1. Provider (configuration-time constant)

Represents a supported external service provider whose public status can be queried.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `"github" \| "cloudflare"` | Stable slug used as tool parameter |
| `statusUrl` | `string` | Public statuspage.io v2 API URL |

**TypeScript representation** (static map, not a class):
```ts
export const PROVIDERS: Record<"github" | "cloudflare", string> = {
  github:     "https://www.githubstatus.com/api/v2/status.json",
  cloudflare: "https://www.cloudflarestatus.com/api/v2/status.json",
};
```

No database storage — providers are a compile-time constant.

---

### 2. ProviderStatusResponse (external API contract)

Shape returned by statuspage.io v2 public APIs. Validated with Zod on each call.

| Field | Type | Source |
|-------|------|--------|
| `status.indicator` | `string` | statuspage.io indicator: `"none" \| "minor" \| "major" \| "critical"` |
| `status.description` | `string` | Human-readable state, e.g. `"All Systems Operational"` |

**Zod schema**:
```ts
export const StatusApiResponseSchema = z.object({
  status: z.object({
    indicator: z.string(),
    description: z.string(),
  }),
});
export type StatusApiResponse = z.infer<typeof StatusApiResponseSchema>;
```

Note: The API returns additional fields (`page`, `components`, etc.) that are intentionally ignored. Using a permissive (non-strict) schema ensures forward compatibility.

---

### 3. ProviderStatusResult (tool output)

The string returned by `check_provider_status` as its observation to the agent.

| Condition | Format |
|-----------|--------|
| Success | `"<indicator> — <description>"` |
| Any failure (after retries) | `"Erro ao consultar status de <provider>: <reason>"` |

**Examples**:
```
none — All Systems Operational
major — Major Service Outage
Erro ao consultar status de github: timeout após 2 tentativas
Erro ao consultar status de cloudflare: resposta inesperada da API
```

---

### 4. Fetcher (injectable dependency)

Not a domain entity — a type alias for the HTTP primitive, used for testability.

```ts
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
```

Default value: `globalThis.fetch` (Node.js 22 built-in).  
Test value: fake function returning pre-constructed `Response` objects.

---

## State Transitions

The `checkProviderStatus` function has an internal retry state machine:

```
attempt 0
  ├─ success          → return compact result string
  ├─ retriable error  → attempt 1
  │     ├─ success    → return compact result string
  │     └─ any error  → return readable error string
  └─ non-retriable    → return readable error string
```

**Retriable**: `AbortError`, `TimeoutError`, `TypeError`, HTTP 5xx  
**Non-retriable**: HTTP 4xx (non-429), Zod validation failure

---

## No Persistence

This feature does not persist any data. Each tool invocation is a stateless read from an external HTTP endpoint. No SQLite tables, no `IOpsStore` changes.
