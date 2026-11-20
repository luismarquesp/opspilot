import { reactStrategy } from "./react.js";
import { planAndExecuteStrategy } from "./plan-and-execute.js";
import { withReflection } from "./reflection.js";
import type { ReasoningStrategy, ReflectionOptions } from "./types.js";

export const STRATEGY_REGISTRY: Record<string, ReasoningStrategy> = {
  react: reactStrategy,
  "plan-and-execute": planAndExecuteStrategy,
};

export function resolveStrategy(
  name: string,
  reflect: boolean = false,
  registry: Record<string, ReasoningStrategy> = STRATEGY_REGISTRY,
  reflectionOptions?: ReflectionOptions
): ReasoningStrategy | undefined {
  const strategy = registry[name];
  if (!strategy) {
    return undefined;
  }

  if (reflect) {
    return withReflection(strategy, reflectionOptions);
  }

  return strategy;
}

export {
  createProductionGraph,
  runProductionGraph,
  ProductionGraphState,
  ROUTER_DECISION_TABLE_PROMPT,
  type ProductionGraphInput,
  type ProductionGraphOutput,
} from "./production-graph.js";

export type { ReasoningStrategy, ReflectionOptions };
