import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import { z } from "zod";
import { createModel } from "./model.js";
import { listAlerts, openIncident, resolveIncident } from "./tools.js";
import { store } from "./ops-store.js";
import type { ReasoningStrategy, StrategyOptions, StrategyResult, TraceEvent } from "./types.js";
import { buildContext } from "../context/context-builder.js";

// Estado de referência
export const PEState = Annotation.Root({
  input: Annotation<string>(),
  plan: Annotation<string[]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),
  done: Annotation<[string, string][]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  answer: Annotation<string | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
  trace: Annotation<TraceEvent[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  llmCalls: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),
  maxSteps: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 8,
  }),
  noReplanner: Annotation<boolean | undefined>({
    reducer: (_a, b) => b,
    default: () => false,
  }),
});

export type PlanExecuteStateType = typeof PEState.State;

// Schemas do Planner e Replanner
export const planSchema = z.object({
  steps: z.array(z.string()).describe("Passos curtos, ordenados, executáveis com as ferramentas disponíveis"),
});

export const replannerSchema = z.object({
  action: z
    .enum(["seguir", "ajustar", "encerrar"])
    .describe("Ação a ser tomada pelo replanejador: seguir, ajustar ou encerrar"),
  remainingSteps: z
    .array(z.string())
    .optional()
    .describe("Lista atualizada de passos restantes quando a ação for 'ajustar'"),
  answer: z
    .string()
    .optional()
    .describe("Resposta final de síntese quando a ação for 'encerrar'"),
});

export const PLANNER_PROMPT = `Você é o planejador de operações do OpsPilot, copiloto de plantão para gerenciar alertas e incidentes de produção.
Dada a solicitação do usuário, crie um plano com passos curtos, ordenados e executáveis com as ferramentas disponíveis:
- list_alerts: lista os alertas de monitoramento (firing, resolved, all)
- open_incident: abre um novo incidente operacional (title, service, severity)
- resolve_incident: resolve um incidente aberto pelo ID (id)
Gere apenas passos diretos e operacionais.`;

export const REPLANNER_PROMPT = `Você é o replanejador operacional do OpsPilot.
Avalie o progresso dos passos já executados e os passos restantes.
Decida se deve:
- 'seguir' (continuar com os próximos passos restantes sem alterações)
- 'ajustar' (modificar ou adicionar novos passos baseado nas observações)
- 'encerrar' (concluir a tarefa e sintetizar a resposta final)`;

export function parseStepToolExecution(step: string): { tool: string; args: Record<string, unknown> } | null {
  const lower = step.toLowerCase();
  if (lower.includes("resolve") || lower.includes("resolver")) {
    const idMatch = step.match(/inc-\d+/i);
    let targetId = idMatch ? idMatch[0].toLowerCase() : "";
    if (!targetId) {
      const allInc = store.listIncidents();
      const firstInc = Array.isArray(allInc) && allInc.length > 0 ? allInc[0] : null;
      targetId = firstInc ? firstInc.id : "inc-101";
    }
    return {
      tool: "resolve_incident",
      args: { id: targetId },
    };
  }
  if (lower.includes("alert") || lower.includes("alerta") || lower.includes("firing") || lower.includes("list") || lower.includes("listar")) {
    return {
      tool: "list_alerts",
      args: {
        status:
          lower.includes("resolved") || lower.includes("resolvido")
            ? "resolved"
            : lower.includes("all") || lower.includes("todos")
            ? "all"
            : "firing",
      },
    };
  }
  if (lower.includes("open") || lower.includes("abrir") || lower.includes("incident") || lower.includes("incidente") || lower.includes("criar incidente")) {
    let service = "payment-api";
    if (lower.includes("checkout")) service = "checkout";
    else if (lower.includes("catalog") || lower.includes("catálogo")) service = "catalog";
    else if (lower.includes("payment-api")) service = "payment-api";
    else if (lower.includes("payment") || lower.includes("pagamento")) service = "payment";
    else if (lower.includes("database") || lower.includes("banco")) service = "database-cluster";
    else if (lower.includes("order") || lower.includes("pedido")) service = "order-processor";
    else if (lower.includes("auth")) service = "auth-service";
    else {
      const match = step.match(/(?:para|for|serviço|service)\s+([a-zA-Z0-9_-]+)/i);
      if (match && match[1]) service = match[1];
    }

    let severity: "info" | "warning" | "critical" = "critical";
    if (lower.includes("sev2") || lower.includes("warning") || lower.includes("média") || lower.includes("media")) {
      severity = "warning";
    } else if (lower.includes("sev3") || lower.includes("sev4") || lower.includes("info") || lower.includes("baixa")) {
      severity = "info";
    }

    if ((lower.includes("mais antigo") || lower.includes("oldest")) && service === "payment-api") {
      const alerts = store.listAlerts("firing");
      if (Array.isArray(alerts) && alerts.length > 0) {
        const sorted = [...alerts].sort(
          (a, b) => new Date(a.triggeredAt).getTime() - new Date(b.triggeredAt).getTime()
        );
        service = sorted[0].serviceName || sorted[0].serviceId || "payment-api";
      }
    }

    return {
      tool: "open_incident",
      args: {
        title: `Incidente operacional para ${service}`,
        service,
        severity,
      },
    };
  }
  return null;
}

export async function planner(
  state: typeof PEState.State,
  customPlanner?: (input: string) => Promise<string[]>
) {
  let steps: string[];
  let llmCalls = 0;

  if (customPlanner) {
    steps = await customPlanner(state.input);
  } else {
    try {
      const plan = await createModel().withStructuredOutput(planSchema).invoke([
        ["system", PLANNER_PROMPT],
        ["user", state.input],
      ]);
      steps = plan.steps;
      llmCalls = 1;
    } catch {
      steps = [
        "Listar alertas disparando para identificar serviços afetados",
        "Abrir incidente crítico para o serviço afetado",
        "Sintetizar status da mitigação do plantão",
      ];
    }
  }

  const planContent = steps.map((s, idx) => `${idx + 1}. ${s}`).join(" ");
  const traceEvent: TraceEvent = {
    type: "plan",
    node: "plan-and-execute",
    content: planContent,
    timestamp: Date.now(),
  };

  return {
    plan: steps,
    trace: [traceEvent],
    llmCalls,
  };
}

export async function executor(state: typeof PEState.State) {
  const currentStep = state.plan[0] ?? "Sintetizar achados operacionais";
  const traceEvents: TraceEvent[] = [];
  let result = "Passo executado com sucesso.";

  traceEvents.push({
    type: "thought",
    node: "plan-and-execute",
    content: `Executando passo: ${currentStep}`,
    timestamp: Date.now(),
  });

  const parsedTool = parseStepToolExecution(currentStep);
  if (parsedTool) {
    traceEvents.push({
      type: "action",
      node: "plan-and-execute",
      tool: parsedTool.tool,
      args: parsedTool.args,
      content: `Call ${parsedTool.tool}`,
      timestamp: Date.now(),
    });

    try {
      if (parsedTool.tool === "list_alerts") {
        result = await listAlerts.invoke(parsedTool.args as { status: "firing" | "resolved" | "all" });
      } else if (parsedTool.tool === "open_incident") {
        result = await openIncident.invoke(
          parsedTool.args as { title: string; service: string; severity: "info" | "warning" | "critical" }
        );
      } else if (parsedTool.tool === "resolve_incident") {
        result = await resolveIncident.invoke(parsedTool.args as { id: string });
      }
    } catch (err) {
      result = JSON.stringify({ error: (err as Error).message });
    }

    traceEvents.push({
      type: "observation",
      node: "plan-and-execute",
      content: result,
      timestamp: Date.now(),
    });
  }

  return {
    done: [[currentStep, result]] as [string, string][],
    trace: traceEvents,
  };
}

export async function replanner(state: typeof PEState.State) {
  const stepNumber = state.done.length;
  const remainingSteps = state.plan.slice(1);
  const traceEvents: TraceEvent[] = [];
  const maxSteps = state.maxSteps ?? 8;

  // Teto rígido de 8 passos
  if (stepNumber >= maxSteps) {
    const lastObservation = state.done[state.done.length - 1]?.[1] ?? "";
    const answer = `Plano encerrado no teto rígido de ${maxSteps} passos. Síntese: Passos concluídos com sucesso. ${
      lastObservation ? `Última observação: ${lastObservation.slice(0, 150)}` : ""
    }`;

    traceEvents.push({
      type: "critique",
      node: "plan-and-execute",
      content: `Teto rígido de ${maxSteps} passos atingido (${stepNumber}/${maxSteps}). Encerrando plano.`,
      timestamp: Date.now(),
    });

    traceEvents.push({
      type: "answer",
      node: "plan-and-execute",
      content: answer,
      timestamp: Date.now(),
    });

    return {
      plan: [],
      answer,
      trace: traceEvents,
    };
  }

  // Se não há mais passos na fila
  if (remainingSteps.length === 0) {
    const lastObservation = state.done[state.done.length - 1]?.[1] ?? "";
    const answer = `Execução do plano concluída após ${stepNumber} passos. Todas as tarefas operacionais planejadas foram realizadas. ${
      lastObservation ? `Última observação: ${lastObservation.slice(0, 150)}` : ""
    }`;

    traceEvents.push({
      type: "critique",
      node: "plan-and-execute",
      content: `Passo ${stepNumber} concluído. Não há passos restantes na fila. Encerrando plano.`,
      timestamp: Date.now(),
    });

    traceEvents.push({
      type: "answer",
      node: "plan-and-execute",
      content: answer,
      timestamp: Date.now(),
    });

    return {
      plan: [],
      answer,
      trace: traceEvents,
    };
  }

  // Se configurado com noReplanner, segue diretamente sem chamar LLM
  if (state.noReplanner) {
    traceEvents.push({
      type: "critique",
      node: "plan-and-execute",
      content: `Passo ${stepNumber} concluído. [No-Replanner]: seguindo plano (${remainingSteps.length} passos restantes).`,
      timestamp: Date.now(),
    });

    return {
      plan: remainingSteps,
      trace: traceEvents,
      llmCalls: 0,
    };
  }

  // Decisão via modelo ou fallback determinístico
  let decision: { action: "seguir" | "ajustar" | "encerrar"; remainingSteps?: string[]; answer?: string } = {
    action: "seguir",
  };
  let llmCalls = 0;

  try {
    const model = createModel();
    const doneSummary = state.done
      .map(([step, res], idx) => `Passo ${idx + 1}: ${step} -> ${res.slice(0, 150)}`)
      .join("\n");
    const res = (await model.withStructuredOutput(replannerSchema).invoke([
      ["system", REPLANNER_PROMPT],
      [
        "user",
        `Objetivo: "${state.input}"\nPassos executados:\n${doneSummary}\nPassos restantes previstos: ${JSON.stringify(remainingSteps)}`,
      ],
    ])) as { action: "seguir" | "ajustar" | "encerrar"; remainingSteps?: string[]; answer?: string };
    decision = res;
    llmCalls = 1;
  } catch {
    // Fallback determinístico offline
    decision = { action: "seguir" };
  }

  if (decision.action === "encerrar" || (decision.answer && decision.action !== "ajustar")) {
    const answer = decision.answer || `Plano encerrado após ${stepNumber} passos com sucesso.`;
    traceEvents.push({
      type: "critique",
      node: "plan-and-execute",
      content: `Passo ${stepNumber} concluído. Decisão do replanner: encerrar plano.`,
      timestamp: Date.now(),
    });
    traceEvents.push({
      type: "answer",
      node: "plan-and-execute",
      content: answer,
      timestamp: Date.now(),
    });

    return {
      plan: [],
      answer,
      trace: traceEvents,
      llmCalls,
    };
  }

  if (decision.action === "ajustar" && decision.remainingSteps && decision.remainingSteps.length > 0) {
    traceEvents.push({
      type: "critique",
      node: "plan-and-execute",
      content: `Passo ${stepNumber} concluído. Decisão do replanner: ajustar plano com ${decision.remainingSteps.length} passos atualizados.`,
      timestamp: Date.now(),
    });

    return {
      plan: decision.remainingSteps,
      trace: traceEvents,
      llmCalls,
    };
  }

  // Seguir
  traceEvents.push({
    type: "critique",
    node: "plan-and-execute",
    content: `Passo ${stepNumber} concluído. Decisão do replanner: seguir plano (${remainingSteps.length} passos restantes).`,
    timestamp: Date.now(),
  });

  return {
    plan: remainingSteps,
    trace: traceEvents,
    llmCalls,
  };
}

export function shouldContinue(state: typeof PEState.State) {
  const maxSteps = state.maxSteps ?? 8;
  if (state.answer || state.plan.length === 0 || state.done.length >= maxSteps) {
    return END;
  }
  return "executor";
}

export function createPlanAndExecuteGraph(
  customPlanner?: (input: string) => Promise<string[]>,
  customReplanner?: (state: typeof PEState.State) => Promise<Partial<typeof PEState.State>>
) {
  const workflow = new StateGraph(PEState)
    .addNode("planner", (state) => planner(state, customPlanner))
    .addNode("executor", (state) => executor(state))
    .addNode("replanner", (state) => (customReplanner ? customReplanner(state) : replanner(state)))
    .addEdge(START, "planner")
    .addEdge("planner", "executor")
    .addEdge("executor", "replanner")
    .addConditionalEdges("replanner", shouldContinue);

  return workflow.compile();
}

export function createPlanAndExecuteStrategy(
  customPlanner?: (input: string) => Promise<string[]>,
  customReplanner?: (state: typeof PEState.State) => Promise<Partial<typeof PEState.State>>
): ReasoningStrategy {
  const graph = createPlanAndExecuteGraph(customPlanner, customReplanner);

  return {
    name: "plan-and-execute",
    async run(input: string, options?: StrategyOptions): Promise<StrategyResult> {
      const started = Date.now();
      const maxSteps = Math.min(options?.maxIterations ?? 8, 8);

      const context = buildContext({
        systemPrompt: options?.systemPrompt,
        userMessage: input,
        summary: options?.summary,
        history: options?.history,
        memories: options?.recalledMemories,
        budgets: options?.budgets,
      });

      let graphInput = context.userPrompt;
      const historyMessages = context.messages.filter((m) => m.role === "user" || m.role === "assistant");
      if (historyMessages.length > 1) {
        const historyText = historyMessages
          .slice(0, -1)
          .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
          .join("\n");
        graphInput = `Histórico da conversa:\n${historyText}\n\nSolicitação atual: ${graphInput}`;
      }
      const summaryMsg = context.messages.find((m) => m.role === "system" && m.content.includes("[Resumo da Conversa Anterior]"));
      if (summaryMsg) {
        graphInput = `${summaryMsg.content}\n\n${graphInput}`;
      }

      const finalState = await graph.invoke({
        input: graphInput,
        maxSteps,
        noReplanner: options?.noReplanner ?? false,
        plan: [],
        done: [],
        trace: [],
        llmCalls: 0,
      });

      const trace = (finalState.trace ?? []) as TraceEvent[];
      const answer =
        finalState.answer ??
        trace.find((t) => t.type === "answer")?.content ??
        "Plan execution complete.";

      return {
        answer,
        trace,
        metrics: {
          llmCalls: finalState.llmCalls ?? 1,
          latencyMs: Date.now() - started,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    },
  };
}

export const planAndExecuteStrategy: ReasoningStrategy = createPlanAndExecuteStrategy();
