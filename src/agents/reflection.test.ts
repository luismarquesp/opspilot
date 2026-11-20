import test from "node:test";
import assert from "node:assert/strict";
import {
  observationOf,
  augmentInputWithFeedback,
  critique,
  withReflection,
} from "./reflection.js";
import {
  CritiqueVerdictSchema,
  type ReasoningStrategy,
  type StrategyResult,
  type TraceEvent,
} from "./types.js";

test("Reflection Primitives & Extraction (Phase 1 & 2)", async (t) => {
  await t.test("observationOf extracts and enumerates observation events", () => {
    const trace: TraceEvent[] = [
      { type: "thought", node: "test", content: "Checking alerts", timestamp: 1 },
      {
        type: "action",
        node: "test",
        tool: "list_alerts",
        args: { status: "firing" },
        content: "list_alerts",
        timestamp: 2,
      },
      {
        type: "observation",
        node: "test",
        content: JSON.stringify([{ id: "alt-1", service: "payment-api" }]),
        timestamp: 3,
      },
      {
        type: "observation",
        node: "test",
        content: JSON.stringify([{ id: "alt-2", service: "database" }]),
        timestamp: 4,
      },
      { type: "answer", node: "test", content: "Found 2 alerts", timestamp: 5 },
    ];

    const obsText = observationOf(trace);
    assert.ok(obsText.includes("[Observação 1]"));
    assert.ok(obsText.includes("payment-api"));
    assert.ok(obsText.includes("[Observação 2]"));
    assert.ok(obsText.includes("database"));
  });

  await t.test("observationOf handles traces without observations", () => {
    const trace: TraceEvent[] = [
      { type: "thought", node: "test", content: "No tools needed", timestamp: 1 },
      { type: "answer", node: "test", content: "Direct answer", timestamp: 2 },
    ];

    assert.equal(
      observationOf(trace),
      "Nenhuma observação de ferramenta registrada no trace."
    );
  });

  await t.test("augmentInputWithFeedback formats context prompt cleanly", () => {
    const augmented = augmentInputWithFeedback(
      "Verificar status",
      "O alerta do database foi omitido",
      1
    );

    assert.ok(augmented.includes("Verificar status"));
    assert.ok(augmented.includes("[Feedback do Crítico (Tentativa 1)]:"));
    assert.ok(augmented.includes("O alerta do database foi omitido"));
  });

  await t.test("validates CritiqueVerdictSchema constraints", () => {
    const validApproval = CritiqueVerdictSchema.parse({
      approved: true,
      feedback: "Resposta plenamente fundamentada.",
    });
    assert.equal(validApproval.approved, true);

    const validRejection = CritiqueVerdictSchema.parse({
      approved: false,
      feedback: "Faltou citar o incidente inc-101.",
    });
    assert.equal(validRejection.approved, false);

    assert.throws(() => {
      CritiqueVerdictSchema.parse({
        approved: "not-a-bool",
        feedback: "x",
      });
    });
  });

  await t.test("critique invokes model with structured output", async () => {
    const mockModel = {
      withStructuredOutput: (_schema: unknown) => ({
        invoke: async (messages: unknown[]) => {
          assert.ok(Array.isArray(messages));
          return {
            approved: true,
            feedback: "Aprovado com sucesso.",
          };
        },
      }),
    };

    const mockResult: StrategyResult = {
      answer: "Payment service is down",
      trace: [
        {
          type: "observation",
          node: "test",
          content: '{"service":"payment-api","status":"down"}',
          timestamp: 1,
        },
      ],
      metrics: { llmCalls: 1, latencyMs: 100 },
    };

    const verdict = await critique("Qual o status?", mockResult, {
      maxReflection: 2,
      criticModel: mockModel,
    });

    assert.equal(verdict.approved, true);
    assert.equal(verdict.feedback, "Aprovado com sucesso.");
  });
});

test("User Story 1: Self-Critique & First-Pass Approval (P1)", async (t) => {
  await t.test("returns approved answer immediately with critique event in trace", async () => {
    const mockBaseStrategy: ReasoningStrategy = {
      name: "mock-base",
      run: async (_input) => ({
        answer: "All systems healthy",
        trace: [
          { type: "thought", node: "test", content: "Check health", timestamp: 1 },
          {
            type: "observation",
            node: "test",
            content: "status: healthy",
            timestamp: 2,
          },
          { type: "answer", node: "test", content: "All systems healthy", timestamp: 3 },
        ],
        metrics: { llmCalls: 2, latencyMs: 150 },
      }),
    };

    const mockCriticModel = {
      withStructuredOutput: () => ({
        invoke: async () => ({
          approved: true,
          feedback: "Fundamentado na observação de saúde.",
        }),
      }),
    };

    const decorated = withReflection(mockBaseStrategy, {
      maxReflection: 2,
      criticModel: mockCriticModel,
    });

    assert.equal(decorated.name, "reflect:mock-base");

    const result = await decorated.run("Status geral");

    assert.equal(result.answer, "All systems healthy");
    // Exactly 1 critique event appended
    const critiqueEvents = result.trace.filter((e) => e.type === "critique");
    assert.equal(critiqueEvents.length, 1);
    assert.ok(critiqueEvents[0].content.includes("APROVADO"));
    assert.ok(critiqueEvents[0].content.includes("Fundamentado na observação"));

    // Telemetry: 2 base + 1 critique = 3
    assert.equal(result.metrics.llmCalls, 3);
    assert.ok(result.metrics.latencyMs >= 0);
  });
});

test("User Story 2: Feedback-Driven Regeneration on Rejection (P2)", async (t) => {
  await t.test("regenerates with critique feedback and succeeds on second attempt", async () => {
    let callCount = 0;
    const receivedInputs: string[] = [];

    const mockBaseStrategy: ReasoningStrategy = {
      name: "mock-two-pass",
      run: async (input) => {
        callCount++;
        receivedInputs.push(input);
        if (callCount === 1) {
          return {
            answer: "Nada de errado",
            trace: [
              {
                type: "observation",
                node: "test",
                content: "alert: payment-api 500 error",
                timestamp: 10,
              },
              { type: "answer", node: "test", content: "Nada de errado", timestamp: 11 },
            ],
            metrics: { llmCalls: 1, latencyMs: 100 },
          };
        } else {
          return {
            answer: "payment-api está com erro 500",
            trace: [
              {
                type: "observation",
                node: "test",
                content: "alert: payment-api 500 error",
                timestamp: 20,
              },
              {
                type: "answer",
                node: "test",
                content: "payment-api está com erro 500",
                timestamp: 21,
              },
            ],
            metrics: { llmCalls: 1, latencyMs: 120 },
          };
        }
      },
    };

    let criticCallCount = 0;
    const mockCriticModel = {
      withStructuredOutput: () => ({
        invoke: async () => {
          criticCallCount++;
          if (criticCallCount === 1) {
            return {
              approved: false,
              feedback: "Omitiu erro 500 de payment-api.",
            };
          }
          return {
            approved: true,
            feedback: "Agora citou corretamente o erro 500.",
          };
        },
      }),
    };

    const decorated = withReflection(mockBaseStrategy, {
      maxReflection: 2,
      criticModel: mockCriticModel,
    });

    const result = await decorated.run("Verificar alertas");

    assert.equal(callCount, 2, "Base strategy must have run 2 times");
    assert.equal(criticCallCount, 2, "Critic must have evaluated 2 times");
    assert.equal(result.answer, "payment-api está com erro 500");

    // Second input must contain critique feedback
    assert.ok(receivedInputs[1].includes("[Feedback do Crítico (Tentativa 1)]:"));
    assert.ok(receivedInputs[1].includes("Omitiu erro 500 de payment-api."));

    // Trace contains both critique events: 1 rejection + 1 approval
    const critiqueEvents = result.trace.filter((e) => e.type === "critique");
    assert.equal(critiqueEvents.length, 2);
    assert.ok(critiqueEvents[0].content.includes("REPROVADO"));
    assert.ok(critiqueEvents[1].content.includes("APROVADO"));

    // Total LLM calls: 1 (base) + 1 (critique) + 1 (base) + 1 (critique) = 4
    assert.equal(result.metrics.llmCalls, 4);
  });

  await t.test("enforces strict bound at maxReflection ceiling when never approved", async () => {
    let runCalls = 0;
    const mockBaseStrategy: ReasoningStrategy = {
      name: "stubborn-strategy",
      run: async () => {
        runCalls++;
        return {
          answer: `Tentativa teimosa ${runCalls}`,
          trace: [{ type: "answer", node: "test", content: `Tentativa ${runCalls}`, timestamp: Date.now() }],
          metrics: { llmCalls: 1, latencyMs: 50 },
        };
      },
    };

    let criticEvaluations = 0;
    const mockCriticModel = {
      withStructuredOutput: () => ({
        invoke: async () => {
          criticEvaluations++;
          return {
            approved: false,
            feedback: "Ainda reprovado.",
          };
        },
      }),
    };

    const decorated = withReflection(mockBaseStrategy, {
      maxReflection: 2,
      criticModel: mockCriticModel,
    });

    const result = await decorated.run("Input persistente");

    // Initial run (0) + 2 retries (1, 2) = 3 runs total
    assert.equal(runCalls, 3);
    assert.equal(criticEvaluations, 3);
    assert.equal(result.answer, "Tentativa teimosa 3");

    const critiqueEvents = result.trace.filter((e) => e.type === "critique");
    assert.equal(critiqueEvents.length, 3);
    assert.ok(critiqueEvents.every((e) => e.content.includes("REPROVADO")));

    // Telemetry: 3 base + 3 critique = 6
    assert.equal(result.metrics.llmCalls, 6);
  });
});

test("User Story 3: Trace Ordering, Telemetry & Fallback (P3)", async (t) => {
  await t.test("accumulates complete trace chronology across cycles", async () => {
    let step = 0;
    const mockBaseStrategy: ReasoningStrategy = {
      name: "trace-tester",
      run: async () => {
        step++;
        return {
          answer: `Resposta ${step}`,
          trace: [
            { type: "thought", node: "test", content: `Pensamento ${step}`, timestamp: step * 10 },
            {
              type: "observation",
              node: "test",
              content: `Dado ${step}`,
              timestamp: step * 10 + 1,
            },
            { type: "answer", node: "test", content: `Resposta ${step}`, timestamp: step * 10 + 2 },
          ],
          metrics: { llmCalls: 2, latencyMs: 80 },
        };
      },
    };

    let critiqueStep = 0;
    const mockCriticModel = {
      withStructuredOutput: () => ({
        invoke: async () => {
          critiqueStep++;
          return {
            approved: critiqueStep >= 2,
            feedback: critiqueStep >= 2 ? "Aprovado agora" : "Falta dado",
          };
        },
      }),
    };

    const decorated = withReflection(mockBaseStrategy, {
      maxReflection: 1,
      criticModel: mockCriticModel,
    });

    const result = await decorated.run("Trace chronology test");

    const eventTypes = result.trace.map((e) => e.type);
    assert.deepEqual(eventTypes, [
      "thought",
      "observation",
      "answer",
      "critique", // after pass 1
      "thought",
      "observation",
      "answer",
      "critique", // after pass 2 (approval)
    ]);
  });

  await t.test("handles critic failure gracefully without crashing pipeline", async () => {
    const mockBaseStrategy: ReasoningStrategy = {
      name: "crash-test",
      run: async () => ({
        answer: "Resposta base válida",
        trace: [{ type: "answer", node: "test", content: "Resposta base válida", timestamp: 1 }],
        metrics: { llmCalls: 1, latencyMs: 50 },
      }),
    };

    const faultyCriticModel = {
      withStructuredOutput: () => ({
        invoke: async () => {
          throw new Error("OpenRouter rate limit 429");
        },
      }),
    };

    const decorated = withReflection(mockBaseStrategy, {
      maxReflection: 2,
      criticModel: faultyCriticModel,
    });

    const result = await decorated.run("Prompt com crítico quebrado");

    assert.equal(result.answer, "Resposta base válida");
    const critiqueEvent = result.trace.find((e) => e.type === "critique");
    assert.ok(critiqueEvent);
    assert.ok(critiqueEvent.content.includes("ERRO_CRITICO"));
    assert.ok(critiqueEvent.content.includes("rate limit 429"));
  });
});
