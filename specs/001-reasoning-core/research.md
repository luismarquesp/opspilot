# Phase 0 Research: OpsPilot Reasoning Core

**Feature**: OpsPilot Reasoning Core (`001-reasoning-core`)  
**Date**: 2026-09-08  
**Status**: Completed  

## 1. OpenRouter Model Factory Integration

### Decision
Instantiate `@langchain/openai`'s `ChatOpenAI` pointing to `https://openrouter.ai/api/v1` via a centralized factory in `src/agents/model.ts`. Configured with `temperature: 0` for determinism, `apiKey` from `env.OPENROUTER_API_KEY`, and model name from `env.OPEN_ROUTER_MODEL`.

### Rationale
OpenRouter is fully OpenAI API-compatible. Using `ChatOpenAI` from `@langchain/openai` allows seamless integration with LangChain/LangGraph tools, function calling, structured outputs, and streaming callbacks. Centralizing instantiation in `src/agents/model.ts` guarantees configuration consistency and prevents duplicate client creation.

### Alternatives Considered
- **Direct HTTP client (`fetch`/`axios`)**: Rejected because it forfeits LangChain tool-calling, message abstractions, and LangGraph integration.
- **`@langchain/community` OpenRouter provider**: Rejected because `@langchain/openai` is already installed in `package.json` (`^1.5.11`) and is the official modern recommendation for OpenRouter endpoints.

---

## 2. LangGraph ReAct Strategy & Trace Capture

### Decision
Construct the ReAct agent using LangGraph's `@langchain/langgraph/prebuilt` (`createReactAgent`) or equivalent tool-calling state graph. To capture the required `TraceEvent[]` (`thought`, `action`, `observation`, `answer`) and count `llmCalls`:
1. Execute the agent graph with `stream` or `invoke` while attaching a custom callback handler (`BaseCallbackHandler`) or post-processing the resulting messages array (`AIMessage`, `ToolMessage`, `HumanMessage`).
2. Map `AIMessage.tool_calls` to `action` events, `ToolMessage` to `observation` events, intermediate reasoning / content to `thought` events, and terminal `AIMessage.content` to `answer`.
3. Count LLM calls directly via `handleLLMStart` or length of AI message turns.

### Rationale
This architecture uses modern LangGraph primitives, avoids deprecated LangChain `AgentExecutor`, and cleanly extracts chronological typed trace events without interfering with the model's tool-calling logic.

### Alternatives Considered
- **Regex parsing of text outputs ("Action:", "Observation:")**: Rejected because modern LLMs communicate tool invocations via native tool-calling APIs, which are far more reliable than plain text scraping.

---

## 3. Plan-and-Execute Graph Architecture

### Decision
Implement the Plan-and-Execute engine in `src/agents/plan-and-execute.ts` as a custom LangGraph `StateGraph`.

**State Schema**:
```typescript
interface PlanExecuteState {
  input: string;
  plan: string[];
  pastSteps: Array<[step: string, result: string]>;
  response?: string;
  stepCount: number;
}
```

**Nodes**:
1. `planner`: Invokes LLM with structured output schema (`z.object({ steps: z.array(z.string()) })`) to create the initial breakdown. Emits `plan` trace event.
2. `executor`: Takes `plan[0]`, invokes the ReAct tool executor (or model with tools) for that single step, and records `action` and `observation` trace events.
3. `replanner`: Prompts LLM with the original objective, completed steps, and remaining steps. Returns either an updated list of remaining steps or a final answer. Increments `stepCount`. Emits `critique` or `plan` trace event.

**Conditional Edge**:
- If `state.response` is defined OR `state.stepCount >= 8`, route to `END`.
- Otherwise, route back to `executor`.

### Rationale
Strictly complies with the 8-step limit requirement, provides resilient multi-step problem solving, and guarantees clean termination.

### Alternatives Considered
- **Pure iterative while-loop**: Rejected because LangGraph `StateGraph` offers visual inspection, checkpointing support, deterministic edge transitions, and standardized agent architecture across the project.

---

## 4. Operations Data Store & Sequelize Persistence

### Decision
Implement Sequelize models for `Service`, `Alert`, and `Incident` in `src/models/`.
- In production/development: connects to MySQL (`mysql2` dialect).
- In testing / in-memory mode: uses SQLite memory (`sqlite::memory:`) or an in-memory repository implementing the same interface (`IOpsStore`), allowing 100% offline, deterministic tests.
- Seeding: `src/scripts/seed.ts` populates 5 services and 6 alerts (3 firing, 3 resolved).

### Rationale
Satisfies the project convention (Express + MySQL + Sequelize) while fulfilling the test convention (deterministic, fast, zero-network tests via `node:test`).

### Alternatives Considered
- **Direct in-memory mock only**: Rejected because the user prompt and project constitution explicitly specify MySQL and Sequelize.
- **Docker MySQL dependency for tests**: Rejected because unit tests must be offline and runnable without running database daemons.

---

## 5. Unified Trace & Metrics Interface Contract

### Decision
Define in `src/agents/types.ts`:
- Event Types: `'thought' | 'action' | 'observation' | 'plan' | 'critique' | 'answer'`
- Action Event: `{ type: 'action', tool: string, args: Record<string, unknown>, timestamp: number }`
- Metrics: `{ llmCalls: number, latencyMs: number }`
- Strategy Signature:
  ```typescript
  export interface ReasoningStrategy {
    readonly name: string;
    run(input: string, options?: StrategyOptions): Promise<StrategyResult>;
  }
  ```

### Rationale
Provides a standardized contract across all agents, enabling the Arena CLI (`src/arena.ts`) to run, format, and benchmark any strategy interchangeably.
