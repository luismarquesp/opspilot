import type { ConversationMessage } from "../models/conversation.js";
import { createModel } from "../agents/model.js";

export const SUMMARIZER_PROMPT = `Comprima o trecho de conversa a seguir no máximo 150 tokens, preservando obrigtoriamente: decisões tomadas, fatos estabelecidos (nomes, datas, preferências), incidentes abertos/ resolvidos e pendencias abertas. Descarte cumprimentos e conversa solcial. Se houver um resumo anterior, incorpore. Responda só o resumo, tem tópicos telegráficos`;

export const CONVERSATION_SUMMARIZER_PROMPT = SUMMARIZER_PROMPT;

export interface InvokableModel {
  invoke: (messages: unknown[]) => Promise<{ content: unknown } | string>;
}

export interface IConversationSummarizer {
  summarize(
    previousSummary: string | null | undefined,
    messages: readonly ConversationMessage[]
  ): Promise<string>;
}

export class ConversationSummarizer implements IConversationSummarizer {
  readonly #model: InvokableModel | null;

  constructor(customModel?: InvokableModel) {
    this.#model = customModel ?? null;
  }

  async summarize(
    previousSummary: string | null | undefined,
    messages: readonly ConversationMessage[]
  ): Promise<string> {
    if (!messages || messages.length === 0) {
      return previousSummary?.trim() ?? "";
    }

    try {
      const model = this.#model ?? (createModel() as unknown as InvokableModel);

      const conversationText = messages
        .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
        .join("\n");

      let promptContent = "";
      if (previousSummary && previousSummary.trim().length > 0) {
        promptContent += `Resumo anterior:\n${previousSummary.trim()}\n\n`;
      }
      promptContent += `Novo trecho de conversa a ser incorporado:\n${conversationText}`;

      const response = await model.invoke([
        ["system", SUMMARIZER_PROMPT],
        ["user", promptContent],
      ]);

      let text = "";
      if (typeof response === "string") {
        text = response;
      } else if (response && typeof response === "object" && "content" in response) {
        if (typeof response.content === "string") {
          text = response.content;
        } else if (Array.isArray(response.content)) {
          text = response.content
            .map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? ""))
            .join("\n");
        }
      }

      const trimmed = text.trim();
      return trimmed.length > 0 ? trimmed : (previousSummary?.trim() ?? "");
    } catch (err) {
      console.warn("[OpsPilot] Conversation summarizer error, preserving previous summary:", err);
      return previousSummary?.trim() ?? "";
    }
  }
}

export const defaultConversationSummarizer: IConversationSummarizer = new ConversationSummarizer();
