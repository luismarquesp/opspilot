# Tool Contract: `check_provider_status` (Feature 005)

## Tool Identity

| Property | Value |
|----------|-------|
| **Tool name** | `check_provider_status` |
| **Module** | `src/agents/tools.ts` |
| **Logic module** | `src/agents/provider-status.ts` |
| **LangChain helper** | `tool()` from `@langchain/core/tools` |

---

## Schema

```ts
export const CheckProviderStatusSchema = z.object({
  provider: z
    .enum(["github", "cloudflare"])
    .default("github")
    .describe(
      "Provedor externo a consultar. " +
      "'github' = GitHub (Actions, API, Pages); " +
      "'cloudflare' = Cloudflare (CDN, DNS, Workers). " +
      "Padrão: 'github'."
    ),
});
```

---

## Description (6-rule compliant)

```ts
description:
  "Consulta o status público de um provedor externo (GitHub ou Cloudflare). " +
  "Use quando suspeitar que um problema externo está causando falhas — " +
  "'é nosso ou do provedor?'. " +
  "Retorna: indicador + descrição em uma linha (ex: 'none — All Systems Operational')."
```

**Rule check**:
1. ✅ Purpose stated: "Consulta o status público de um provedor externo"
2. ✅ When to invoke: "quando suspeitar que um problema externo está causando falhas"
3. ✅ Enum values listed: `github | cloudflare`
4. ✅ `.describe()` on every schema field
5. ✅ Imperative mood: "Use quando…"
6. ✅ ≤120 chars per field description

---

## Handler Logic

```ts
async ({ provider }) => {
  return await checkProviderStatus(provider);
  // checkProviderStatus never throws — returns string in all cases
}
```

---

## Return Values

| Condition | Example Output |
|-----------|---------------|
| Operational | `none — All Systems Operational` |
| Minor incident | `minor — Minor Service Degradation` |
| Major outage | `major — Major Service Outage` |
| Timeout (after retry) | `Erro ao consultar status de github: timeout após 2 tentativas` |
| Network error (after retry) | `Erro ao consultar status de cloudflare: falha de rede` |
| HTTP 5xx (after retry) | `Erro ao consultar status de github: HTTP 503` |
| HTTP 4xx | `Erro ao consultar status de github: HTTP 404` |
| Invalid response shape | `Erro ao consultar status de cloudflare: resposta inesperada da API` |

---

## `checkProviderStatus` Function Contract

```ts
// src/agents/provider-status.ts

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function checkProviderStatus(
  provider: "github" | "cloudflare",
  fetcher: Fetcher = globalThis.fetch
): Promise<string>
```

**Guarantees**:
- NEVER throws — always returns a string
- Makes at most 2 HTTP attempts
- Each attempt uses `AbortSignal.timeout(5000)`
- Zod-validates response before using it

---

## Updated `opsTools` Array

After feature 005, `opsTools` exports 6 tools:

```ts
export const opsTools = [
  listAlerts,
  openIncident,
  resolveIncident,
  listIncidents,
  consultarRunbook,
  checkProviderStatus,   // NEW
];
```

---

## Providers Reference

| Slug | Status URL |
|------|-----------|
| `github` | `https://www.githubstatus.com/api/v2/status.json` |
| `cloudflare` | `https://www.cloudflarestatus.com/api/v2/status.json` |
