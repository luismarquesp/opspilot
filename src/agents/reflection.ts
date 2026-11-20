import { createModel } from "./model.js";
import {
  CritiqueVerdictSchema,
  ReflectionOptionsSchema,
  type CritiqueVerdict,
  type ReasoningStrategy,
  type ReflectionOptions,
  type StrategyOptions,
  type StrategyResult,
  type TraceEvent,
} from "./types.js";
import { buildContext } from "../context/context-builder.js";

export const CRITIC_PROMPT = `Você é o crítico de qualidade do OpsPilot, copiloto de plantão para resposta a incidentes de produção.
Sua responsabilidade é avaliar APENAS contra as observações reais registradas no trace e o pedido do operador.

Regras de Avaliação:
1. Verifique se os alertas, serviços, severidades e ações mencionadas correspondem fielmente às observações.
2. Se a resposta contiver fatos não presentes nas observações, alucinações, omissões de alertas críticos ou contradições: defina approved = false e feedback claro, específico e acionável com o que corrigir.
3. Se a resposta for concisa, precisa e estritamente respaldada pelas observações: defina approved = true e forneça uma breve síntese de validação.`;

/**
 * Pure function: extrai e formata observações registradas no trace de execução.
 */
export function observationOf(trace: TraceEvent[]): string {
  const observations = trace
    .filter((e) => e.type === "observation")
    .map((e, idx) => `[Observação ${idx + 1}] ${e.content}`);

  return observations.length > 0
    ? observations.join("\n")
    : "Nenhuma observação de ferramenta registrada no trace.";
}

/**
 * Pure function: formata o input ampliado com o feedback corretivo para re-execução.
 */
export function augmentInputWithFeedback(
  originalInput: string,
  feedback: string,
  attempt: number
): string {
  return `${originalInput}\n\n[Feedback do Crítico (Tentativa ${attempt})]:\n${feedback}\nPor favor, ajuste e forneça a resposta corrigida com base nas observações reais.`;
}

/**
 * Invoca o modelo crítico com saída estruturada avaliando a resposta contra as observações.
 */
export async function critique(
  input: string,
  result: StrategyResult,
  options?: ReflectionOptions
): Promise<CritiqueVerdict> {
  const model = options?.criticModel ?? createModel();
  const systemPrompt = options?.criticPrompt ?? CRITIC_PROMPT;
  const observations = observationOf(result.trace);
  const context = buildContext({
    systemPrompt: options?.criticPrompt ?? CRITIC_PROMPT,
    userMessage: `Pedido: ${input}\nObservações: ${observations}\nResposta: ${result.answer}`,
  });

  const rawVerdict = await model.withStructuredOutput(CritiqueVerdictSchema).invoke([
    ["system", context.messages[0].content],
    ["user", context.userPrompt],
  ]);

  return CritiqueVerdictSchema.parse(rawVerdict);
}

/**
 * Decorador withReflection: decora qualquer ReasoningStrategy adicionando auto-crítica,
 * validação contra observações reais e regeneração limitada por maxReflection.
 */
export function withReflection(
  strategy: ReasoningStrategy,
  options?: ReflectionOptions
): ReasoningStrategy {
  const parsedOptions = ReflectionOptionsSchema.parse(options ?? {});
  const maxReflection = parsedOptions.maxReflection;

  return {
    name: `reflect:${strategy.name}`,
    async run(input: string, runOptions?: StrategyOptions): Promise<StrategyResult> {
      const started = Date.now();
      let currentInput = input;
      let accumulatedTrace: TraceEvent[] = [];
      let accumulatedLlmCalls = 0;
      let lastResult: StrategyResult | null = null;
      let attempt = 0;

      while (attempt <= maxReflection) {
        // 1. Executa a estratégia base
        const currentResult = await strategy.run(currentInput, runOptions);
        lastResult = currentResult;
        accumulatedTrace = accumulatedTrace.concat(currentResult.trace);
        accumulatedLlmCalls += currentResult.metrics.llmCalls;

        // 2. Avalia com o crítico
        let verdict: CritiqueVerdict;
        try {
          verdict = await critique(input, currentResult, {
            ...parsedOptions,
            criticModel: options?.criticModel,
          });
          accumulatedLlmCalls += 1;
        } catch (error) {
          // Fallback resiliente em caso de falha na chamada do crítico
          const errorMsg = error instanceof Error ? error.message : String(error);
          accumulatedTrace.push({
            type: "critique",
            node: "reflection",
            content: `[Reflection Tentativa ${attempt + 1}/${maxReflection + 1}] ERRO_CRITICO: Falha na avaliação do crítico (${errorMsg}). Prosseguindo com resposta base.`,
            timestamp: Date.now(),
          });

          return {
            answer: currentResult.answer,
            trace: accumulatedTrace,
            metrics: {
              llmCalls: accumulatedLlmCalls,
              latencyMs: Date.now() - started,
            },
          };
        }

        // 3. Adiciona evento de critique no trace
        accumulatedTrace.push({
          type: "critique",
          node: "reflection",
          content: `[Reflection Tentativa ${attempt + 1}/${maxReflection + 1}] ${
            verdict.approved ? "APROVADO" : "REPROVADO"
          }: ${verdict.feedback}`,
          timestamp: Date.now(),
        });

        // 4. Se aprovado, encerra com sucesso
        if (verdict.approved) {
          return {
            answer: currentResult.answer,
            trace: accumulatedTrace,
            metrics: {
              llmCalls: accumulatedLlmCalls,
              latencyMs: Date.now() - started,
              ...(currentResult.metrics?.modelUsed ? { modelUsed: currentResult.metrics.modelUsed } : {}),
            },
          };
        }

        // 5. Se reprovado e ainda não atingiu o teto de reflexão, regenera com feedback
        attempt += 1;
        if (attempt <= maxReflection) {
          currentInput = augmentInputWithFeedback(input, verdict.feedback, attempt);
        }
      }

      // Teto de reflexão atingido
      return {
        answer: lastResult?.answer ?? "Não foi possível consolidar uma resposta aprovada.",
        trace: accumulatedTrace,
        metrics: {
          llmCalls: accumulatedLlmCalls,
          latencyMs: Date.now() - started,
          ...(lastResult?.metrics?.modelUsed ? { modelUsed: lastResult.metrics.modelUsed } : {}),
        },
      };
    },
  };
}
