import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  baseModel,
  createModel,
  ResilientChatModel,
  type ModelOptions,
} from "./model.js";
import { ModelUnavailableError } from "./errors.js";
import { parseFallbackModels } from "../config/env.js";
import type { FallbackTraceEvent } from "./types.js";

test("Model Resilience & Fallbacks Unit Tests", async (t) => {
  await t.test("parseFallbackModels parses comma-separated lists and excludes primary model", () => {
    assert.deepEqual(parseFallbackModels(""), []);
    assert.deepEqual(parseFallbackModels(undefined), []);
    assert.deepEqual(
      parseFallbackModels("openai/gpt-4o-mini, meta-llama/llama-3.3-70b-instruct", "anthropic/claude-3.5-sonnet"),
      ["openai/gpt-4o-mini", "meta-llama/llama-3.3-70b-instruct"]
    );
    // Deduplicates and excludes primary
    assert.deepEqual(
      parseFallbackModels(
        "anthropic/claude-3.5-sonnet, openai/gpt-4o-mini, openai/gpt-4o-mini",
        "anthropic/claude-3.5-sonnet"
      ),
      ["openai/gpt-4o-mini"]
    );
  });

  await t.test("US1 (MVP): Primary model failure cascades to fallback model and emits fallback event", async () => {
    const fallbackEvents: FallbackTraceEvent[] = [];

    // Mock primary that always fails
    let primaryCalls = 0;
    const mockPrimary = {
      modelName: "primary-model",
      invoke: async () => {
        primaryCalls++;
        throw new Error("429 Rate limit exceeded on primary");
      },
      withRetry: function () {
        return this;
      },
    };

    // Mock backup that succeeds
    let backupCalls = 0;
    const mockBackup = {
      modelName: "backup-model-1",
      invoke: async () => {
        backupCalls++;
        return { content: "Answer from backup model" };
      },
      withRetry: function () {
        return this;
      },
    };

    const resilientModel = new ResilientChatModel({
      primaryModelName: "primary-model",
      fallbackModelNames: ["backup-model-1"],
      primaryModel: mockPrimary as any,
      backupModels: [mockBackup as any],
      onFallback: (event) => fallbackEvents.push(event),
      node: "react",
    });

    const result = await resilientModel.invoke("Status dos alertas");

    assert.equal(result.content, "Answer from backup model");
    assert.ok(primaryCalls > 0, "Primary model should have been called");
    assert.equal(backupCalls, 1, "Backup model should have been called once");
    assert.equal(resilientModel.lastModelUsed, "backup-model-1");

    assert.equal(fallbackEvents.length, 1);
    assert.equal(fallbackEvents[0].type, "fallback");
    assert.equal(fallbackEvents[0].node, "react");
    assert.equal(fallbackEvents[0].fromModel, "primary-model");
    assert.equal(fallbackEvents[0].toModel, "backup-model-1");
    assert.ok(fallbackEvents[0].reason.includes("429"));
  });

  await t.test("US1 (MVP): Primary model success does not trigger fallback and records primary modelUsed", async () => {
    const fallbackEvents: FallbackTraceEvent[] = [];

    const mockPrimary = {
      modelName: "primary-model",
      invoke: async () => ({ content: "Answer from primary" }),
      withRetry: function () {
        return this;
      },
    };

    const mockBackup = {
      modelName: "backup-model",
      invoke: async () => {
        throw new Error("Should not be called");
      },
      withRetry: function () {
        return this;
      },
    };

    const resilientModel = new ResilientChatModel({
      primaryModelName: "primary-model",
      fallbackModelNames: ["backup-model"],
      primaryModel: mockPrimary as any,
      backupModels: [mockBackup as any],
      onFallback: (event) => fallbackEvents.push(event),
    });

    const result = await resilientModel.invoke("Status dos alertas");

    assert.equal(result.content, "Answer from primary");
    assert.equal(resilientModel.lastModelUsed, "primary-model");
    assert.equal(fallbackEvents.length, 0, "No fallback event should be emitted on success");
  });

  await t.test("US2: Transient primary error retries on primary model before succeeding", async () => {
    let attempts = 0;
    const mockPrimary = {
      modelName: "primary-model",
      invoke: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("Temporary network glitch (503)");
        }
        return { content: "Success on attempt 2" };
      },
    };

    // ResilientChatModel with stopAfterAttempt: 2
    const resilientModel = new ResilientChatModel({
      primaryModelName: "primary-model",
      fallbackModelNames: ["backup-model"],
      primaryModel: mockPrimary as any,
      backupModels: [],
      stopAfterAttempt: 2,
    });

    const result = await resilientModel.invoke("Status");
    assert.equal(result.content, "Success on attempt 2");
    assert.equal(attempts, 2);
    assert.equal(resilientModel.lastModelUsed, "primary-model");
    assert.equal(resilientModel.fallbackEvents.length, 0);
  });

  await t.test("US3: All models failing raises ModelUnavailableError", async () => {
    const mockPrimary = {
      modelName: "primary-model",
      invoke: async () => {
        throw new Error("Primary dead");
      },
    };

    const mockBackup = {
      modelName: "backup-model",
      invoke: async () => {
        throw new Error("Backup dead");
      },
    };

    const resilientModel = new ResilientChatModel({
      primaryModelName: "primary-model",
      fallbackModelNames: ["backup-model"],
      primaryModel: mockPrimary as any,
      backupModels: [mockBackup as any],
      stopAfterAttempt: 1,
    });

    await assert.rejects(
      async () => {
        await resilientModel.invoke("Status");
      },
      (err: unknown) => {
        assert.ok(err instanceof ModelUnavailableError);
        assert.equal(err.code, "model_unavailable");
        assert.deepEqual(err.attemptedModels, ["primary-model", "backup-model"]);
        return true;
      }
    );
  });

  await t.test("US1 / US4: withStructuredOutput inherits resilience and fallback tracking", async () => {
    const testSchema = z.object({ verdict: z.string() });
    const fallbackEvents: FallbackTraceEvent[] = [];

    const mockPrimary = {
      modelName: "primary-model",
      withStructuredOutput: () => ({
        invoke: async () => {
          throw new Error("Structured output failed on primary");
        },
      }),
    };

    const mockBackup = {
      modelName: "backup-model",
      withStructuredOutput: () => ({
        invoke: async () => ({ verdict: "approved" }),
      }),
    };

    const resilientModel = new ResilientChatModel({
      primaryModelName: "primary-model",
      fallbackModelNames: ["backup-model"],
      primaryModel: mockPrimary as any,
      backupModels: [mockBackup as any],
      onFallback: (e) => fallbackEvents.push(e),
      node: "router",
    });

    const structured = resilientModel.withStructuredOutput(testSchema);
    const result = await structured.invoke("Avalie isso");

    assert.deepEqual(result, { verdict: "approved" });
    assert.equal(resilientModel.lastModelUsed, "backup-model");
    assert.equal(fallbackEvents.length, 1);
    assert.equal(fallbackEvents[0].node, "router");
    assert.equal(fallbackEvents[0].fromModel, "primary-model");
    assert.equal(fallbackEvents[0].toModel, "backup-model");
  });
});
