import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./server.js";
import type { ReasoningStrategy, StrategyOptions, StrategyResult } from "../agents/types.js";
import { SqliteConversationStore } from "../store/conversation-store.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";
import type { ILearningReflector, LearningExtraction, ReflectionInput } from "../memory/reflector.js";
import type { IConversationSummarizer } from "../context/summarizer.js";
import { ModelUnavailableError } from "../agents/errors.js";

function makeFakeStrategy(result: StrategyResult, name = "fake"): ReasoningStrategy {
  return {
    name,
    run: async (): Promise<StrategyResult> => result,
  };
}

function makeSlowStrategy(delayMs: number, name = "slow"): ReasoningStrategy {
  return {
    name,
    run: async (): Promise<StrategyResult> => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        answer: "Delayed answer",
        trace: [{ type: "answer", node: "slow", content: "Delayed answer", timestamp: Date.now() }],
        metrics: { llmCalls: 1, latencyMs: delayMs },
      };
    },
  };
}

const mockCriticModel = {
  withStructuredOutput: (_schema: unknown) => ({
    invoke: async () => ({
      approved: true,
      feedback: "Auto-approved for test.",
    }),
  }),
};

const defaultFakeResult: StrategyResult = {
  answer: "All services operational.",
  trace: [
    { type: "thought", node: "react", content: "Checking systems", timestamp: 1000 },
    { type: "answer", node: "react", content: "All services operational.", timestamp: 1001 },
  ],
  metrics: {
    llmCalls: 2,
    latencyMs: 150,
  },
};

test("POST /chat Integration Tests", async (t) => {
  await t.test("1. POST /chat with valid message and fake registry returns HTTP 200 with answer, trace, metrics", async () => {
    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const mockRouterModel = {
      withStructuredOutput: () => ({
        invoke: async () => ({
          route: "react" as const,
          reason: "Autonomous routing test",
        }),
      }),
    };
    const app = createApp({
      strategyRegistry: { react: fakeStrategy },
      customModel: mockRouterModel,
    });

    const res = await request(app)
      .post("/chat")
      .send({ message: "hello" });

    assert.equal(res.status, 200);
    assert.equal(res.body.answer, defaultFakeResult.answer);
    assert.ok(Array.isArray(res.body.trace));
    assert.ok(res.body.trace.length >= defaultFakeResult.trace.length);
    assert.ok(res.body.trace.some((e: { type: string; node: string }) => e.type === "route" && e.node === "router"));
    assert.equal(res.body.metrics.llmCalls, defaultFakeResult.metrics.llmCalls + 1);
  });

  await t.test("2. POST /chat with empty body returns HTTP 400 with validation issues", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/chat")
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "validation_error");
    assert.ok(Array.isArray(res.body.issues));
    assert.ok(res.body.issues.length > 0);
    assert.ok(res.body.issues.some((issue: { path: unknown[] }) => issue.path.includes("message")));
  });

  await t.test("3. POST /chat with whitespace-only message returns HTTP 400 (trimmed by Zod)", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/chat")
      .send({ message: "   " });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "validation_error");
    assert.ok(Array.isArray(res.body.issues));
    assert.ok(res.body.issues.length > 0);
  });

  await t.test("4. POST /chat with unknown strategy returns HTTP 422 with strategy name", async () => {
    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      strategyRegistry: { react: fakeStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({ message: "hi", strategy: "nonexistent" });

    assert.equal(res.status, 422);
    assert.equal(res.body.error, "unknown_strategy");
    assert.equal(res.body.strategy, "nonexistent");
  });

  await t.test("5. POST /chat exceeding timeout returns HTTP 504 gateway_timeout", async () => {
    const slowStrategy = makeSlowStrategy(200, "react");
    const app = createApp({
      strategyRegistry: { react: slowStrategy },
      timeoutMs: 50,
    });

    const res = await request(app)
      .post("/chat")
      .send({ message: "check slow service" });

    assert.equal(res.status, 504);
    assert.equal(res.body.error, "gateway_timeout");
  });

  await t.test("6. POST /chat with reflect: true wraps strategy and returns HTTP 200", async () => {
    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      strategyRegistry: { react: fakeStrategy },
      reflectionOptions: { maxReflection: 1, criticModel: mockCriticModel },
    });

    const res = await request(app)
      .post("/chat")
      .send({ message: "hi", reflect: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.answer, defaultFakeResult.answer);
    assert.ok(Array.isArray(res.body.trace));
    assert.ok(res.body.trace.some((event: { type: string }) => event.type === "critique"));
  });

  await t.test("7. POST /chat with explicit plan-and-execute strategy returns HTTP 200", async () => {
    const peResult: StrategyResult = {
      answer: "Plan completed successfully.",
      trace: [
        { type: "plan", node: "plan-and-execute", content: "Step 1: Check metrics", timestamp: 2000 },
        { type: "answer", node: "plan-and-execute", content: "Plan completed successfully.", timestamp: 2001 },
      ],
      metrics: { llmCalls: 3, latencyMs: 320 },
    };
    const peStrategy = makeFakeStrategy(peResult, "plan-and-execute");

    const app = createApp({
      strategyRegistry: { "plan-and-execute": peStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({ message: "investigate latency", strategy: "plan-and-execute" });

    assert.equal(res.status, 200);
    assert.equal(res.body.answer, peResult.answer);
    assert.ok(Array.isArray(res.body.trace));
    assert.ok(res.body.trace.some((e: { type: string; node: string; route?: string }) => e.type === "route" && e.node === "router" && e.route === "plan-and-execute"));
  });

  await t.test("T009 (US2) — autonomous routing when strategy omitted vs manual override vs invalid string", async (sub) => {
    const fakeReact = makeFakeStrategy(defaultFakeResult, "react");
    const peResult: StrategyResult = {
      answer: "Plan OK",
      trace: [{ type: "answer", node: "plan-and-execute", content: "Plan OK", timestamp: 1 }],
      metrics: { llmCalls: 2, latencyMs: 50 },
    };
    const fakePE = makeFakeStrategy(peResult, "plan-and-execute");

    const mockRouter = {
      withStructuredOutput: () => ({
        invoke: async () => ({
          route: "react" as const,
          reason: "Autonomous query analysis",
        }),
      }),
    };

    const app = createApp({
      strategyRegistry: {
        react: fakeReact,
        "plan-and-execute": fakePE,
      },
      customModel: mockRouter,
    });

    await sub.test("omitted strategy triggers autonomous routing with route trace event", async () => {
      const res = await request(app).post("/chat").send({ message: "check alerts" });
      assert.equal(res.status, 200);
      assert.ok(res.body.trace.some((e: { type: string; node: string; route?: string }) => e.type === "route" && e.node === "router" && e.route === "react"));
    });

    await sub.test("explicit strategy override forces target without routing LLM call", async () => {
      const res = await request(app).post("/chat").send({ message: "check alerts", strategy: "plan-and-execute" });
      assert.equal(res.status, 200);
      assert.equal(res.body.answer, "Plan OK");
      assert.ok(res.body.trace.some((e: { type: string; node: string; reason?: string }) => e.type === "route" && e.node === "router" && e.reason?.includes("Manual override")));
    });

    await sub.test("invalid strategy string is rejected with HTTP 422", async () => {
      const res = await request(app).post("/chat").send({ message: "check alerts", strategy: "invalid-strat" });
      assert.equal(res.status, 422);
      assert.equal(res.body.error, "unknown_strategy");
      assert.equal(res.body.strategy, "invalid-strat");
    });
  });

  await t.test("8. POST /chat with invalid reflect type returns HTTP 400", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/chat")
      .send({ message: "valid message", reflect: "true" });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "validation_error");
    assert.ok(res.body.issues.some((issue: { path: unknown[] }) => issue.path.includes("reflect")));
  });

  await t.test("9. POST /chat handles strategy runtime error with HTTP 500 internal_error", async () => {
    const errorStrategy: ReasoningStrategy = {
      name: "react",
      run: async () => {
        throw new Error("Unexpected crash");
      },
    };
    const app = createApp({
      strategyRegistry: { react: errorStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({ message: "will crash" });

    assert.equal(res.status, 500);
    assert.equal(res.body.error, "internal_error");
  });
});

test("POST /chat Multi-Turn Conversation Tests (US1, US3, US4)", async (t) => {
  await t.test("T010 (US1) — Sequential multi-turn chat increments historyMessages", async () => {
    const store = new SqliteConversationStore(":memory:");
    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      conversationStore: store,
      strategyRegistry: { react: fakeStrategy },
    });

    // Turn 1: No conversationId provided
    const res1 = await request(app)
      .post("/chat")
      .send({ message: "Turn 1 question" });

    assert.equal(res1.status, 200);
    assert.ok(typeof res1.body.conversationId === "string");
    assert.ok(res1.body.conversationId.startsWith("conv-"));
    assert.equal(res1.body.metrics.historyMessages, 0);

    const convId = res1.body.conversationId;

    // Turn 2: Provide conversationId from turn 1
    const res2 = await request(app)
      .post("/chat")
      .send({ conversationId: convId, message: "Turn 2 question" });

    assert.equal(res2.status, 200);
    assert.equal(res2.body.conversationId, convId);
    assert.equal(res2.body.metrics.historyMessages, 2);

    // Turn 3: Provide same conversationId
    const res3 = await request(app)
      .post("/chat")
      .send({ conversationId: convId, message: "Turn 3 question" });

    assert.equal(res3.status, 200);
    assert.equal(res3.body.conversationId, convId);
    assert.equal(res3.body.metrics.historyMessages, 4);

    // Verify messages in store: 3 turns = 6 messages
    const stored = store.lastMessages(convId, 20);
    assert.equal(stored.length, 6);
    assert.equal(stored[0].content, "Turn 1 question");
    assert.equal(stored[1].content, defaultFakeResult.answer);
    assert.equal(stored[2].content, "Turn 2 question");
    assert.equal(stored[3].content, defaultFakeResult.answer);
    assert.equal(stored[4].content, "Turn 3 question");
    assert.equal(stored[5].content, defaultFakeResult.answer);
  });

  await t.test("T012 (US3) — Sliding window capped at 8 messages and historyMessages metric is 8", async () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();

    // Populate 14 messages (7 user + 7 assistant)
    for (let i = 1; i <= 7; i++) {
      store.append(convId, "user", `User message ${i}`);
      store.append(convId, "assistant", `Assistant message ${i}`);
    }

    let capturedOptions: StrategyOptions | undefined;
    const inspectStrategy: ReasoningStrategy = {
      name: "react",
      run: async (_input: string, options?: StrategyOptions): Promise<StrategyResult> => {
        capturedOptions = options;
        return defaultFakeResult;
      },
    };

    const app = createApp({
      conversationStore: store,
      strategyRegistry: { react: inspectStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({ conversationId: convId, message: "User message 8" });

    assert.equal(res.status, 200);
    assert.equal(res.body.metrics.historyMessages, 8);
    assert.ok(capturedOptions?.history);
    assert.equal(capturedOptions.history.length, 8);
    // Oldest messages (User 1..3 and Assistant 1..3) should have slid out of the 8-message window
    assert.equal(capturedOptions.history[0].content, "User message 4");
    assert.equal(capturedOptions.history[7].content, "Assistant message 7");
  });

  await t.test("T013 (US4) — Validation failure with conversationId persists no message", async () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();

    const app = createApp({
      conversationStore: store,
      strategyRegistry: { react: makeFakeStrategy(defaultFakeResult, "react") },
    });

    const res = await request(app)
      .post("/chat")
      .send({ conversationId: convId, message: "" });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "validation_error");

    const messages = store.lastMessages(convId);
    assert.equal(messages.length, 0);
  });

  await t.test("T014 (US4) — Non-existent conversationId echoes back and initializes conversation", async () => {
    const store = new SqliteConversationStore(":memory:");
    const nonExistentId = "conv-non-existent-1234";

    const app = createApp({
      conversationStore: store,
      strategyRegistry: { react: makeFakeStrategy(defaultFakeResult, "react") },
    });

    // First call with nonexistent conversationId: echoes back, 0 history
    const res1 = await request(app)
      .post("/chat")
      .send({ conversationId: nonExistentId, message: "First question" });

    assert.equal(res1.status, 200);
    assert.equal(res1.body.conversationId, nonExistentId);
    assert.equal(res1.body.metrics.historyMessages, 0);

    // Second call with same conversationId: has 2 history messages
    const res2 = await request(app)
      .post("/chat")
      .send({ conversationId: nonExistentId, message: "Second question" });

    assert.equal(res2.status, 200);
    assert.equal(res2.body.conversationId, nonExistentId);
    assert.equal(res2.body.metrics.historyMessages, 2);
  });
});

test("POST /chat Semantic Memory Tests (008-semantic-memory)", async (t) => {
  await t.test("T011 (US1) — POST /chat with userId performs recall and injects into agent context", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    const convStore = new SqliteConversationStore(":memory:");

    // Seed a memory for user-alice
    await memoryStore.remember("user-alice", "I love dogs and puppies");

    let receivedOptions: StrategyOptions | undefined;
    const fakeStrategy: ReasoningStrategy = {
      name: "react",
      run: async (_input: string, options?: StrategyOptions): Promise<StrategyResult> => {
        receivedOptions = options;
        return defaultFakeResult;
      },
    };

    const app = createApp({
      conversationStore: convStore,
      memoryStore,
      strategyRegistry: { react: fakeStrategy },
    });

    // Zero-word-overlap semantic query: "Canines are my favorite pets"
    const res = await request(app)
      .post("/chat")
      .send({
        userId: "user-alice",
        message: "Canines are my favorite pets",
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.userId, "user-alice");
    assert.ok(typeof res.body.conversationId === "string");
    assert.ok(receivedOptions?.recalledMemories, "Strategy should receive recalledMemories");
    const firstMemory = receivedOptions.recalledMemories[0];
    const factText = typeof firstMemory === "string" ? firstMemory : firstMemory.fact;
    assert.equal(factText, "I love dogs and puppies");
  });

  await t.test("T011 (US1) — POST /chat without userId does not invoke memory recall", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    const convStore = new SqliteConversationStore(":memory:");

    await memoryStore.remember("user-bob", "I love dogs and puppies");

    let receivedOptions: StrategyOptions | undefined;
    const fakeStrategy: ReasoningStrategy = {
      name: "react",
      run: async (_input: string, options?: StrategyOptions): Promise<StrategyResult> => {
        receivedOptions = options;
        return defaultFakeResult;
      },
    };

    const app = createApp({
      conversationStore: convStore,
      memoryStore,
      strategyRegistry: { react: fakeStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({
        message: "Canines are my favorite pets",
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.userId, undefined);
    assert.equal(receivedOptions?.recalledMemories, undefined);
  });

  await t.test("T008 (US1) — POST /chat with userId triggers background reflection and persists fact", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    const convStore = new SqliteConversationStore(":memory:");

    const mockReflector: ILearningReflector = {
      reflect: async (input: ReflectionInput): Promise<LearningExtraction> => {
        await input.memoryStore.remember(input.userId, "O usuário cuida da payment-api");
        return {
          hasLearning: true,
          fact: "O usuário cuida da payment-api",
        };
      },
    };

    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      conversationStore: convStore,
      memoryStore,
      learningReflector: mockReflector,
      strategyRegistry: { react: fakeStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({
        userId: "user-charlie",
        message: "Sou responsável pela payment-api",
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.userId, "user-charlie");

    // Wait a brief moment for the background microtask to complete
    await new Promise((r) => setTimeout(r, 60));

    const list = await memoryStore.list("user-charlie");
    assert.equal(list.length, 1);
    assert.equal(list[0].fact, "O usuário cuida da payment-api");
  });

  await t.test("T008 (US1) — POST /chat without userId skips background reflection", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    const convStore = new SqliteConversationStore(":memory:");
    let reflectionInvoked = false;

    const mockReflector: ILearningReflector = {
      reflect: async (): Promise<LearningExtraction> => {
        reflectionInvoked = true;
        return { hasLearning: false };
      },
    };

    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      conversationStore: convStore,
      memoryStore,
      learningReflector: mockReflector,
      strategyRegistry: { react: fakeStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({
        message: "Sou responsável pela payment-api",
      });

    assert.equal(res.status, 200);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(reflectionInvoked, false);
  });

  await t.test("T008 (US1) — Ephemeral message yields no persisted memory", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    const convStore = new SqliteConversationStore(":memory:");

    const mockReflector: ILearningReflector = {
      reflect: async (): Promise<LearningExtraction> => {
        return { hasLearning: false };
      },
    };

    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      conversationStore: convStore,
      memoryStore,
      learningReflector: mockReflector,
      strategyRegistry: { react: fakeStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({
        userId: "user-david",
        message: "Abra um incidente agora",
      });

    assert.equal(res.status, 200);
    await new Promise((r) => setTimeout(r, 50));

    const list = await memoryStore.list("user-david");
    assert.equal(list.length, 0);
  });

  await t.test("T011 (US3) — Slow reflection does not block HTTP response latency", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    const convStore = new SqliteConversationStore(":memory:");

    const mockReflector: ILearningReflector = {
      reflect: async (input: ReflectionInput): Promise<LearningExtraction> => {
        await new Promise((r) => setTimeout(r, 300));
        await input.memoryStore.remember(input.userId, "Fato lento");
        return { hasLearning: true, fact: "Fato lento" };
      },
    };

    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      conversationStore: convStore,
      memoryStore,
      learningReflector: mockReflector,
      strategyRegistry: { react: fakeStrategy },
    });

    const startTime = Date.now();
    const res = await request(app)
      .post("/chat")
      .send({
        userId: "user-eve",
        message: "Fato importante com reflexão demorada",
      });
    const elapsed = Date.now() - startTime;

    assert.equal(res.status, 200);
    // Response should be returned well before the 300ms reflector delay completes
    assert.ok(elapsed < 200, `Expected response time under 200ms, got ${elapsed}ms`);

    // But after waiting, the memory should be persisted
    await new Promise((r) => setTimeout(r, 350));
    const list = await memoryStore.list("user-eve");
    assert.equal(list.length, 1);
    assert.equal(list[0].fact, "Fato lento");
  });

  await t.test("T011 (US2) — POST /chat returns promptTokens and contextBreakdown in metrics", async () => {
    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      strategyRegistry: { react: fakeStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({ message: "Qual o status dos alertas?" });

    assert.equal(res.status, 200);
    assert.ok(typeof res.body.metrics.promptTokens === "number");
    assert.ok(res.body.metrics.promptTokens > 0);
    assert.ok(typeof res.body.metrics.contextBreakdown === "object");
    assert.ok(typeof res.body.metrics.contextBreakdown.userMessage === "number");
    assert.ok(res.body.metrics.contextBreakdown.userMessage > 0);
    assert.ok(typeof res.body.metrics.contextBreakdown.totalEstimated === "number");
  });

  await t.test("T011 (US2) — POST /chat with memories and history computes respective contextBreakdown", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    const convStore = new SqliteConversationStore(":memory:");

    await memoryStore.remember("user-ctx", "Usuário prefere alertas de pagamento");
    const convId = convStore.create();
    convStore.append(convId, "user", "Mensagem anterior de teste");
    convStore.append(convId, "assistant", "Resposta anterior de teste");

    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      conversationStore: convStore,
      memoryStore,
      strategyRegistry: { react: fakeStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({
        conversationId: convId,
        userId: "user-ctx",
        message: "Como estão os alertas de pagamento?",
      });

    assert.equal(res.status, 200);
    const breakdown = res.body.metrics.contextBreakdown;
    assert.ok(breakdown, "contextBreakdown should be defined");
    assert.ok(breakdown.history > 0, `History tokens should be > 0, got ${breakdown.history}`);
    assert.ok(breakdown.memories > 0, `Memories tokens should be > 0, got ${breakdown.memories}`);
    assert.ok(breakdown.userMessage > 0, `UserMessage tokens should be > 0, got ${breakdown.userMessage}`);
    assert.equal(breakdown.totalEstimated, breakdown.system + breakdown.history + breakdown.memories + breakdown.userMessage);
  });

  await t.test("T013 (US3) — contextBreakdown.history strictly increases across multi-turn sequential conversation", async () => {
    const convStore = new SqliteConversationStore(":memory:");
    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      conversationStore: convStore,
      strategyRegistry: { react: fakeStrategy },
    });

    // Turn 1
    const res1 = await request(app)
      .post("/chat")
      .send({ message: "Primeiro turno: olá" });
    assert.equal(res1.status, 200);
    const convId = res1.body.conversationId;
    const h1 = res1.body.metrics.contextBreakdown.history;
    assert.equal(h1, 0, "Turn 1 history tokens should be 0");

    // Turn 2
    const res2 = await request(app)
      .post("/chat")
      .send({ conversationId: convId, message: "Segundo turno: como vai?" });
    assert.equal(res2.status, 200);
    const h2 = res2.body.metrics.contextBreakdown.history;
    assert.ok(h2 > 0, `Turn 2 history tokens should be > 0, got ${h2}`);

    // Turn 3
    const res3 = await request(app)
      .post("/chat")
      .send({ conversationId: convId, message: "Terceiro turno: tudo bem?" });
    assert.equal(res3.status, 200);
    const h3 = res3.body.metrics.contextBreakdown.history;
    assert.ok(h3 > h2, `Turn 3 history tokens (${h3}) should be greater than Turn 2 (${h2})`);
  });
});

test("POST /chat History Pruning & Rolling Summary Tests (012-history-summary-pruning)", async (t) => {
  await t.test("T012 (US2) — Summary injection into agent context and contextBreakdown.summary metric", async () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();

    // Pre-seed an existing summary
    store.setSummary(convId, "Resumo: payment-api reiniciado. auth-service normal.", 8);

    // Pre-seed 8 messages in the active window
    for (let i = 9; i <= 16; i++) {
      store.append(convId, i % 2 === 1 ? "user" : "assistant", `Mensagem ${i}`);
    }

    let capturedOptions: StrategyOptions | undefined;
    const inspectStrategy: ReasoningStrategy = {
      name: "react",
      run: async (_input: string, options?: StrategyOptions): Promise<StrategyResult> => {
        capturedOptions = options;
        return defaultFakeResult;
      },
    };

    const app = createApp({
      conversationStore: store,
      strategyRegistry: { react: inspectStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({ conversationId: convId, message: "Mensagem 17 do usuário" });

    assert.equal(res.status, 200);
    // History should have at most 8 messages
    assert.equal(res.body.metrics.historyMessages, 8);
    assert.ok(capturedOptions?.history);
    assert.equal(capturedOptions.history.length, 8);

    // Summary should be passed to strategy
    assert.equal(capturedOptions?.summary, "Resumo: payment-api reiniciado. auth-service normal.");

    // Context breakdown should include summary tokens
    const breakdown = res.body.metrics.contextBreakdown;
    assert.ok(breakdown, "contextBreakdown must be present");
    assert.ok(typeof breakdown.summary === "number");
    assert.ok(breakdown.summary > 0, `breakdown.summary should be > 0, got ${breakdown.summary}`);
    assert.equal(breakdown.totalEstimated, breakdown.system + breakdown.history + breakdown.summary + breakdown.memories + breakdown.userMessage);
  });

  await t.test("T013 (US3) — Threshold-triggered summarization: messages 1..15 = 0 summarize events, 16 = 1, 17..23 = 0, 24 = 1 with merged summary", async () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();

    let summarizerCalls = 0;
    const fakeSummarizer: IConversationSummarizer = {
      summarize: async (previousSummary, chunk) => {
        summarizerCalls++;
        const chunkText = `[Bloco ${summarizerCalls}: ${chunk.length} msgs]`;
        return previousSummary ? `${previousSummary}; ${chunkText}` : chunkText;
      },
    };

    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      conversationStore: store,
      summarizer: fakeSummarizer,
      strategyRegistry: { react: fakeStrategy },
    });

    // 1. Seed exactly 15 messages (1..15)
    for (let i = 1; i <= 15; i++) {
      store.append(convId, i % 2 === 1 ? "user" : "assistant", `Msg ${i}`);
    }

    // Prior to 16th message, no summarization
    assert.equal(summarizerCalls, 0);

    // 2. Request 16: sending the 16th message
    // Controller appends user message 16 -> DB has 16 messages.
    // Active window of 8: 9..16.
    // Evicted unsummarized: 1..8 (exactly 8 messages).
    // Exactly 1 summarizer call triggered!
    const res16 = await request(app)
      .post("/chat")
      .send({ conversationId: convId, message: "Msg 16" });

    assert.equal(res16.status, 200);
    assert.equal(summarizerCalls, 1, "Message 16 must trigger summarization");
    const summarizeEvents16 = res16.body.trace.filter((e: { type: string }) => e.type === "summarize");
    assert.equal(summarizeEvents16.length, 1, "Trace on message 16 must have exactly 1 summarize event");
    assert.ok(summarizeEvents16[0].content.includes("[Bloco 1: 8 msgs]"));

    const storedSummary1 = store.getSummary(convId);
    assert.ok(storedSummary1);
    assert.equal(storedSummary1.lastSummarizedMessageId, 8);

    // After res16, DB has 17 messages (15 seeded + 1 user + 1 assistant)
    // 3. Seed messages up to 23 (messages 18..23)
    for (let i = 18; i <= 23; i++) {
      store.append(convId, i % 2 === 1 ? "user" : "assistant", `Msg ${i}`);
    }

    // Between 17 and 23: evicted unsummarized messages since last id 8 are:
    // Active window of 8 in 23 messages is 16..23.
    // Evicted unsummarized (> 8 and < 16) are 9..15 (7 messages < 8).
    // So messages 17..23 did NOT trigger another summarizer call!
    assert.equal(summarizerCalls, 1, "Messages 17..23 must NOT trigger summarization");

    // 4. Request 24: sending message 24
    // Controller appends user message 24 -> DB has 24 messages.
    // Active window of 8: 17..24.
    // Evicted unsummarized (> 8 and < 17) are 9..16 (exactly 8 messages).
    // Exactly 1 new summarizer call triggered with merged summary!
    const res24 = await request(app)
      .post("/chat")
      .send({ conversationId: convId, message: "Msg 24" });

    assert.equal(res24.status, 200);
    assert.equal(summarizerCalls, 2, "Message 24 must trigger second summarization");
    const summarizeEvents24 = res24.body.trace.filter((e: { type: string }) => e.type === "summarize");
    assert.equal(summarizeEvents24.length, 1, "Trace on message 24 must have exactly 1 summarize event");
    assert.ok(summarizeEvents24[0].content.includes("[Bloco 1: 8 msgs]; [Bloco 2: 8 msgs]"));

    const storedSummary2 = store.getSummary(convId);
    assert.ok(storedSummary2);
    assert.equal(storedSummary2.lastSummarizedMessageId, 16);
  });
});

test("POST /chat Model Resilience & Fallbacks (015-model-fallback-resilience)", async (t) => {
  await t.test("T011 (US3) — POST /chat returns HTTP 503 model_unavailable when all models fail", async () => {
    const failingStrategy: ReasoningStrategy = {
      name: "react",
      run: async () => {
        throw new ModelUnavailableError(
          "All configured models (primary and fallbacks) failed to respond",
          ["primary-model", "backup-model"]
        );
      },
    };

    const app = createApp({
      strategyRegistry: { react: failingStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({ message: "Status dos serviços", strategy: "react" });

    assert.equal(res.status, 503);
    assert.equal(res.body.error, "model_unavailable");
    assert.ok(res.body.message.includes("All configured models"));
  });

  await t.test("T014 (US1, US4) — POST /chat returns trace with fallback event and metrics.modelUsed", async () => {
    const fallbackStrategyResult: StrategyResult = {
      answer: "Resposta via modelo de contingência",
      trace: [
        {
          type: "fallback",
          node: "react",
          fromModel: "anthropic/claude-3.5-sonnet",
          toModel: "openai/gpt-4o-mini",
          reason: "429 Rate limit exceeded",
          content: "Switching to fallback",
          timestamp: 1000,
        },
        {
          type: "answer",
          node: "react",
          content: "Resposta via modelo de contingência",
          timestamp: 1001,
        },
      ],
      metrics: {
        llmCalls: 2,
        latencyMs: 850,
        modelUsed: "openai/gpt-4o-mini",
      },
    };

    const resilientStrategy: ReasoningStrategy = {
      name: "react",
      run: async () => fallbackStrategyResult,
    };

    const app = createApp({
      strategyRegistry: { react: resilientStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({ message: "Verificar alertas", strategy: "react" });

    assert.equal(res.status, 200);
    assert.equal(res.body.answer, "Resposta via modelo de contingência");
    assert.equal(res.body.metrics.modelUsed, "openai/gpt-4o-mini");

    const fallbackEvents = res.body.trace.filter((e: { type: string }) => e.type === "fallback");
    assert.equal(fallbackEvents.length, 1);
    assert.equal(fallbackEvents[0].fromModel, "anthropic/claude-3.5-sonnet");
    assert.equal(fallbackEvents[0].toModel, "openai/gpt-4o-mini");
    assert.equal(fallbackEvents[0].node, "react");
  });
});

test("POST /chat Request Correlation (016-persisted-trace-json-logs)", async (t) => {
  await t.test("T004 (US1) — returns auto-generated requestId in body and matching X-Request-Id header", async () => {
    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      strategyRegistry: { react: fakeStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .send({ message: "Verificar alertas", strategy: "react" });

    assert.equal(res.status, 200);
    assert.ok(typeof res.body.requestId === "string" && res.body.requestId.length > 0);
    assert.equal(res.headers["x-request-id"], res.body.requestId);
  });

  await t.test("T004 (US1) — preserves incoming X-Request-Id header in both response header and body", async () => {
    const fakeStrategy = makeFakeStrategy(defaultFakeResult, "react");
    const app = createApp({
      strategyRegistry: { react: fakeStrategy },
    });

    const res = await request(app)
      .post("/chat")
      .set("X-Request-Id", "  opspilot-req-42  ")
      .send({ message: "Verificar alertas", strategy: "react" });

    assert.equal(res.status, 200);
    assert.equal(res.body.requestId, "opspilot-req-42");
    assert.equal(res.headers["x-request-id"], "opspilot-req-42");
  });

  await t.test("T004 (US1) — sets X-Request-Id header even on validation or provider errors", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/chat")
      .set("X-Request-Id", "err-req-007")
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.headers["x-request-id"], "err-req-007");
  });
});

