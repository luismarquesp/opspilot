# Feature Specification: OpsPilot MCP Server

**Feature ID**: 006  
**Short Name**: mcp-server  
**Directory**: `specs/006-mcp-server`  
**Status**: Draft  
**Created**: 2026-09-22  
**Last Updated**: 2026-09-22

---

## Summary

OpsPilot gains a Model Context Protocol (MCP) server entry point (`src/mcp/server.ts`) that exposes a subset of its operational tools — `list_alerts`, `open_incident`, and `resolve_incident` — over the stdio transport. The server reuses the same `OpsStore` singleton and the same Zod schemas already defined for the LangChain tools, making those the single source of truth for both surfaces. The server is named `opspilot` and is launched via `npm run mcp`. No `console.log` is used anywhere in the server; all diagnostic output goes to stderr.

---

## Problem Statement

OpsPilot currently exposes its alert and incident management capabilities only through its own LangChain agent. Operators using MCP-compatible clients (such as Claude Desktop, IDEs with MCP support, or other AI agents) cannot invoke OpsPilot's tools directly. Adding an MCP server lets any MCP client triage alerts, open incidents, and resolve incidents through the standardized protocol — without duplicating schema definitions or storage logic.

---

## User Stories

### US1 (P1): MCP Client Can Discover OpsPilot Tools

**As an** MCP client (e.g. Claude Desktop, an AI coding agent)  
**I want to** connect to the OpsPilot MCP server and list its available tools  
**So that** I can discover what operations are available before invoking them

**Acceptance Criteria**:
- The server starts on stdio transport and responds to the MCP `tools/list` request
- The response includes exactly three tools: `list_alerts`, `open_incident`, `resolve_incident`
- Each tool has a name, description, and input schema matching the existing Zod definitions
- The server does not emit any output to stdout except valid MCP protocol messages

### US2 (P1): MCP Client Can List Alerts

**As an** MCP client  
**I want to** invoke `list_alerts` with an optional status filter  
**So that** I can retrieve current firing, resolved, or all alerts from OpsPilot's store

**Acceptance Criteria**:
- `list_alerts` accepts `{ status?: "firing" | "resolved" | "all" }` (default `"firing"`)
- Response contains the alert records as JSON text content
- Invalid input is rejected with a structured MCP error, not a crash

### US3 (P1): MCP Client Can Open an Incident

**As an** MCP client  
**I want to** invoke `open_incident` with title, service, and severity  
**So that** a new incident is created in OpsPilot's store and returned in the response

**Acceptance Criteria**:
- `open_incident` accepts `{ title: string, service: string, severity: "info" | "warning" | "critical" | "sev1" | "sev2" | "sev3" }`
- The created incident record is returned as JSON text content
- Severity aliases (`sev1` → `critical`, etc.) are normalized consistently with the LangChain tool
- Invalid input (e.g. title shorter than 3 chars) is rejected with a structured MCP error

### US4 (P1): MCP Client Can Resolve an Incident

**As an** MCP client  
**I want to** invoke `resolve_incident` with an incident ID  
**So that** an open incident is closed and confirmation is returned

**Acceptance Criteria**:
- `resolve_incident` accepts `{ id: string }`
- If found, the updated incident is returned with `status: "resolved"` and a `resolvedAt` timestamp
- If the incident does not exist, a structured error result is returned (not a server crash)
- Empty or blank IDs are rejected with a structured MCP error

---

## Functional Requirements

### FR-001: Transport
- The server MUST use the stdio transport exclusively
- stdout MUST carry only MCP protocol messages (JSON-RPC frames)
- All diagnostic, debug, and error output MUST go to stderr
- No `console.log` call is permitted anywhere in `src/mcp/server.ts` or any module it exclusively imports for MCP use

### FR-002: Server Identity
- Server name: `opspilot`
- Server version: read from `package.json` (no hardcoded string)
- Declared during MCP server initialization

### FR-003: Tools Exposed
- Exactly three tools are registered: `list_alerts`, `open_incident`, `resolve_incident`
- Tool names, descriptions, and input schemas are derived from the same Zod schemas used in `src/agents/tools.ts` — no schema duplication
- The `opsTools` array in `src/agents/tools.ts` is NOT used directly for MCP registration (LangChain tool format differs from MCP tool format); schemas are the shared artifact

### FR-004: Single Source of Truth
- Zod schemas (`ListAlertsSchema`, `OpenIncidentSchema`, `ResolveIncidentSchema`) are imported from `src/agents/tools.ts`
- The `store` singleton from `src/agents/ops-store.ts` is imported and reused — no second store instantiation
- Business logic for severity normalization (sev1/sev2/sev3) is applied consistently with the LangChain tool handlers

### FR-005: Error Handling
- Zod validation failures are caught and returned as MCP tool call errors (structured response), not uncaught exceptions
- Store errors (e.g. incident not found) return a readable error in the tool result content, consistent with LangChain tool behaviour
- The server process MUST NOT crash on any tool invocation error

### FR-006: npm Script
- A new script `"mcp": "tsx src/mcp/server.ts"` is added to `package.json`
- If environment variables are needed at startup (e.g. `OPSPILOT_DB`), they are loaded before the server starts via the existing env configuration module, not via dotenv at the MCP layer

### FR-007: Test
- A test suite starts the MCP server as a child process with stdio transport and sends a `tools/list` request
- The test asserts the response contains exactly the three expected tool names
- The test does not require a real MCP client library — it communicates via raw JSON-RPC over stdin/stdout of the child process
- Tests use `OPSPILOT_DB=:memory:` to avoid filesystem side effects

---

## Out of Scope

- Exposing additional tools (`list_incidents`, `consultar_runbook`, `check_provider_status`) — future feature
- HTTP/SSE transport — future feature
- MCP authentication or authorization
- MCP resource or prompt primitives — tools only

---

## User Scenarios & Testing

### Scenario A: Tool discovery
1. MCP client connects to OpsPilot server over stdio
2. Client sends `tools/list` request
3. Server responds with `list_alerts`, `open_incident`, `resolve_incident`
4. Client can inspect input schemas for each tool

### Scenario B: List firing alerts
1. Client sends `tools/call` for `list_alerts` with `{ "status": "firing" }`
2. Server queries OpsStore, returns JSON array of firing alerts as text content
3. Client renders the alert list

### Scenario C: Open incident via MCP
1. Client sends `tools/call` for `open_incident` with `{ "title": "Checkout latency spike", "service": "checkout", "severity": "critical" }`
2. Server creates incident in OpsStore, returns incident JSON as text content

### Scenario D: Resolve incident via MCP
1. Client sends `tools/call` for `resolve_incident` with `{ "id": "inc-101" }`
2. Server marks incident resolved, returns updated record
3. If incident not found, server returns readable error in content (no crash)

### Scenario E: Invalid input rejected
1. Client sends `open_incident` with `{ "title": "x", "service": "svc", "severity": "critical" }` (title too short)
2. Server returns structured MCP tool error with Zod validation message
3. Server continues running and accepts subsequent requests

### Scenario F: stdout purity (no console.log)
1. Server starts and processes several tool calls
2. All stdout output is valid MCP protocol JSON
3. Any diagnostic messages appear only on stderr

---

## Success Criteria

- The server starts and responds to `tools/list` in under 500ms
- All three tools execute correctly against the shared OpsStore
- The server never crashes on malformed tool input
- The automated test passes without network access or external services
- `npm run typecheck` and `npm test` remain green after the feature is added
- No duplication of Zod schemas between `src/agents/tools.ts` and `src/mcp/server.ts`

---

## Key Entities

### McpServer (runtime)
- `name`: `"opspilot"`
- `version`: from `package.json`
- `transport`: `StdioServerTransport`

### Exposed MCP Tool
- `name`: one of `list_alerts | open_incident | resolve_incident`
- `description`: reused from existing tool definitions
- `inputSchema`: JSON Schema derived from existing Zod schema via `zodToJsonSchema` or SDK helper

---

## Assumptions

1. **`@modelcontextprotocol/sdk`** is not yet installed — it must be added as a dependency.
2. **`zod-to-json-schema`** or the SDK's own schema conversion utility will be used to convert Zod schemas to MCP-compatible JSON Schema — no manual schema transcription.
3. **stdio transport** means the server is launched as a subprocess by MCP clients; it does not open a network port.
4. **`package.json` version** is read at runtime with `createRequire` or a static import assertion — no hardcoded version string.
5. **Severity normalization** (sev1→critical, sev2→warning, sev3→info) lives in the MCP handler, identical to the LangChain tool handler — not extracted to a shared utility (acceptable for 3 values).
6. **Test strategy**: the test spawns `tsx src/mcp/server.ts` as a child process, writes a JSON-RPC `tools/list` request to its stdin, reads the response from stdout, and asserts the tool names. No MCP client SDK needed in tests.
7. **`OPSPILOT_DB=:memory:`** is passed to the child process in tests to avoid creating a database file.

---

## Dependencies

- Feature 004 (SQLite OpsStore): provides the `store` singleton and `IOpsStore` interface
- Feature 005 (Provider Status): no dependency — tools from this feature are not exposed via MCP in this iteration
- New npm dependency: `@modelcontextprotocol/sdk`
- Potential new npm dependency: `zod-to-json-schema` (if SDK does not include conversion utility)
