import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { store } from "./ops-store.js";
import { checkProviderStatus } from "./provider-status.js";
import type { IMemoryStore } from "../models/memory.js";
import { getDefaultMemoryStore } from "../memory/memory-store.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const ListAlertsSchema = z.object({
  status: z
    .enum(["firing", "resolved", "all"])
    .default("firing")
    .describe(
      "Filtro de status dos alertas. " +
        "'firing' = ativos disparando (padrão); " +
        "'resolved' = já resolvidos; " +
        "'all' = histórico completo."
    ),
});

export const OpenIncidentSchema = z.object({
  title: z
    .string()
    .min(3)
    .describe(
      "Título conciso do incidente (mín. 3 chars). Ex: 'Payment API 5xx acima de 15% em /v1/charges'."
    ),
  service: z
    .string()
    .min(1)
    .describe(
      "Identificador (slug) do serviço afetado. Ex: 'payment-api', 'auth-service', 'order-processor'."
    ),
  severity: z
    .enum(["info", "warning", "critical", "sev1", "sev2", "sev3"])
    .describe(
      "Severidade do incidente. " +
        "'critical'/'sev1' = produção indisponível ou risco de perda de dados; " +
        "'warning'/'sev2' = degradação parcial; " +
        "'info'/'sev3' = baixo impacto. " +
        "sev1→critical, sev2→warning, sev3→info."
    ),
});

export const ResolveIncidentSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      "ID único do incidente a resolver (ex: 'inc-101'). " +
        "Obtenha o ID via open_incident ou list_incidents."
    ),
});

export const ListIncidentsSchema = z.object({
  status: z
    .enum(["open", "resolved", "all"])
    .default("open")
    .describe(
      "Filtro de status dos incidentes. " +
        "'open' = ativos (open + investigating, padrão); " +
        "'resolved' = encerrados; " +
        "'all' = todos os registros."
    ),
});

export const ConsultarRunbookSchema = z.object({
  service: z
    .string()
    .min(1)
    .describe(
      "Identificador (slug) do serviço. " +
        "Exemplos: 'payment-api', 'auth-service', 'order-processor'."
    ),
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const listAlerts = tool(
  async ({ status }) => {
    const alerts = await store.listAlerts(status);
    return JSON.stringify(alerts);
  },
  {
    name: "list_alerts",
    description:
      "Lista alertas de monitoramento. " +
      "Use quando o plantonista perguntar o que está disparando, o estado dos serviços ou 'como está o plantão'. " +
      "Status: 'firing' (ativos, padrão) | 'resolved' (resolvidos) | 'all' (histórico completo).",
    schema: ListAlertsSchema,
  }
);

export const openIncident = tool(
  async ({ title, service, severity }) => {
    const normalizedSeverity: "info" | "warning" | "critical" =
      severity === "sev1"
        ? "critical"
        : severity === "sev2"
        ? "warning"
        : severity === "sev3"
        ? "info"
        : severity;

    const incident = await store.openIncident({ title, service, severity: normalizedSeverity });
    return JSON.stringify(incident);
  },
  {
    name: "open_incident",
    description:
      "Abre um novo incidente operacional para rastreamento formal. " +
      "Use somente após confirmar que o alerta é real e persistente — não abra duplicatas para o mesmo evento ativo. " +
      "Verifique list_incidents antes de abrir. " +
      "Severidade: 'critical'/'sev1' = produção down; 'warning'/'sev2' = degradação; 'info'/'sev3' = baixo impacto.",
    schema: OpenIncidentSchema,
  }
);

export const resolveIncident = tool(
  async ({ id }) => {
    const resolved = await store.resolveIncident(id);
    if (!resolved) {
      return JSON.stringify({ error: `Incident ${id} not found` });
    }
    return JSON.stringify({
      id: resolved.id,
      status: resolved.status,
      resolvedAt: resolved.resolvedAt,
      message: `Incident ${id} has been successfully resolved.`,
    });
  },
  {
    name: "resolve_incident",
    description:
      "Resolve um incidente aberto após mitigação confirmada. " +
      "Use quando o serviço retornou ao normal e o evento está encerrado. " +
      "Obtenha o ID via open_incident ou list_incidents.",
    schema: ResolveIncidentSchema,
  }
);

export const listIncidents = tool(
  async ({ status }) => {
    const incidents = await store.listIncidents(status);
    return JSON.stringify(incidents);
  },
  {
    name: "list_incidents",
    description:
      "Lista incidentes operacionais. " +
      "Use para verificar incidentes ativos antes de abrir um novo (evitar duplicatas) " +
      "ou para revisar histórico de resoluções. " +
      "Status: 'open' (ativos = open + investigating, padrão) | 'resolved' | 'all'.",
    schema: ListIncidentsSchema,
  }
);

export const consultarRunbook = tool(
  async ({ service }) => {
    const runbook = await store.getRunbook(service);
    if (!runbook) {
      return JSON.stringify({ error: `Runbook not found for service: ${service}` });
    }
    return JSON.stringify({ serviceId: runbook.serviceId, content: runbook.content });
  },
  {
    name: "consultar_runbook",
    description:
      "Retorna o runbook de remediação de um serviço. " +
      "Use durante um incidente ativo para obter passos estruturados de recuperação. " +
      "Informe o slug do serviço (ex: 'payment-api', 'auth-service', 'order-processor').",
    schema: ConsultarRunbookSchema,
  }
);

export const CheckProviderStatusSchema = z.object({
  provider: z
    .enum(["github", "cloudflare"])
    .default("github")
    .describe(
      "Provedor externo a consultar. " +
        "'github' = GitHub (Actions, API, Pages, Packages); " +
        "'cloudflare' = Cloudflare (CDN, DNS, Workers). " +
        "Padrão: 'github'."
    ),
});

export const checkProviderStatusTool = tool(
  async ({ provider }) => checkProviderStatus(provider),
  {
    name: "check_provider_status",
    description:
      "Consulta o status público de um provedor externo (GitHub ou Cloudflare). " +
      "Use quando suspeitar que um problema externo está causando falhas — " +
      "'é nosso ou do provedor?', dependência fora do ar, ou antes de escalar um incidente. " +
      "Retorna: indicador + descrição em uma linha (ex: 'github está none — All Systems Operational'). " +
      "Em caso de falha, orienta o plantonista a usar alertas internos.",
    schema: CheckProviderStatusSchema,
  }
);

export const ForgetPreferenceSchema = z.object({
  queryOrId: z
    .string()
    .min(1)
    .describe(
      "Fato, descrição ou palavra-chave da preferência a esquecer, ou o ID numérico da memória (ex: 'auth-service', 'alertas críticos', '1')."
    ),
  userId: z
    .string()
    .optional()
    .describe(
      "Identificador do usuário cujas preferências devem ser esquecidas. Se omitido, utiliza 'default'."
    ),
});

export function createForgetPreferenceTool(memoryStore: IMemoryStore = getDefaultMemoryStore()) {
  return tool(
    async ({ queryOrId, userId = "default" }) => {
      const isNumeric = /^\d+$/.test(queryOrId.trim());

      if (isNumeric) {
        const id = parseInt(queryOrId.trim(), 10);
        const deleted = await memoryStore.forget(userId, id);
        if (deleted) {
          return `Preferência com ID ${id} foi esquecida com sucesso.`;
        }
        return `Nenhuma preferência encontrada com ID ${id} para o usuário ${userId}.`;
      }

      // Natural language semantic recall
      const matches = await memoryStore.recall(userId, queryOrId, 1, 0.3);
      if (matches.length === 0) {
        return `Nenhuma preferência correspondente encontrada para "${queryOrId}".`;
      }

      const topMatch = matches[0];
      const deleted = await memoryStore.forget(userId, topMatch.id);
      if (deleted) {
        return `Preferência esquecida com sucesso: "${topMatch.fact}".`;
      }
      return `Falha ao remover a preferência "${topMatch.fact}".`;
    },
    {
      name: "forget_preference",
      description:
        "Esquece ou revoga uma preferência ou fato operacional previamente aprendido sobre o usuário. " +
        "Pode receber o ID numérico da memória ou uma busca semântica em linguagem natural (ex: 'auth-service', 'alertas críticos').",
      schema: ForgetPreferenceSchema,
    }
  );
}

export const forgetPreference = createForgetPreferenceTool();

export const opsTools = [
  listAlerts,
  openIncident,
  resolveIncident,
  listIncidents,
  consultarRunbook,
  checkProviderStatusTool,
  forgetPreference,
];

