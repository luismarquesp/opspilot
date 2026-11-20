import test from "node:test";
import assert from "node:assert/strict";
import { ConversationSummarizer, SUMMARIZER_PROMPT, type InvokableModel } from "./summarizer.js";
import type { ConversationMessage } from "../models/conversation.js";

function makeMessage(id: number, role: "user" | "assistant", content: string): ConversationMessage {
  return {
    id,
    conversationId: "conv-1",
    role,
    content,
    createdAt: new Date(),
  };
}

test("ConversationSummarizer — Unit Tests", async (t) => {
  await t.test("distills decisions, facts, and pending items using SUMMARIZER_PROMPT", async () => {
    let capturedSystemPrompt = "";
    let capturedUserContent = "";

    const mockModel: InvokableModel = {
      invoke: async (messages: unknown[]) => {
        const msgs = messages as [string, string][];
        capturedSystemPrompt = msgs[0][1];
        capturedUserContent = msgs[1][1];

        return {
          content: "- Decisão: Reiniciar payment-api\n- Fato: auth-service estável\n- Pendência: Analisar logs de latência",
        };
      },
    };

    const summarizer = new ConversationSummarizer(mockModel);
    const messages: ConversationMessage[] = [
      makeMessage(1, "user", "Olá, tudo bem? O payment-api está com erro 500."),
      makeMessage(2, "assistant", "Identifiquei memory leak no container."),
      makeMessage(3, "user", "Vamos reiniciar o container agora."),
      makeMessage(4, "assistant", "Container reiniciado. auth-service segue estável."),
      makeMessage(5, "user", "Perfeito, precisamos analisar os logs de latência depois."),
      makeMessage(6, "assistant", "Anotado. Ficou como pendência."),
      makeMessage(7, "user", "Obrigado!"),
      makeMessage(8, "assistant", "De nada, até logo."),
    ];

    const result = await summarizer.summarize(null, messages);

    assert.equal(capturedSystemPrompt, SUMMARIZER_PROMPT);
    assert.ok(capturedUserContent.includes("payment-api está com erro 500"));
    assert.ok(capturedUserContent.includes("Container reiniciado"));
    assert.ok(result.includes("Decisão: Reiniciar payment-api"));
    assert.ok(result.includes("Pendência: Analisar logs de latência"));
  });

  await t.test("merges smoothly with existing previous summary", async () => {
    let capturedUserContent = "";

    const mockModel: InvokableModel = {
      invoke: async (messages: unknown[]) => {
        const msgs = messages as [string, string][];
        capturedUserContent = msgs[1][1];
        return {
          content: "- Histórico anterior: Incidente #101 investigado\n- Novo fato: Incidente #101 resolvido",
        };
      },
    };

    const summarizer = new ConversationSummarizer(mockModel);
    const previousSummary = "- Incidente #101 aberto para auth-service";
    const newMessages: ConversationMessage[] = [
      makeMessage(9, "user", "O fix foi aplicado no auth-service."),
      makeMessage(10, "assistant", "Confirmado. Incidente #101 foi resolvido."),
    ];

    const result = await summarizer.summarize(previousSummary, newMessages);

    assert.ok(capturedUserContent.includes("Resumo anterior:"));
    assert.ok(capturedUserContent.includes(previousSummary));
    assert.ok(capturedUserContent.includes("Novo trecho de conversa a ser incorporado:"));
    assert.ok(result.includes("Incidente #101 resolvido"));
  });

  await t.test("handles model string response directly", async () => {
    const mockModel: InvokableModel = {
      invoke: async () => "- Resumo em string simples",
    };

    const summarizer = new ConversationSummarizer(mockModel);
    const result = await summarizer.summarize(null, [makeMessage(1, "user", "msg")]);
    assert.equal(result, "- Resumo em string simples");
  });

  await t.test("model failure falls back gracefully to previous summary without throwing", async () => {
    const failingModel: InvokableModel = {
      invoke: async () => {
        throw new Error("OpenRouter 429 Rate limit exceeded");
      },
    };

    const summarizer = new ConversationSummarizer(failingModel);
    const previousSummary = "- Resumo seguro anterior";
    const messages = [makeMessage(1, "user", "Erro urgente")];

    // Must NOT throw
    const result = await summarizer.summarize(previousSummary, messages);
    assert.equal(result, previousSummary);

    // If no previous summary, returns empty string on failure
    const emptyResult = await summarizer.summarize(null, messages);
    assert.equal(emptyResult, "");
  });

  await t.test("returns previous summary immediately if message list is empty", async () => {
    const mockModel: InvokableModel = {
      invoke: async () => {
        throw new Error("Should not be called");
      },
    };

    const summarizer = new ConversationSummarizer(mockModel);
    const result = await summarizer.summarize("Resumo existente", []);
    assert.equal(result, "Resumo existente");
  });
});
