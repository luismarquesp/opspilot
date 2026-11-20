import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, "server.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function spawnServer() {
  return spawn(
    "node",
    ["--import", "tsx/esm", SERVER_PATH],
    {
      env: { ...process.env, OPSPILOT_DB: ":memory:" },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
}

const INITIALIZE_MSG = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0" },
  },
}) + "\n";

const INITIALIZED_NOTIFICATION = JSON.stringify({
  jsonrpc: "2.0",
  method: "notifications/initialized",
  params: {},
}) + "\n";

function makeToolsListMsg(id: number) {
  return JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list", params: {} }) + "\n";
}

function makeToolCallMsg(id: number, name: string, args: Record<string, unknown>) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  }) + "\n";
}

async function collectResponses(
  proc: ReturnType<typeof spawnServer>,
  targetIds: number[],
  timeoutMs = 20000
): Promise<Map<number, JsonRpcResponse>> {
  const results = new Map<number, JsonRpcResponse>();
  const rl = createInterface({ input: proc.stdout! });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      rl.close();
      reject(new Error(`Timeout waiting for response ids: ${targetIds.filter(id => !results.has(id)).join(", ")}`));
    }, timeoutMs);

    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id !== undefined && targetIds.includes(msg.id)) {
          results.set(msg.id, msg);
          if (targetIds.every(id => results.has(id))) {
            clearTimeout(timer);
            rl.close();
            resolve(results);
          }
        }
      } catch {
        // ignore non-JSON lines (MCP can emit notification messages)
      }
    });

    proc.stdout!.on("end", () => {
      clearTimeout(timer);
      if (targetIds.every(id => results.has(id))) {
        resolve(results);
      } else {
        reject(new Error("stdout closed before all responses received"));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// US1 — Tool Discovery via tools/list
// ---------------------------------------------------------------------------

test("MCP Server — tools/list (US1)", async (t) => {
  await t.test("tools/list returns exactly 3 tools", async () => {
    const proc = spawnServer();
    try {
      const collector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolsListMsg(2));

      const responses = await collector;
      const toolsListResp = responses.get(2)!;
      assert.ok(toolsListResp.result, "tools/list must have result");
      const tools = toolsListResp.result!["tools"] as McpTool[];
      assert.equal(tools.length, 3, `Expected 3 tools, got ${tools.length}: ${tools.map(t => t.name).join(", ")}`);
    } finally {
      proc.kill();
    }
  });

  await t.test("tools/list returns list_alerts, open_incident, resolve_incident", async () => {
    const proc = spawnServer();
    try {
      const collector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolsListMsg(2));

      const responses = await collector;
      const tools = responses.get(2)!.result!["tools"] as McpTool[];
      const names = tools.map(t => t.name);
      assert.ok(names.includes("list_alerts"), `Missing list_alerts; got: ${names.join(", ")}`);
      assert.ok(names.includes("open_incident"), `Missing open_incident; got: ${names.join(", ")}`);
      assert.ok(names.includes("resolve_incident"), `Missing resolve_incident; got: ${names.join(", ")}`);
    } finally {
      proc.kill();
    }
  });

  await t.test("stdout emits only valid JSON lines (stdout purity)", async () => {
    const proc = spawnServer();
    const lines: string[] = [];
    const rl = createInterface({ input: proc.stdout! });
    rl.on("line", l => { if (l.trim()) lines.push(l.trim()); });

    try {
      const collector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolsListMsg(2));
      await collector;

      for (const line of lines) {
        try { JSON.parse(line); } catch {
          assert.fail(`Non-JSON line on stdout: ${line}`);
        }
      }
    } finally {
      rl.close();
      proc.kill();
    }
  });
});

// ---------------------------------------------------------------------------
// US2 — list_alerts handler
// ---------------------------------------------------------------------------

test("MCP Server — list_alerts (US2)", async (t) => {
  await t.test("list_alerts with status=firing returns JSON array in content", async () => {
    const proc = spawnServer();
    try {
      const collector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolCallMsg(2, "list_alerts", { status: "firing" }));

      const responses = await collector;
      const result = responses.get(2)!.result!;
      const content = result["content"] as Array<{ type: string; text: string }>;
      assert.ok(content, "content must be present");
      assert.equal(content[0].type, "text");
      const alerts = JSON.parse(content[0].text);
      assert.ok(Array.isArray(alerts), "content text must be a JSON array");
    } finally {
      proc.kill();
    }
  });

  await t.test("list_alerts with no params defaults to firing", async () => {
    const proc = spawnServer();
    try {
      const collector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolCallMsg(2, "list_alerts", {}));

      const responses = await collector;
      const content = responses.get(2)!.result!["content"] as Array<{ type: string; text: string }>;
      const alerts = JSON.parse(content[0].text);
      assert.ok(Array.isArray(alerts));
    } finally {
      proc.kill();
    }
  });

  await t.test("list_alerts with status=all returns non-empty array (seeded data)", async () => {
    const proc = spawnServer();
    try {
      const collector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolCallMsg(2, "list_alerts", { status: "all" }));

      const responses = await collector;
      const content = responses.get(2)!.result!["content"] as Array<{ type: string; text: string }>;
      const alerts = JSON.parse(content[0].text);
      assert.ok(Array.isArray(alerts));
      assert.ok(alerts.length >= 1, "Expected at least 1 alert from seeded data");
    } finally {
      proc.kill();
    }
  });
});

// ---------------------------------------------------------------------------
// US3 — open_incident handler
// ---------------------------------------------------------------------------

test("MCP Server — open_incident (US3)", async (t) => {
  await t.test("open_incident creates incident with status=open", async () => {
    const proc = spawnServer();
    try {
      const collector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolCallMsg(2, "open_incident", {
        title: "Checkout latency spike",
        service: "checkout",
        severity: "critical",
      }));

      const responses = await collector;
      const content = responses.get(2)!.result!["content"] as Array<{ type: string; text: string }>;
      const incident = JSON.parse(content[0].text);
      assert.equal(incident.status, "open");
      assert.ok(incident.id, "incident must have an id");
    } finally {
      proc.kill();
    }
  });

  await t.test("open_incident normalizes sev1 to critical", async () => {
    const proc = spawnServer();
    try {
      const collector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolCallMsg(2, "open_incident", {
        title: "Auth service down",
        service: "auth-service",
        severity: "sev1",
      }));

      const responses = await collector;
      const content = responses.get(2)!.result!["content"] as Array<{ type: string; text: string }>;
      const incident = JSON.parse(content[0].text);
      assert.equal(incident.severity, "critical");
    } finally {
      proc.kill();
    }
  });

  await t.test("open_incident with short title is rejected gracefully", async () => {
    const proc = spawnServer();
    try {
      const collector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolCallMsg(2, "open_incident", {
        title: "x",
        service: "svc",
        severity: "critical",
      }));

      const responses = await collector;
      const resp = responses.get(2)!;
      // Either an error field OR isError in content — must not crash server
      const hasError = resp.error != null ||
        (resp.result?.["isError"] === true) ||
        (resp.result?.["content"] as Array<{ text: string }> | undefined)?.[0]?.text?.toLowerCase().includes("error");
      assert.ok(hasError, "Short title must produce a validation error response");
    } finally {
      proc.kill();
    }
  });
});

// ---------------------------------------------------------------------------
// US4 — resolve_incident handler
// ---------------------------------------------------------------------------

test("MCP Server — resolve_incident (US4)", async (t) => {
  await t.test("resolve_incident returns resolved incident", async () => {
    const proc = spawnServer();
    try {
      // First open an incident
      const openCollector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolCallMsg(2, "open_incident", {
        title: "Payment API 5xx spike",
        service: "payment-api",
        severity: "critical",
      }));

      const openResponses = await openCollector;
      const openContent = openResponses.get(2)!.result!["content"] as Array<{ text: string }>;
      const openedIncident = JSON.parse(openContent[0].text);
      const incidentId = openedIncident.id as string;

      // Now resolve it
      const resolveCollector = collectResponses(proc, [3]);
      proc.stdin!.write(makeToolCallMsg(3, "resolve_incident", { id: incidentId }));

      const resolveResponses = await resolveCollector;
      const resolveContent = resolveResponses.get(3)!.result!["content"] as Array<{ text: string }>;
      const resolved = JSON.parse(resolveContent[0].text);
      assert.equal(resolved.status, "resolved");
    } finally {
      proc.kill();
    }
  });

  await t.test("resolve_incident with unknown id returns readable error in content", async () => {
    const proc = spawnServer();
    try {
      const collector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolCallMsg(2, "resolve_incident", { id: "inc-does-not-exist" }));

      const responses = await collector;
      const content = responses.get(2)!.result!["content"] as Array<{ text: string }>;
      const result = JSON.parse(content[0].text);
      assert.ok(result.error, "Must return error field for unknown incident");
    } finally {
      proc.kill();
    }
  });

  await t.test("resolve_incident with empty id is rejected gracefully", async () => {
    const proc = spawnServer();
    try {
      const collector = collectResponses(proc, [1, 2]);
      proc.stdin!.write(INITIALIZE_MSG);
      proc.stdin!.write(INITIALIZED_NOTIFICATION);
      proc.stdin!.write(makeToolCallMsg(2, "resolve_incident", { id: "" }));

      const responses = await collector;
      const resp = responses.get(2)!;
      const hasError = resp.error != null ||
        resp.result?.["isError"] === true ||
        (resp.result?.["content"] as Array<{ text: string }> | undefined)?.[0]?.text?.toLowerCase().includes("error");
      assert.ok(hasError, "Empty id must produce a validation error response");
    } finally {
      proc.kill();
    }
  });
});
