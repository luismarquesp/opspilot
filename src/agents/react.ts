import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createModel } from "./model.js";
import { opsTools } from "./tools.js";
import { lastText, toTrace, countAiMessages } from "./trace.js";
import type { ReasoningStrategy, StrategyOptions, StrategyResult } from "./types.js";
import { extractTokenUsage } from "../context/tokens.js";
import { buildContext } from "../context/context-builder.js";

export interface RunnableAgent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke(input: any, config?: any): Promise<any>;
}

export function createReactStrategy(customAgentOrModel?: RunnableAgent | ReturnType<typeof createModel>): ReasoningStrategy {
  return {
    name: "react",
    async run(input: string, options?: StrategyOptions): Promise<StrategyResult> {
      const started = Date.now();
      const recursionLimit = options?.maxIterations ? Math.max(options.maxIterations * 2, 4) : 12;

      let agent: RunnableAgent;
      let llmInstance: any;
      if (customAgentOrModel && typeof (customAgentOrModel as RunnableAgent).invoke === "function" && !("bindTools" in customAgentOrModel)) {
        agent = customAgentOrModel as RunnableAgent;
      } else {
        llmInstance = (customAgentOrModel as ReturnType<typeof createModel>) ?? createModel({ node: "react" });
        agent = createReactAgent({
          llm: llmInstance as any,
          tools: opsTools,
        });
      }

      const context = buildContext({
        systemPrompt: options?.systemPrompt,
        userMessage: input,
        summary: options?.summary,
        history: options?.history,
        memories: options?.recalledMemories,
        budgets: options?.budgets,
      });

      const result = await agent.invoke(
        { messages: context.messages },
        { recursionLimit }
      );

      const messages = (result as { messages?: unknown[] })?.messages ?? [];
      const newMessages = messages.slice(Math.max(0, context.messages.length - 1));
      const tokenUsage = extractTokenUsage(newMessages);
      const fallbackEvents: any[] = (llmInstance as any)?.fallbackEvents ?? [];
      const modelUsed: string | undefined = (llmInstance as any)?.lastModelUsed;
      const strategyTrace = toTrace(newMessages, "react");

      return {
        answer: lastText(messages),
        trace: [...fallbackEvents, ...strategyTrace],
        metrics: {
          llmCalls: countAiMessages(newMessages),
          latencyMs: Date.now() - started,
          promptTokens: tokenUsage.promptTokens,
          completionTokens: tokenUsage.completionTokens,
          totalTokens: tokenUsage.totalTokens,
          ...(modelUsed ? { modelUsed } : {}),
        },
      };
    },
  };
}

export const reactStrategy: ReasoningStrategy = createReactStrategy();
