import test from "node:test";
import assert from "node:assert/strict";
import { LearningReflector, type StructuredModel } from "./reflector.js";
import { SqliteMemoryStore } from "./memory-store.js";

function makeMockModel(result: { hasLearning: boolean; fact?: string }): StructuredModel {
  return {
    withStructuredOutput: (_schema: unknown) => ({
      invoke: async () => result,
    }),
  };
}

function makeCrashingModel(): StructuredModel {
  return {
    withStructuredOutput: (_schema: unknown) => ({
      invoke: async () => {
        throw new Error("OpenRouter rate limit or connection timeout");
      },
    }),
  };
}

test("LearningReflector Unit Tests", async (t) => {
  await t.test("durable operational statement yields hasLearning: true and persists fact", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const mockModel = makeMockModel({
        hasLearning: true,
        fact: "O usuário é responsável pelo auth-service",
      });

      const reflector = new LearningReflector(mockModel);
      const res = await reflector.reflect({
        userMessage: "Sou responsável pelo auth-service",
        assistantAnswer: "Entendido, anotado.",
        userId: "user-123",
        memoryStore,
      });

      assert.equal(res.hasLearning, true);
      assert.equal(res.fact, "O usuário é responsável pelo auth-service");

      const list = await memoryStore.list("user-123");
      assert.equal(list.length, 1);
      assert.equal(list[0].fact, "O usuário é responsável pelo auth-service");
    } finally {
      memoryStore.close();
    }
  });

  await t.test("punctual command yields hasLearning: false and does not persist", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const mockModel = makeMockModel({
        hasLearning: false,
      });

      const reflector = new LearningReflector(mockModel);
      const res = await reflector.reflect({
        userMessage: "Abra um incidente crítico para checkout agora",
        assistantAnswer: "Incidente inc-101 aberto com sucesso.",
        userId: "user-123",
        memoryStore,
      });

      assert.equal(res.hasLearning, false);
      assert.equal(res.fact, undefined);

      const list = await memoryStore.list("user-123");
      assert.equal(list.length, 0);
    } finally {
      memoryStore.close();
    }
  });

  await t.test("secret-bearing message yields hasLearning: false and persists nothing", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const mockModel = makeMockModel({
        hasLearning: false,
      });

      const reflector = new LearningReflector(mockModel);
      const res = await reflector.reflect({
        userMessage: "Minha API key é sk-123456789 secret",
        assistantAnswer: "Por favor, não compartilhe chaves de API.",
        userId: "user-123",
        memoryStore,
      });

      assert.equal(res.hasLearning, false);
      const list = await memoryStore.list("user-123");
      assert.equal(list.length, 0);
    } finally {
      memoryStore.close();
    }
  });

  await t.test("model failure is caught gracefully without throwing", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const crashingModel = makeCrashingModel();
      const reflector = new LearningReflector(crashingModel);

      const res = await reflector.reflect({
        userMessage: "Cuido do pagamento",
        assistantAnswer: "Ok",
        userId: "user-123",
        memoryStore,
      });

      assert.equal(res.hasLearning, false);
      const list = await memoryStore.list("user-123");
      assert.equal(list.length, 0);
    } finally {
      memoryStore.close();
    }
  });
});
