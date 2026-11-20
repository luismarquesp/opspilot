import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildContext,
  loadContextBudgets,
  pruneHistoryWindow,
  pruneMemoriesByScore,
  boundSummary,
  SYSTEM_PROMPT,
} from "./context-builder.js";
import { estimateTokens } from "./tokens.js";

describe("ContextBuilder Unit Tests (013-context-budget-builder)", () => {
  describe("Untouchable Core (system & userMessage)", () => {
    it("preserves system prompt and user message completely even under zero budgets", () => {
      const customSystem = "Custom System Instructions for Incident Mitigation";
      const userMsg = "Investigate high memory usage on payment-api";

      const result = buildContext({
        systemPrompt: customSystem,
        userMessage: userMsg,
        summary: "Previous incident summary that should be dropped under zero budget",
        history: [
          { role: "user", content: "Old message 1" },
          { role: "assistant", content: "Old message 2" },
        ],
        memories: [
          { fact: "Runbook says restart payment-api", score: 0.9 },
        ],
        budgets: {
          summary: 0,
          history: 0,
          memory: 0,
        },
      });

      // System message is intact
      const systemMessage = result.messages.find((m) => m.role === "system");
      assert.ok(systemMessage, "System message must be present");
      assert.equal(systemMessage.content, customSystem);

      // User message is intact
      const userMessage = result.messages.find((m) => m.role === "user");
      assert.ok(userMessage, "User message must be present");
      assert.equal(userMessage.content, userMsg);

      // Summary, history, and memories dropped due to 0 budgets
      assert.equal(result.stats.retainedHistoryCount, 0);
      assert.equal(result.stats.retainedMemoriesCount, 0);
      assert.equal(result.breakdown.summary, 0);
      assert.equal(result.breakdown.history, 0);
      assert.equal(result.breakdown.memories, 0);
    });

    it("uses default SYSTEM_PROMPT when systemPrompt is omitted", () => {
      const result = buildContext({
        message: "Hello",
      });

      const sys = result.messages.find((m) => m.role === "system");
      assert.ok(sys);
      assert.equal(sys.content, SYSTEM_PROMPT);
    });
  });

  describe("History Window Eviction (corta as mais antigas)", () => {
    it("retains all messages when within budget", () => {
      const history = [
        { role: "user" as const, content: "msg 1" },
        { role: "assistant" as const, content: "msg 2" },
      ];
      const { retained, evicted } = pruneHistoryWindow(history, 100);
      assert.equal(retained.length, 2);
      assert.equal(evicted.length, 0);
    });

    it("drops oldest messages first when exceeding budget (low ceiling)", () => {
      const m1 = { role: "user" as const, content: "This is the very first and oldest message in the conversation" }; // ~16 tokens
      const m2 = { role: "assistant" as const, content: "This is the second message responding to the user" }; // ~13 tokens
      const m3 = { role: "user" as const, content: "This is the most recent third message" }; // ~10 tokens

      const history = [m1, m2, m3];
      // Total tokens = ~39. Let's set budget = 25 tokens.
      // m3 (~10) + m2 (~13) = 23 <= 25. m1 (~16) exceeds 25.
      // Expected: m1 evicted (oldest), m2 and m3 retained.
      const { retained, evicted } = pruneHistoryWindow(history, 25);

      assert.equal(retained.length, 2);
      assert.equal(retained[0].content, m2.content);
      assert.equal(retained[1].content, m3.content);
      assert.equal(evicted.length, 1);
      assert.equal(evicted[0].content, m1.content);
    });

    it("drops all older messages keeping only the most recent if budget only allows one", () => {
      const m1 = { role: "user" as const, content: "Old message 1" };
      const m2 = { role: "assistant" as const, content: "Old message 2" };
      const m3 = { role: "user" as const, content: "Latest message 3" };

      // Latest message 3 takes ~4 tokens. Budget = 5 allows only m3.
      const { retained, evicted } = pruneHistoryWindow([m1, m2, m3], 5);
      assert.equal(retained.length, 1);
      assert.equal(retained[0].content, m3.content);
      assert.equal(evicted.length, 2);
      assert.equal(evicted[0].content, m1.content);
      assert.equal(evicted[1].content, m2.content);
    });
  });

  describe("Memory Eviction by Score (corta menor score)", () => {
    it("drops lowest-score memories first when exceeding budget", () => {
      const memLow = { fact: "Minor fact: dev likes dark mode in terminal", score: 0.35 }; // ~11 tokens
      const memMid = { fact: "Useful fact: auth-service port is 8081", score: 0.75 }; // ~10 tokens
      const memHigh = { fact: "Critical fact: database cluster failover requires root token", score: 0.95 }; // ~16 tokens

      // Let's set budget = 20 tokens.
      // memHigh takes ~16 tokens. Adding memMid (~10) exceeds 20.
      // Expected: memHigh retained, memMid and memLow evicted!
      const { retained, evicted } = pruneMemoriesByScore([memLow, memMid, memHigh], 20);

      assert.equal(retained.length, 1);
      assert.equal(retained[0].fact, memHigh.fact);
      assert.equal(evicted.length, 2);
      // Evicted contains memMid and memLow
      const evictedFacts = evicted.map((e) => e.fact);
      assert.ok(evictedFacts.includes(memMid.fact));
      assert.ok(evictedFacts.includes(memLow.fact));
    });

    it("breaks ties deterministically and handles string memories", () => {
      const memories = [
        "Memory as plain string A",
        "Memory as plain string B",
      ];
      const { retained } = pruneMemoriesByScore(memories, 100);
      assert.equal(retained.length, 2);
      assert.equal(retained[0].fact, "Memory as plain string A");
    });
  });

  describe("Summary Bounding (resumo 200)", () => {
    it("keeps summary within budget", () => {
      const shortSummary = "Summary: auth-service restarted successfully.";
      const bounded = boundSummary(shortSummary, 200);
      assert.equal(bounded, shortSummary);
    });

    it("bounds excessively long summary exceeding token budget", () => {
      const longSummary = "A".repeat(1200); // ~300 tokens
      const bounded = boundSummary(longSummary, 50); // budget 50 tokens = max 200 chars
      assert.ok(estimateTokens(bounded) <= 50);
      assert.equal(bounded.length, 200);
    });
  });

  describe("Environment Variables & Budget Resolution", () => {
    it("uses default budgets (summary: 200, history: 1200, memory: 300)", () => {
      const budgets = loadContextBudgets(undefined, {});
      assert.equal(budgets.summary, 200);
      assert.equal(budgets.history, 1200);
      assert.equal(budgets.window, 1200);
      assert.equal(budgets.memory, 300);
    });

    it("parses CONTEXT_BUDGET_* environment variables", () => {
      const env = {
        CONTEXT_BUDGET_SUMMARY: "150",
        CONTEXT_BUDGET_WINDOW: "800",
        CONTEXT_BUDGET_MEMORY: "250",
      };
      const budgets = loadContextBudgets(undefined, env);
      assert.equal(budgets.summary, 150);
      assert.equal(budgets.history, 800);
      assert.equal(budgets.window, 800);
      assert.equal(budgets.memory, 250);
    });

    it("supports CONTEXT_BUDGET_HISTORY as fallback alias for WINDOW", () => {
      const env = {
        CONTEXT_BUDGET_HISTORY: "950",
      };
      const budgets = loadContextBudgets(undefined, env);
      assert.equal(budgets.history, 950);
      assert.equal(budgets.window, 950);
    });

    it("prioritizes explicit overrides over environment variables", () => {
      const env = {
        CONTEXT_BUDGET_SUMMARY: "500",
      };
      const budgets = loadContextBudgets({ summary: 100 }, env);
      assert.equal(budgets.summary, 100);
    });
  });

  describe("Full buildContext Prompt Assembly", () => {
    it("assembles complete prompt and breakdown correctly", () => {
      const result = buildContext({
        systemPrompt: "System test",
        userMessage: "What is the status of checkout?",
        summary: "Checkout restarted at 10:00",
        history: [
          { role: "user", content: "Is checkout down?" },
          { role: "assistant", content: "Checking checkout now." },
        ],
        memories: [
          { fact: "Checkout runs on k8s cluster east", score: 0.9 },
        ],
      });

      assert.equal(result.messages.length, 5); // system, summary, 2 history, 1 user (with memories)
      assert.equal(result.messages[0].role, "system");
      assert.equal(result.messages[0].content, "System test");

      assert.equal(result.messages[1].role, "system");
      assert.ok(result.messages[1].content.includes("[Resumo da Conversa Anterior]"));

      assert.equal(result.messages[2].role, "user");
      assert.equal(result.messages[2].content, "Is checkout down?");

      assert.equal(result.messages[3].role, "assistant");
      assert.equal(result.messages[3].content, "Checking checkout now.");

      const lastUser = result.messages[4];
      assert.equal(lastUser.role, "user");
      assert.ok(lastUser.content.includes("[Memória Relevante do Usuário]"));
      assert.ok(lastUser.content.includes("What is the status of checkout?"));

      assert.ok((result.breakdown.totalEstimated ?? 0) > 0);
      assert.equal(result.stats.retainedHistoryCount, 2);
      assert.equal(result.stats.retainedMemoriesCount, 1);
    });
  });
});
