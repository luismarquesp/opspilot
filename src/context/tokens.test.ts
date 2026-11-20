import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateTokens,
  extractTokenUsage,
  estimateContextBreakdown,
} from "./tokens.js";

test("src/context/tokens.ts Unit Tests (US1)", async (t) => {
  await t.test("estimateTokens returns 0 for empty or nullish values", () => {
    assert.equal(estimateTokens(""), 0);
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
  });

  await t.test("estimateTokens calculates Math.ceil(length / 4) for various string lengths", () => {
    assert.equal(estimateTokens("a"), 1);
    assert.equal(estimateTokens("ab"), 1);
    assert.equal(estimateTokens("abc"), 1);
    assert.equal(estimateTokens("abcd"), 1);
    assert.equal(estimateTokens("abcde"), 2);
    assert.equal(estimateTokens("12345678"), 2);
    assert.equal(estimateTokens("123456789"), 3);
    assert.equal(estimateTokens("a".repeat(400)), 100);
    assert.equal(estimateTokens("a".repeat(401)), 101);
  });

  await t.test("extractTokenUsage returns zeros for empty array or non-array", () => {
    assert.deepEqual(extractTokenUsage([]), {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    // @ts-expect-error testing invalid input
    assert.deepEqual(extractTokenUsage(null), {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  await t.test("extractTokenUsage extracts standard LangChain usage_metadata", () => {
    const aiMessage = {
      role: "assistant",
      content: "Hello",
      usage_metadata: {
        input_tokens: 42,
        output_tokens: 15,
        total_tokens: 57,
      },
    };

    const usage = extractTokenUsage([aiMessage]);
    assert.deepEqual(usage, {
      promptTokens: 42,
      completionTokens: 15,
      totalTokens: 57,
    });
  });

  await t.test("extractTokenUsage extracts response_metadata.tokenUsage fallback", () => {
    const aiMessage = {
      role: "assistant",
      content: "Hello",
      response_metadata: {
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 25,
          totalTokens: 125,
        },
      },
    };

    const usage = extractTokenUsage([aiMessage]);
    assert.deepEqual(usage, {
      promptTokens: 100,
      completionTokens: 25,
      totalTokens: 125,
    });
  });

  await t.test("extractTokenUsage accumulates tokens across multiple AI messages", () => {
    const messages = [
      {
        role: "user",
        content: "What is the status?",
      },
      {
        role: "assistant",
        content: "Calling tool...",
        usage_metadata: {
          input_tokens: 50,
          output_tokens: 10,
          total_tokens: 60,
        },
      },
      {
        role: "tool",
        content: "Status OK",
      },
      {
        role: "assistant",
        content: "Everything is OK.",
        usage_metadata: {
          input_tokens: 70,
          output_tokens: 20,
          total_tokens: 90,
        },
      },
    ];

    const usage = extractTokenUsage(messages);
    assert.deepEqual(usage, {
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
    });
  });

  await t.test("estimateContextBreakdown correctly partitions tokens by component including summary", () => {
    const breakdown = estimateContextBreakdown({
      system: "a".repeat(40), // 10 tokens
      history: [
        { role: "user", content: "b".repeat(20) }, // 5 tokens
        { role: "assistant", content: "c".repeat(40) }, // 10 tokens
      ], // history total = 15 tokens
      summary: "s".repeat(28), // 7 tokens
      memories: [
        "d".repeat(12), // 3 tokens
        "e".repeat(16), // 4 tokens
      ], // memories total = 7 tokens
      userMessage: "f".repeat(24), // 6 tokens
    });

    assert.equal(breakdown.system, 10);
    assert.equal(breakdown.history, 15);
    assert.equal(breakdown.summary, 7);
    assert.equal(breakdown.memories, 7);
    assert.equal(breakdown.userMessage, 6);
    assert.equal(breakdown.totalEstimated, 45);
  });

  await t.test("estimateContextBreakdown handles empty or missing components gracefully", () => {
    const breakdown = estimateContextBreakdown({});
    assert.deepEqual(breakdown, {
      system: 0,
      history: 0,
      summary: 0,
      memories: 0,
      userMessage: 0,
      totalEstimated: 0,
    });
  });
});
