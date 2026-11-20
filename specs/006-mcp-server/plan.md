# Implementation Plan: OpsPilot MCP Server

**Branch**: `006-mcp-server` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

---

## Summary

Add an MCP server entry point at `src/mcp/server.ts` using `@modelcontextprotocol/sdk` v1.x with stdio transport. The server registers `list_alerts`, `open_incident`, and `resolve_incident` by importing and reusing the existing Zod schema `.shape` from `src/agents/tools.ts` and the `store` singleton from `src/agents/ops-store.ts`. No new domain logic is introduced. A child-process test validates `tools/list` using raw JSON-RPC without a real MCP client library. A `"mcp"` npm script is added to `package.json`.

---

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22 LTS, ESM strict  
**New dependency**: `@modelcontextprotocol/sdk@^1.30.0`  
**No other new dependencies**

**SDK API pattern**:
```ts
import { McpServer }           from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "opspilot", version: pkg.version });

server.tool(
  "list_alerts",
  description,
  ListAlertsSchema.shape,   // ← .shape from existing Zod schema
  async ({ status }) => ({ content: [{ type: "text", text: "..." }] })
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Critical constraint**: Zero `console.log` — all diagnostics via `console.error()`.

---

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Pure Functions & MVC | ✅ PASS | MCP server is a controller boundary |
| II. Strict Boundary Validation (Zod) | ✅ PASS | SDK validates tool inputs via Zod before handler |
| III. Test-First & Quality Gates | ✅ PASS | Child-process test; typecheck + test must be green |
| IV. Secret & Environment Safety | ✅ PASS | `OPSPILOT_DB` via existing env; no `.env` read |
| V. Agent-Centric Orchestration | ✅ N/A | Parallel MCP surface, not an agent |
| SQLite / node:sqlite | ✅ PASS | Reuses existing `store` singleton |

No violations.

---

## Project Structure After Feature

```text
src/
├── agents/
│   ├── tools.ts            [no change]  Source of Zod schemas — single source of truth
│   └── ops-store.ts        [no change]  Source of store singleton
└── mcp/
    ├── server.ts           [NEW]        MCP entry point
    └── server.test.ts      [NEW]        tools/list child-process test

specs/006-mcp-server/       [NEW]        All design artifacts
package.json                [MODIFY]     Add dependency + "mcp" script
```

---

## Detailed Change Descriptions

### `package.json` — Modify

**Add dependency**:
```json
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.30.0"
}
```

**Add script**:
```json
"scripts": {
  "mcp": "tsx src/mcp/server.ts"
}
```

---

### `src/mcp/server.ts` — New File

**Responsibilities**:
1. Read `version` from `package.json` via `readFileSync`
2. Create `McpServer({ name: "opspilot", version })`
3. Register three tools reusing `.shape` from imported Zod schemas
4. For `open_incident`: normalize severity aliases (sev1→critical, sev2→warning, sev3→info)
5. For `resolve_incident`: handle `null` return from `store.resolveIncident()` gracefully
6. Create `StdioServerTransport` and call `server.connect(transport)`
7. Use `console.error()` for all diagnostics — ZERO `console.log`

**Imports**:
```ts
import { McpServer }           from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync }         from "node:fs";
import { fileURLToPath }        from "node:url";
import { dirname, resolve }     from "node:path";
import { store }                from "../agents/ops-store.js";
import {
  ListAlertsSchema,
  OpenIncidentSchema,
  ResolveIncidentSchema,
} from "../agents/tools.js";
```

**Tool descriptions**: Imported from the same description strings used in `tools.ts` (or duplicated minimally — the schema is the critical shared artifact).

---

### `src/mcp/server.test.ts` — New File

**Strategy**: Spawn child process → raw JSON-RPC over stdin/stdout → assert `tools/list` response.

**Test flow**:
1. `spawn("node", ["--import", "tsx/esm", "src/mcp/server.ts"], { env: { ...process.env, OPSPILOT_DB: ":memory:" } })`
2. Write MCP `initialize` request to child's stdin
3. Write `tools/list` request to child's stdin
4. Read stdout line-by-line using `readline.createInterface`
5. Parse each line as JSON-RPC; find response with `id === 2`
6. Assert `result.tools` has exactly 3 tools with the correct names
7. Kill child process; test completes

**Test assertions**:
- `tools.length === 3`
- `tools.map(t => t.name)` includes `"list_alerts"`, `"open_incident"`, `"resolve_incident"`
- No line on stdout is not valid JSON (purity check)

---

## Test Plan

| Test | Method | Expected |
|------|--------|----------|
| `tools/list` returns 3 tools | Child process + raw JSON-RPC | 3 tool names match |
| Server starts without crashing | Child process exits cleanly after test | No stderr error lines |
| stdout is valid JSON | Parse every line from child stdout | No parse errors |

---

## Verification Plan

### Automated Tests
```bash
$env:OPSPILOT_DB=":memory:"; npm test
npm run typecheck
```

### Manual Verification
1. `npm run mcp` — server starts, waits silently on stdin
2. `npx @modelcontextprotocol/inspector npm run mcp` — validate all 3 tools in browser UI
3. Invoke `list_alerts`, `open_incident`, `resolve_incident` via Inspector
4. Confirm stdout purity: no non-protocol output

### Quality Gates
- `npm run typecheck` → 0 errors
- `npm test` → all tests pass (including new `server.test.ts`)
- All existing 148 tests remain green
