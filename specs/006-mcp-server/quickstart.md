# Quickstart Validation Guide: OpsPilot MCP Server (Feature 006)

## Prerequisites

- `npm install` completed (includes `@modelcontextprotocol/sdk`)
- Node.js 22+
- Optional: `OPSPILOT_DB` env var set (defaults to `./data/opspilot.db`)

---

## 1. Install the SDK

```bash
npm install @modelcontextprotocol/sdk
```

---

## 2. Unit/Integration Tests — No Real MCP Client Required

```bash
$env:OPSPILOT_DB=":memory:"; npm test
```

**What to verify**: `src/mcp/server.test.ts` suite passes:
- ✅ `tools/list` returns exactly 3 tools: `list_alerts`, `open_incident`, `resolve_incident`
- ✅ Server starts and responds without crashing

---

## 3. TypeScript Typecheck

```bash
npm run typecheck
```

**Expected**: Zero errors.

---

## 4. Start the Server Manually

```bash
npm run mcp
```

The server starts and waits on stdin. It is silent on stdout until a client connects and sends a request. All startup diagnostics appear on stderr.

---

## 5. Inspect with MCP Inspector

```bash
npx @modelcontextprotocol/inspector npm run mcp
```

Open the URL shown in terminal. In the Inspector UI:
1. Click "List Tools" → verify `list_alerts`, `open_incident`, `resolve_incident` appear
2. Invoke `list_alerts` with `{ "status": "firing" }` → verify alert array returned
3. Invoke `open_incident` with `{ "title": "Test incident", "service": "checkout", "severity": "critical" }` → verify incident created
4. Invoke `resolve_incident` with the returned incident `id` → verify resolved status

---

## 6. Verify stdout Purity (No console.log)

```bash
npm run mcp 2>/dev/null | head -1
```

**Expected on Windows PowerShell**:
```powershell
npm run mcp 2>$null | Select-Object -First 1
```

The server should output nothing to stdout until a client sends a request. Any line appearing without a client connection indicates an illegal `console.log`.

---

## 7. Claude Desktop Configuration

To wire OpsPilot into Claude Desktop, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "opspilot": {
      "command": "node",
      "args": ["--import", "tsx/esm", "src/mcp/server.ts"],
      "cwd": "/absolute/path/to/ops-pilot"
    }
  }
}
```

Or using `npm`:
```json
{
  "mcpServers": {
    "opspilot": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/ops-pilot"
    }
  }
}
```

---

## Artifact References

- Data model: [data-model.md](./data-model.md)
- Tool contracts: [contracts/mcp-tools.md](./contracts/mcp-tools.md)
- Research decisions: [research.md](./research.md)
