#!/usr/bin/env node
/**
 * OpsPilot MCP Server
 *
 * Exposes list_alerts, open_incident, and resolve_incident over the stdio
 * transport using the Model Context Protocol.
 *
 * CRITICAL: Never use console.log — stdout is the MCP protocol channel.
 *           All diagnostics go to console.error (stderr).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { store } from "../agents/ops-store.js";
import {
  ListAlertsSchema,
  OpenIncidentSchema,
  ResolveIncidentSchema,
} from "../agents/tools.js";

// ---------------------------------------------------------------------------
// Server identity — version read from package.json (single source of truth)
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf-8")
) as { version: string };

const server = new McpServer({
  name: "opspilot",
  version: pkg.version,
});

// ---------------------------------------------------------------------------
// Tool: list_alerts
// ---------------------------------------------------------------------------

server.registerTool(
  "list_alerts",
  {
    description:
      "Lista alertas de monitoramento. " +
      "Use quando o plantonista perguntar o que está disparando, o estado dos serviços ou 'como está o plantão'. " +
      "Status: 'firing' (ativos, padrão) | 'resolved' (resolvidos) | 'all' (histórico completo).",
    inputSchema: ListAlertsSchema,
  },
  async ({ status }) => {
    const alerts = await store.listAlerts(status ?? "firing");
    return {
      content: [{ type: "text" as const, text: JSON.stringify(alerts) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: open_incident
// ---------------------------------------------------------------------------

server.registerTool(
  "open_incident",
  {
    description:
      "Abre um novo incidente operacional para rastreamento formal. " +
      "Use somente após confirmar que o alerta é real e persistente — não abra duplicatas para o mesmo evento ativo. " +
      "Verifique list_incidents antes de abrir. " +
      "Severidade: 'critical'/'sev1' = produção down; 'warning'/'sev2' = degradação; 'info'/'sev3' = baixo impacto.",
    inputSchema: OpenIncidentSchema,
  },
  async ({ title, service, severity }) => {
    const normalizedSeverity: "info" | "warning" | "critical" =
      severity === "sev1"
        ? "critical"
        : severity === "sev2"
        ? "warning"
        : severity === "sev3"
        ? "info"
        : severity;

    const incident = await store.openIncident({
      title,
      service,
      severity: normalizedSeverity,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(incident) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: resolve_incident
// ---------------------------------------------------------------------------

server.registerTool(
  "resolve_incident",
  {
    description:
      "Resolve um incidente aberto após mitigação confirmada. " +
      "Use quando o serviço retornou ao normal e o evento está encerrado. " +
      "Obtenha o ID via open_incident ou list_incidents.",
    inputSchema: ResolveIncidentSchema,
  },
  async ({ id }) => {
    const resolved = await store.resolveIncident(id);
    if (!resolved) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: `Incident ${id} not found` }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            id: resolved.id,
            status: resolved.status,
            resolvedAt: resolved.resolvedAt,
            message: `Incident ${id} has been successfully resolved.`,
          }),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Connect transport — starts listening on stdin/stdout
// ---------------------------------------------------------------------------

await server.connect(new StdioServerTransport());

console.error("[opspilot-mcp] server running on stdio");
