# Tool Contracts: SQLite Real Persistence (Feature 004)

This document defines the agent-facing tool contracts that are added or updated in this feature.
All tools use Zod schemas for input validation and return JSON strings.

---

## Existing Tools (Updated Descriptions)

### `list_alerts`

**When to use**: Call when the operator asks what is currently firing, how the shift looks, or wants to review alert history. Returns monitoring alerts filtered by operational status.

```ts
schema: z.object({
  status: z
    .enum(["firing", "resolved", "all"])
    .default("firing")
    .describe(
      "Filter alerts by status. 'firing' = active alerts (default); 'resolved' = cleared; 'all' = full history."
    ),
})
```

**Returns**: `AlertRecord[]` serialized as JSON.

---

### `open_incident`

**When to use**: Call when a production event requires formal tracking and ownership assignment — after confirming the alert is real and not a transient spike. Do not open duplicate incidents for the same ongoing event.

```ts
schema: z.object({
  title: z
    .string()
    .min(3)
    .describe("Concise title summarizing the incident (min 3 chars, ≤ 120 chars recommended)."),
  service: z
    .string()
    .min(1)
    .describe("Slug or name of the affected service (e.g. 'payment-api', 'auth-service')."),
  severity: z
    .enum(["info", "warning", "critical", "sev1", "sev2", "sev3"])
    .describe(
      "Severity level. 'critical'/'sev1' = production down or data loss risk; " +
      "'warning'/'sev2' = degraded; 'info'/'sev3' = low-impact. sev1→critical, sev2→warning, sev3→info."
    ),
})
```

**Returns**: Created `IncidentRecord` as JSON (includes `id`, `status: "open"`, `openedAt`).

---

### `resolve_incident`

**When to use**: Call when an incident has been mitigated and the service has returned to normal operation. Requires a valid incident ID obtained from `open_incident` or `list_incidents`.

```ts
schema: z.object({
  id: z
    .string()
    .min(1)
    .describe("Unique ID of the incident to resolve (e.g. 'inc-101'). Obtain from open_incident or list_incidents."),
})
```

**Returns (success)**: `{ id, status: "resolved", resolvedAt, message }` as JSON.

**Returns (not found)**: `{ error: "Incident <id> not found" }` as JSON. No exception thrown.

---

## New Tools

### `list_incidents`

**When to use**: Call when the operator asks about active incidents, wants to know if a new incident should be opened (check for duplicates), or needs to review resolved incident history.

```ts
name: "list_incidents"
description:
  "Lista os incidentes operacionais. Use para verificar incidentes ativos antes de abrir um novo, " +
  "ou para revisar histórico. Status: open (padrão, inclui 'open' e 'investigating') | resolved | all."

schema: z.object({
  status: z
    .enum(["open", "resolved", "all"])
    .default("open")
    .describe(
      "Filtro de status. 'open' = incidentes ativos (open + investigating, padrão); " +
      "'resolved' = resolvidos; 'all' = todos."
    ),
})
```

**Returns**: `IncidentRecord[]` serialized as JSON, ordered by `openedAt` descending.

**`"open"` semantics**: Includes incidents with `status = 'open'` **OR** `status = 'investigating'` — both represent active, unresolved operational events.

---

### `consultar_runbook`

**When to use**: Call during an active incident to retrieve structured remediation steps for the affected service. Use the service ID (e.g. `payment-api`) as the identifier.

```ts
name: "consultar_runbook"
description:
  "Retorna o runbook de remediação de um serviço. Use durante um incidente para obter " +
  "os passos estruturados de recuperação. Informe o identificador do serviço (ex: 'payment-api')."

schema: z.object({
  service: z
    .string()
    .min(1)
    .describe(
      "Identificador do serviço (slug). Exemplos: 'payment-api', 'auth-service', 'order-processor'."
    ),
})
```

**Returns (found)**: `{ serviceId, content }` where `content` is markdown-formatted remediation guide.

**Returns (not found)**: `{ error: "Runbook not found for service: <service>" }` as JSON. No exception thrown.

---

## opsTools Array

After this feature the exported `opsTools` array must contain all 5 tools:

```ts
export const opsTools = [
  listAlerts,
  openIncident,
  resolveIncident,
  listIncidents,   // NEW
  consultarRunbook // NEW
];
```
