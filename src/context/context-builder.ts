import { z } from "zod";
import type {
  BuildInput,
  BuildContext,
  ContextBudgets,
  HistoryMessage,
  MemoryItem,
} from "../agents/types.js";
import { estimateTokens } from "./tokens.js";

export const SYSTEM_PROMPT =
  "Você é o OpsPilot, copiloto de plantão responsável por diagnosticar e mitigar incidentes de produção.";

// ---------------------------------------------------------------------------
// Schemas & Configuration
// ---------------------------------------------------------------------------

export const ContextBudgetsSchema = z.object({
  system: z.coerce.number().nonnegative().default(Number.MAX_SAFE_INTEGER),
  summary: z.coerce.number().nonnegative().default(200),
  history: z.coerce.number().nonnegative().default(1200),
  window: z.coerce.number().nonnegative().optional(),
  memory: z.coerce.number().nonnegative().default(300),
});

/**
 * Loads context budgets from environment variables or custom overrides.
 * Resilient fallback to system defaults (summary: 200, history/window: 1200, memory: 300).
 */
export function loadContextBudgets(
  overrides?: Partial<ContextBudgets>,
  env: NodeJS.ProcessEnv = process.env
): ContextBudgets {
  const envSummary = env.CONTEXT_BUDGET_SUMMARY;
  const envHistory = env.CONTEXT_BUDGET_WINDOW ?? env.CONTEXT_BUDGET_HISTORY;
  const envMemory = env.CONTEXT_BUDGET_MEMORY;
  const envSystem = env.CONTEXT_BUDGET_SYSTEM;

  const raw = {
    system: overrides?.system ?? (envSystem !== undefined ? Number(envSystem) : Number.MAX_SAFE_INTEGER),
    summary: overrides?.summary ?? (envSummary !== undefined ? Number(envSummary) : 200),
    history: overrides?.history ?? overrides?.window ?? (envHistory !== undefined ? Number(envHistory) : 1200),
    memory: overrides?.memory ?? (envMemory !== undefined ? Number(envMemory) : 300),
  };

  const parsed = ContextBudgetsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      system: Number.MAX_SAFE_INTEGER,
      summary: 200,
      history: 1200,
      window: 1200,
      memory: 300,
    };
  }

  const result = parsed.data;
  const historyBudget = result.history;

  return {
    system: result.system,
    summary: result.summary,
    history: historyBudget,
    window: historyBudget,
    memory: result.memory,
  };
}

// ---------------------------------------------------------------------------
// Section Data Structures
// ---------------------------------------------------------------------------

export type CutPolicy = "never" | "oldest-first" | "lowest-score-first" | "truncate";

export interface SectionOptions {
  budget: number;
  cut: CutPolicy;
}

export interface ContextSection<T = unknown> {
  name: string;
  content: T;
  budget: number;
  cut: CutPolicy;
}

export interface FittedSection<T = unknown> {
  name: string;
  content: T;
  estimatedTokens: number;
  retainedCount: number;
  evictedCount: number;
}

/**
 * Creates a section descriptor for prompt assembly.
 */
export function section<T>(
  name: string,
  content: T,
  options: SectionOptions
): ContextSection<T> {
  return {
    name,
    content,
    budget: options.budget,
    cut: options.cut,
  };
}

// ---------------------------------------------------------------------------
// Pure Pruning & Bounding Helpers
// ---------------------------------------------------------------------------

/**
 * Truncates / bounds summary text to stay within budget tokens (~4 chars per token).
 */
export function boundSummary(summary: string | null | undefined, budget: number): string {
  if (!summary || summary.trim().length === 0 || budget <= 0) {
    return "";
  }
  const tokens = estimateTokens(summary);
  if (tokens <= budget) {
    return summary.trim();
  }
  const maxChars = budget * 4;
  return summary.trim().slice(0, maxChars).trimEnd();
}

/**
 * Prunes history messages in chronological order (oldest first) when exceeding budget.
 * Accumulates backwards from newest to oldest.
 */
export function pruneHistoryWindow(
  history: readonly HistoryMessage[] | null | undefined,
  budget: number
): { retained: HistoryMessage[]; evicted: HistoryMessage[] } {
  if (!history || history.length === 0 || budget <= 0) {
    return { retained: [], evicted: history ? [...history] : [] };
  }

  const messages = [...history];
  const retainedReversed: HistoryMessage[] = [];
  let accumulatedTokens = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg.content);

    if (accumulatedTokens + msgTokens <= budget) {
      retainedReversed.push(msg);
      accumulatedTokens += msgTokens;
    } else {
      // If we haven't retained any message yet, keep at least the latest message if budget > 0
      if (retainedReversed.length === 0 && budget > 0) {
        retainedReversed.push(msg);
      }
      break;
    }
  }

  const retained = retainedReversed.reverse();
  const retainedSet = new Set(retained);
  const evicted = messages.filter((m) => !retainedSet.has(m));

  return { retained, evicted };
}

/**
 * Prunes recalled memories by score (lowest score first) when exceeding budget.
 */
export function pruneMemoriesByScore(
  memories: readonly (string | MemoryItem)[] | null | undefined,
  budget: number
): { retained: MemoryItem[]; evicted: MemoryItem[] } {
  if (!memories || memories.length === 0 || budget <= 0) {
    return { retained: [], evicted: [] };
  }

  const normalized: MemoryItem[] = memories.map((m) =>
    typeof m === "string" ? { fact: m, score: 1.0 } : { fact: m.fact, score: m.score ?? 1.0 }
  );

  // Sort descending by score; break ties deterministically by original array index
  const indexed = normalized.map((item, idx) => ({ item, idx }));
  indexed.sort((a, b) => {
    const diff = (b.item.score ?? 0) - (a.item.score ?? 0);
    return diff !== 0 ? diff : a.idx - b.idx;
  });

  const retained: MemoryItem[] = [];
  const evicted: MemoryItem[] = [];
  let accumulatedTokens = 0;

  for (const { item } of indexed) {
    const itemTokens = estimateTokens(item.fact);
    if (accumulatedTokens + itemTokens <= budget) {
      retained.push(item);
      accumulatedTokens += itemTokens;
    } else {
      evicted.push(item);
    }
  }

  return { retained, evicted };
}

// ---------------------------------------------------------------------------
// fitToBudget & assemble
// ---------------------------------------------------------------------------

/**
 * Applies token budget and eviction policy to a section.
 */
export function fitToBudget(sec: ContextSection<unknown>): FittedSection<unknown> {
  const { name, content, budget, cut } = sec;

  if (cut === "never") {
    if (name === "summary") {
      const summaryStr = typeof content === "string" ? content : "";
      if (budget === 0 || !summaryStr.trim()) {
        return {
          name,
          content: "",
          estimatedTokens: 0,
          retainedCount: 0,
          evictedCount: summaryStr ? 1 : 0,
        };
      }
      const bounded = boundSummary(summaryStr, budget);
      const tokens = estimateTokens(bounded);
      return {
        name,
        content: bounded,
        estimatedTokens: tokens,
        retainedCount: bounded ? 1 : 0,
        evictedCount: 0,
      };
    }

    // System prompt and other untouched sections
    const str = typeof content === "string" ? content : "";
    const tokens = estimateTokens(str);
    return {
      name,
      content: str,
      estimatedTokens: tokens,
      retainedCount: str ? 1 : 0,
      evictedCount: 0,
    };
  }

  if (cut === "oldest-first") {
    const list = Array.isArray(content) ? (content as HistoryMessage[]) : [];
    const { retained, evicted } = pruneHistoryWindow(list, budget);
    const tokens = retained.reduce((acc, m) => acc + estimateTokens(m.content), 0);
    return {
      name,
      content: retained,
      estimatedTokens: tokens,
      retainedCount: retained.length,
      evictedCount: evicted.length,
    };
  }

  if (cut === "lowest-score-first") {
    const list = Array.isArray(content) ? (content as (string | MemoryItem)[]) : [];
    const { retained, evicted } = pruneMemoriesByScore(list, budget);
    const tokens = retained.reduce((acc, m) => acc + estimateTokens(m.fact), 0);
    return {
      name,
      content: retained,
      estimatedTokens: tokens,
      retainedCount: retained.length,
      evictedCount: evicted.length,
    };
  }

  // Fallback
  return {
    name,
    content,
    estimatedTokens: 0,
    retainedCount: 0,
    evictedCount: 0,
  };
}

/**
 * Assembles fitted sections and user message into prompt messages and metrics.
 */
export function assemble(fitted: FittedSection<unknown>[], rawMessage: string): BuildContext {
  const message = rawMessage ?? "";
  const messages: Array<{ role: string; content: string }> = [];

  let systemTokens = 0;
  let summaryTokens = 0;
  let historyTokens = 0;
  let memoriesTokens = 0;

  let retainedHistoryCount = 0;
  let evictedHistoryCount = 0;
  let retainedMemoriesCount = 0;
  let evictedMemoriesCount = 0;

  let retainedMemories: MemoryItem[] = [];

  for (const f of fitted) {
    if (f.name === "system") {
      const text = typeof f.content === "string" ? f.content.trim() : "";
      if (text) {
        messages.push({ role: "system", content: text });
        systemTokens = f.estimatedTokens;
      }
    } else if (f.name === "summary") {
      const text = typeof f.content === "string" ? f.content.trim() : "";
      if (text) {
        messages.push({
          role: "system",
          content: `[Resumo da Conversa Anterior]\n${text}`,
        });
        summaryTokens = f.estimatedTokens;
      }
    } else if (f.name === "history") {
      const hist = Array.isArray(f.content) ? (f.content as HistoryMessage[]) : [];
      for (const m of hist) {
        messages.push({ role: m.role, content: m.content });
      }
      historyTokens = f.estimatedTokens;
      retainedHistoryCount = f.retainedCount;
      evictedHistoryCount = f.evictedCount;
    } else if (f.name === "memories") {
      retainedMemories = Array.isArray(f.content) ? (f.content as MemoryItem[]) : [];
      memoriesTokens = f.estimatedTokens;
      retainedMemoriesCount = f.retainedCount;
      evictedMemoriesCount = f.evictedCount;
    }
  }

  // Assemble userPrompt with memories (if any)
  let userPrompt = message;
  if (retainedMemories.length > 0) {
    const memoryContext = retainedMemories.map((m) => `- ${m.fact}`).join("\n");
    userPrompt = `[Memória Relevante do Usuário]\n${memoryContext}\n\n${message}`;
  }

  // Untouchable user message appended to prompt
  messages.push({ role: "user", content: userPrompt });

  const userMessageTokens = estimateTokens(message);
  const totalEstimated = systemTokens + summaryTokens + historyTokens + memoriesTokens + userMessageTokens;

  return {
    messages,
    userPrompt,
    breakdown: {
      system: systemTokens,
      history: historyTokens,
      summary: summaryTokens,
      memories: memoriesTokens,
      userMessage: userMessageTokens,
      totalEstimated,
    },
    stats: {
      retainedHistoryCount,
      evictedHistoryCount,
      retainedMemoriesCount,
      evictedMemoriesCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Main Entrypoint
// ---------------------------------------------------------------------------

/**
 * Builds prompt context for ALL reasoning strategies with section budgets.
 */
export function buildContext(input: BuildInput): BuildContext {
  const message = input.message ?? input.userMessage ?? "";
  const B = loadContextBudgets(input.budgets);

  const systemContent = input.systemPrompt ?? SYSTEM_PROMPT;
  const summaryContent =
    input.summary ??
    (input.conversationId && input.conversations?.summaryOf
      ? input.conversations.summaryOf(input.conversationId)
      : undefined);

  const historyContent =
    input.history ??
    (input.conversationId && input.conversations?.lastMessages
      ? input.conversations.lastMessages(input.conversationId, 8)
      : []);

  const memoriesContent = input.memories ?? [];

  const sections = [
    section("system", systemContent, { budget: B.system, cut: "never" }),
    section("summary", summaryContent, { budget: B.summary, cut: "never" }),
    section("history", historyContent, { budget: B.history, cut: "oldest-first" }),
    section("memories", memoriesContent, { budget: B.memory, cut: "lowest-score-first" }),
  ];

  const fitted = sections.map(fitToBudget);

  return assemble(fitted, message);
}
