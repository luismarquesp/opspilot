# Data Model: OpsPilot MCP Server (Feature 006)

## Entities Exposed via MCP

This feature does not define new domain entities. It exposes three existing operational entities through the MCP protocol surface.

---

### 1. MCP Tool: `list_alerts`

| Property | Value |
|----------|-------|
| MCP name | `list_alerts` |
| Description | Same as `listAlerts` LangChain tool description |
| Input schema source | `ListAlertsSchema.shape` from `src/agents/tools.ts` |

**Input**:
```ts
{ status?: "firing" | "resolved" | "all" }  // default: "firing"
```

**Output (MCP content)**:
```ts
[{ type: "text", text: JSON.stringify(alerts) }]
```

---

### 2. MCP Tool: `open_incident`

| Property | Value |
|----------|-------|
| MCP name | `open_incident` |
| Description | Same as `openIncident` LangChain tool description |
| Input schema source | `OpenIncidentSchema.shape` from `src/agents/tools.ts` |

**Input**:
```ts
{ title: string, service: string, severity: "info"|"warning"|"critical"|"sev1"|"sev2"|"sev3" }
```

**Severity normalization** (same as LangChain tool):
- `sev1` → `critical`
- `sev2` → `warning`
- `sev3` → `info`

**Output (MCP content)**:
```ts
[{ type: "text", text: JSON.stringify(incident) }]
```

---

### 3. MCP Tool: `resolve_incident`

| Property | Value |
|----------|-------|
| MCP name | `resolve_incident` |
| Description | Same as `resolveIncident` LangChain tool description |
| Input schema source | `ResolveIncidentSchema.shape` from `src/agents/tools.ts` |

**Input**:
```ts
{ id: string }
```

**Output (success)**:
```ts
[{ type: "text", text: JSON.stringify(resolvedIncident) }]
```

**Output (not found)**:
```ts
[{ type: "text", text: JSON.stringify({ error: "Incident <id> not found" }) }]
```

---

### 4. McpServerConfig (startup configuration)

| Field | Value |
|-------|-------|
| `name` | `"opspilot"` (hardcoded string constant) |
| `version` | Read from `package.json` at startup via `readFileSync` |
| `transport` | `StdioServerTransport` instance |

---

## Single Source of Truth Map

| Artifact | Source file | Used by |
|----------|------------|---------|
| `ListAlertsSchema` | `src/agents/tools.ts` | LangChain tool + MCP tool |
| `OpenIncidentSchema` | `src/agents/tools.ts` | LangChain tool + MCP tool |
| `ResolveIncidentSchema` | `src/agents/tools.ts` | LangChain tool + MCP tool |
| `store` singleton | `src/agents/ops-store.ts` | LangChain tools + MCP server |
| Domain entities (Alert, Incident, etc.) | `src/models/store.ts` | All surfaces |

## No Persistence Changes

This feature does not add or modify any SQLite tables. The existing `SqliteOpsStore` and `IOpsStore` interface are unchanged.
