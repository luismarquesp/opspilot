import { z } from "zod";
import type { IMemoryStore } from "../models/memory.js";
import { createModel } from "../agents/model.js";

// ---------------------------------------------------------------------------
// Schemas and Types
// ---------------------------------------------------------------------------

export const LearningExtractionSchema = z.object({
  hasLearning: z.boolean().describe(
    "true se a mensagem declarar fato ou preferência operacional duradoura; false para ações efêmeras, dúvidas pontuais ou saudações"
  ),
  fact: z.string().optional().describe(
    "Fato operacional duradouro em terceira pessoa (ex: 'O usuário é responsável pelo auth-service'). Omitido se hasLearning for false."
  ),
});

export type LearningExtraction = z.infer<typeof LearningExtractionSchema>;

export interface ReflectionInput {
  userMessage: string;
  assistantAnswer: string;
  userId: string;
  memoryStore: IMemoryStore;
}

export interface ILearningReflector {
  reflect(input: ReflectionInput): Promise<LearningExtraction>;
}

// ---------------------------------------------------------------------------
// System Prompt with Strict Negative Constraints
// ---------------------------------------------------------------------------

export const LEARNING_REFLECTOR_PROMPT = `Você é o analisador de aprendizado operacional do OpsPilot.
Sua missão é analisar a interação recente entre o operador e o copiloto para destilar fatos operacionais duradouros e preferências do usuário.

REGRAS CRÍTICAS DE SEGURANÇA E FILTRAGEM:
1. NUNCA extraia pedidos pontuais, comandos efêmeros ou tarefas imediatas (ex: "abra um incidente para auth", "liste alertas firing", "qual o status?", "resolva inc-101"). Tais comandos NÃO são fatos duradouros e devem SEMPRE retornar hasLearning: false.
2. NUNCA extraia ou armazene segredos, credenciais, senhas, tokens de API, chaves privadas ou dados de autenticação. Se o usuário fornecer credenciais, ignore-as completamente e retorne hasLearning: false.
3. Extraia APENAS fatos ou preferências DURADOURAS, tais como:
   - Posse ou responsabilidade por serviços (ex: "O usuário é responsável pelo auth-service e payment-api")
   - Papel técnico ou especialidade (ex: "O usuário atua como DBA PostgreSQL")
   - Preferências de fluxo operacional (ex: "O usuário prefere ser alertado apenas sobre incidentes críticos")
4. O fato extraído deve ser uma sentença objetiva, clara e concisa em terceira pessoa.
5. Se não houver fato duradouro evidente, retorne hasLearning: false.`;

// ---------------------------------------------------------------------------
// LearningReflector Implementation
// ---------------------------------------------------------------------------

export interface StructuredModel {
  withStructuredOutput: (schema: unknown) => {
    invoke: (messages: unknown[]) => Promise<unknown>;
  };
}

export class LearningReflector implements ILearningReflector {
  readonly #model: StructuredModel | null;

  constructor(customModel?: StructuredModel) {
    this.#model = customModel ?? null;
  }

  async reflect(input: ReflectionInput): Promise<LearningExtraction> {
    try {
      const model = this.#model ?? (createModel() as unknown as StructuredModel);
      const res = (await model.withStructuredOutput(LearningExtractionSchema).invoke([
        ["system", LEARNING_REFLECTOR_PROMPT],
        [
          "user",
          `Mensagem do usuário: "${input.userMessage}"\nResposta do assistente: "${input.assistantAnswer}"`,
        ],
      ])) as LearningExtraction;

      const extraction: LearningExtraction = {
        hasLearning: Boolean(res?.hasLearning),
        fact: res?.fact?.trim() || undefined,
      };

      if (extraction.hasLearning && extraction.fact) {
        await input.memoryStore.remember(input.userId, extraction.fact);
      }

      return extraction;
    } catch (err) {
      console.warn("[OpsPilot] Learning reflector evaluation caught error:", err);
      return { hasLearning: false };
    }
  }
}

export const defaultLearningReflector: ILearningReflector = new LearningReflector();
