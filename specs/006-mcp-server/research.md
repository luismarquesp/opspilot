# Research: OpsPilot MCP Server (Feature 006)

## 1. `@modelcontextprotocol/sdk` — Version & Import Paths

**Decision**: Install `@modelcontextprotocol/sdk@^1.30.0`.

**Import paths (ESM)**:
```ts
import { McpServer }           from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
```

**No additional packages needed** (`zod-to-json-schema` is NOT required — the SDK accepts Zod schemas natively).

---

## 2. `server.tool()` API — Zod Schema Integration

**Decision**: Use `server.tool(name, description, zodShape, handler)`.

The SDK's `McpServer.tool()` method accepts a raw Zod **shape object** (the argument to `z.object()`), not a `z.object()` instance. To reuse existing schemas from `tools.ts`, access `.shape`:

```ts
import { ListAlertsSchema, OpenIncidentSchema, ResolveIncidentSchema } from "../agents/tools.js";

server.tool(
  "list_alerts",
  "Lists alerts...",
  ListAlertsSchema.shape,       // ← .shape gives the raw Zod object definition
  async ({ status }) => { ... }
);
```

**Automatic behaviour**:
- SDK validates incoming tool arguments against the Zod schema before calling the handler
- SDK converts Zod schema to JSON Schema for `tools/list` response automatically
- `.describe()` annotations on Zod fields are preserved and surfaced to MCP clients

**Alternative considered**: Passing full `z.object()` instance — works in some SDK versions but `.shape` is more robust and version-stable. Rejected for ambiguity.

---

## 3. Server Version from `package.json`

**Decision**: Read at startup with `readFileSync` + `JSON.parse` via ESM-compatible URL resolution.

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8")) as { version: string };

const server = new McpServer({ name: "opspilot", version: pkg.version });
```

**Alternatives considered**:
- Hardcoded version string: rejected (maintenance burden, violates single source of truth)
- Dynamic `import()` of JSON: requires `"resolveJsonModule": true` in tsconfig and `--experimental-vm-modules` — rejected (added complexity)

---

## 4. stdio Transport — `console.log` Ban

**Decision**: Zero `console.log` in `src/mcp/server.ts` and all modules it imports exclusively for MCP use.

**Rule**: stdout = MCP JSON-RPC protocol frames only. Any log to stdout corrupts the JSON-RPC framing and breaks client parsing.

**Pattern**:
```ts
console.error("[opspilot-mcp] server started"); // ✅ stderr — safe
console.log("something");                        // ❌ NEVER — corrupts protocol
```

The `StdioServerTransport` writes to `process.stdout` directly; any interleaved `console.log` output will corrupt the stream.

---

## 5. Test Strategy — Raw JSON-RPC over Child Process stdin/stdout

**Decision**: Spawn the server as a child process; communicate via raw JSON-RPC framing.

MCP stdio uses newline-delimited JSON-RPC. The test:

1. Spawns `node --import tsx/esm src/mcp/server.ts` (or via tsx) with `OPSPILOT_DB=:memory:`
2. Sends MCP initialize handshake to stdin (required before `tools/list`)
3. Sends `tools/list` request
4. Reads stdout line-by-line, parses JSON-RPC responses
5. Finds the `tools/list` response, asserts tool names

**JSON-RPC message framing**: Each message is a single JSON object terminated by `\n`.

**Initialize handshake** (required by MCP protocol before any other request):
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
```

**tools/list request**:
```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

**Expected response** (partial):
```json
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"list_alerts",...},{"name":"open_incident",...},{"name":"resolve_incident",...}]}}
```

**No MCP client SDK in tests** — only `node:child_process`, `node:readline`, and `node:test`.

---

## 6. Severity Normalization in MCP Handler

**Decision**: Inline the normalization (sev1→critical, sev2→warning, sev3→info) in the MCP `open_incident` handler — same logic as LangChain tool handler.

**Rationale**: The three-value mapping is too simple to justify a shared utility. Both surfaces (LangChain + MCP) can independently own the same 3-line `switch`/ternary without meaningful duplication risk.

---

## 7. Constitution Compliance

| Principle | Status |
|-----------|--------|
| I. Pure Functions & MVC | ✅ PASS | MCP server is a controller boundary; store and schemas are shared domain |
| II. Strict Boundary Validation (Zod) | ✅ PASS | SDK validates tool inputs using Zod schema before handler runs |
| III. Test-First & Quality Gates | ✅ PASS | Child-process test validates tools/list without real MCP client |
| IV. Secret & Environment Safety | ✅ PASS | `OPSPILOT_DB` loaded via existing env module; no `.env` reads |
| V. Agent-Centric Orchestration | ✅ N/A | MCP server is a parallel surface, not an agent |
| No console.log on stdout | ✅ PASS | FR-001 enforced; only `console.error()` permitted |

---

## 8. File Architecture

```
src/
└── mcp/
    ├── server.ts        [NEW]  MCP server entry point
    └── server.test.ts   [NEW]  Child-process tools/list test
```

**No changes to any existing file except**:
- `package.json`: add `"mcp"` script and `@modelcontextprotocol/sdk` dependency
