# MCP Tool Contracts: OpsPilot MCP Server (Feature 006)

## Server Identity

| Property | Value |
|----------|-------|
| Protocol | Model Context Protocol (MCP) |
| Transport | stdio (newline-delimited JSON-RPC 2.0) |
| Server name | `opspilot` |
| Server version | from `package.json` |
| SDK | `@modelcontextprotocol/sdk` v1.x |

---

## Tool: `list_alerts`

### Registration
```ts
server.tool(
  "list_alerts",
  "<description from tools.ts>",
  ListAlertsSchema.shape,
  async ({ status }) => { ... }
)
```

### MCP Input Schema (derived automatically by SDK from Zod)
```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["firing", "resolved", "all"],
      "default": "firing",
      "description": "..."
    }
  }
}
```

### MCP Response (success)
```json
{
  "content": [
    { "type": "text", "text": "[{\"id\":\"...\", \"service_id\":\"...\", \"severity\":\"critical\", ...}]" }
  ]
}
```

---

## Tool: `open_incident`

### Registration
```ts
server.tool(
  "open_incident",
  "<description from tools.ts>",
  OpenIncidentSchema.shape,
  async ({ title, service, severity }) => { ... }
)
```

### MCP Input Schema
```json
{
  "type": "object",
  "required": ["title", "service", "severity"],
  "properties": {
    "title":    { "type": "string", "minLength": 3, "description": "..." },
    "service":  { "type": "string", "minLength": 1, "description": "..." },
    "severity": { "type": "string", "enum": ["info","warning","critical","sev1","sev2","sev3"], "description": "..." }
  }
}
```

### MCP Response (success)
```json
{
  "content": [
    { "type": "text", "text": "{\"id\":\"inc-xxx\", \"title\":\"...\", \"status\":\"open\", ...}" }
  ]
}
```

### MCP Response (Zod validation failure)
```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "Validation error: title must be at least 3 characters" }]
}
```

---

## Tool: `resolve_incident`

### Registration
```ts
server.tool(
  "resolve_incident",
  "<description from tools.ts>",
  ResolveIncidentSchema.shape,
  async ({ id }) => { ... }
)
```

### MCP Input Schema
```json
{
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string", "minLength": 1, "description": "..." }
  }
}
```

### MCP Response (success)
```json
{
  "content": [
    { "type": "text", "text": "{\"id\":\"inc-xxx\", \"status\":\"resolved\", \"resolved_at\":\"...\", ...}" }
  ]
}
```

### MCP Response (incident not found)
```json
{
  "content": [
    { "type": "text", "text": "{\"error\": \"Incident inc-999 not found\"}" }
  ]
}
```

---

## JSON-RPC Frame Format (stdio transport)

Each message is a single JSON object on one line, terminated by `\n`:

```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}\n
{"jsonrpc":"2.0","id":1,"result":{...}}\n
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n
{"jsonrpc":"2.0","id":2,"result":{"tools":[...]}}\n
```

---

## `tools/list` Response Shape (validated in tests)

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      { "name": "list_alerts",       "description": "...", "inputSchema": {...} },
      { "name": "open_incident",     "description": "...", "inputSchema": {...} },
      { "name": "resolve_incident",  "description": "...", "inputSchema": {...} }
    ]
  }
}
```

**Test assertion**: `result.tools.map(t => t.name)` must contain exactly `["list_alerts", "open_incident", "resolve_incident"]` (order may vary).

---

## npm Script

```json
"scripts": {
  "mcp": "tsx src/mcp/server.ts"
}
```

**Launch command**: `npm run mcp`  
**With custom DB**: `OPSPILOT_DB=/path/to/db.sqlite npm run mcp`  
**In tests**: `OPSPILOT_DB=:memory: node --import tsx/esm src/mcp/server.ts`
