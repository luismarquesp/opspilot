# Feature Specification: OpsPilot Reasoning Core

**Feature Branch**: `001-reasoning-core`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "Núcleo de raciocínio do OpsPilot: Interface comum ReasoningStrategy: name + run(input) -> (answer, trace, metrics). trace = eventos tipados (thought | action | observation | plan | critique | answer); action carrega (tool, args). metrics = (llmCalls, latencyMs). Fábrica única em src/agents/model.ts lendo OPENROUTER_API_KEY e OPEN_ROUTER_MODEL (baseUrl do OpenRouter), temperatura 0. Ferramentas mock em src/agents/tools.ts sobre um store in-memory pré-populado (o seed primário: 5 serviços, 6 alertas variados - 3 firing, 3 resolved - crie um script para rodar o seed e execute ele no final desse prompt): list_alerts(status), open_incident(title, service, severity), resolve_incident(id). Schemas zod, banco mysql, utilizando sequelize. Estratégia ReAct em src/agents/react.ts usando o agente ReAct pré-construído do LangGraph com essas tools, capturando o trace completo. Estratégia Plan-and-Execute em src/agents/plan-and-execute.ts como grafo: planner (saída estruturada: lista de passos), executor (um passo por vez com as tools), replanner (revisa o restante após cada passo; encerra quando não resta nada). Máximo 8 passos. Toda estratégia respeita limite de iterações e conta chamadas LLM. Arena mínima em src/arena.ts: roda 1+ estratégias sobre o mesmo input e imprime traces e métricas (flags --strategies e --max-iterations). Testes: store e formatação de trace (determinísticos, sem rede)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reactive Alert Investigation and Incident Response (Priority: P1)

As an on-call Site Reliability Engineer (SRE), I want OpsPilot to autonomously inspect active production alerts and execute remediation actions (such as opening or resolving incidents) through an interactive reasoning loop, so that alerts are addressed quickly with complete visibility into why and how each action was taken.

**Why this priority**: The ReAct strategy forms the foundational reactive reasoning mechanism for operational triage, enabling autonomous incident management with full auditability.

**Independent Test**: Can be independently verified by submitting an operational prompt (e.g. "Check firing alerts and create a critical incident for degraded payments") to the ReAct reasoning strategy, verifying that it queries alerts, creates an incident, and outputs a complete chronological trace with execution metrics.

**Acceptance Scenarios**:

1. **Given** 3 firing alerts and 3 resolved alerts in the store, **When** the SRE asks the ReAct agent to inspect firing alerts and open an incident for any payment service alert, **Then** the agent invokes `list_alerts` with status "firing", identifies the affected service, invokes `open_incident` with title, service, and severity, and returns a clear final answer accompanied by ordered events (`thought`, `action`, `observation`, `answer`).
2. **Given** an existing open incident ID in the store, **When** the SRE asks the ReAct agent to resolve that incident, **Then** the agent invokes `resolve_incident` with the incident ID, captures tool observation, and confirms the incident resolution with metrics (`llmCalls`, `latencyMs`).

---

### User Story 2 - Structured Multi-Step Planning and Execution (Priority: P2)

As an SRE managing complex multi-service outages, I want OpsPilot to generate an upfront plan of action, execute each step sequentially with operational tools, and dynamically re-evaluate remaining steps after each action, so that multi-stage troubleshooting proceeds systematically without exceeding resource bounds.

**Why this priority**: Complex incident triage requires deliberate planning and replanning rather than purely reactive next-step prediction, avoiding loops and hallucinations on multi-stage operational tasks.

**Independent Test**: Can be tested independently by submitting a multi-phase task (e.g., "Analyze firing alerts, open an incident for the database, and verify remaining services") to the Plan-and-Execute strategy and verifying that it generates a step-by-step plan, executes steps sequentially, replans dynamically, and caps execution at 8 steps.

**Acceptance Scenarios**:

1. **Given** a multi-part incident management task, **When** processed by the Plan-and-Execute strategy, **Then** the planner emits a structured list of discrete steps, the executor carries out the next step using available tools, and the replanner inspects the result to update or complete remaining steps until all steps are resolved.
2. **Given** a complex or ambiguous operational prompt, **When** the replanner reaches 8 executed steps, **Then** the strategy stops further execution gracefully, records a termination notice, and outputs the collected trace and accumulated metrics without crashing.

---

### User Story 3 - Strategy Arena Benchmarking and Comparative Inspection (Priority: P3)

As an operations engineering lead, I want to run multiple reasoning strategies side-by-side against the same incident prompt using a CLI arena tool, so that our team can benchmark reasoning quality, step counts, LLM call consumption, and response latency.

**Why this priority**: Empirically comparing reasoning algorithms on identical inputs allows engineers to choose the most cost-effective and accurate strategy for production automation.

**Independent Test**: Can be tested by invoking the CLI arena with flags `--strategies react,plan-and-execute --max-iterations 6`, verifying that both engines run the provided incident prompt, format each trace cleanly, and output a comparative summary of metrics.

**Acceptance Scenarios**:

1. **Given** an operational prompt, **When** running `npm run arena -- --strategies react,plan-and-execute`, **Then** the CLI executes both strategies, streams or prints the typed traces (`thought`, `action`, `observation`, `plan`, `critique`, `answer`), and prints a comparison table showing latency (ms) and LLM call counts.
2. **Given** a restrictive `--max-iterations 2` flag, **When** a strategy exceeds 2 iterations, **Then** it halts cleanly with an iteration limit notice and reports partial traces and metrics.

---

### User Story 4 - Ground-Truth Operations Store & Seeding Lifecycle (Priority: P4)

As a developer or automated test suite, I need a deterministic store of alerts and services seeded with representative production data (5 services, 6 alerts: 3 firing and 3 resolved), so that reasoning engines and operational tools run against realistic, predictable states.

**Why this priority**: Reliable, reproducible reasoning benchmarks and deterministic unit tests require consistent, verifiable baseline operational data.

**Independent Test**: Can be verified by running the database seed script and confirming via the store interface that exactly 5 services and 6 alerts (3 firing, 3 resolved) exist and match schema validations.

**Acceptance Scenarios**:

1. **Given** an empty or existing store, **When** the seed script is executed, **Then** 5 services and 6 alerts (3 firing, 3 resolved) are populated with valid relationships and timestamps.
2. **Given** seeded alert and incident data, **When** `list_alerts` is invoked with `status: "firing"`, **Then** exactly 3 firing alerts are returned matching Zod schema definitions.

---

### Edge Cases

- **Missing or Invalid Credentials**: What happens when `OPENROUTER_API_KEY` is unset or invalid? The system MUST throw a descriptive domain configuration error before initiating reasoning.
- **Malformed Tool Arguments**: What happens if an LLM generates invalid parameters for a tool? The tool validation layer MUST catch schema mismatches via Zod and return a structured error observation back to the agent rather than crashing.
- **ReAct Infinite Loop Prevention**: What happens if the ReAct strategy gets caught in a circular reasoning loop? The iteration guard MUST terminate execution once `--max-iterations` is reached.
- **Plan-and-Execute Step Saturation**: What happens when replanning suggests more than 8 steps? The replanner MUST truncate or conclude the plan at 8 steps maximum and synthesize the final answer.
- **Store Query Non-Existent Entity**: What happens when `resolve_incident` is called on an unknown incident ID? The tool MUST return a clear error observation indicating the incident was not found.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST implement a unified `ReasoningStrategy` contract exposing `name` and a `run(input, options)` method returning a standardized result containing `answer: string`, `trace: TraceEvent[]`, and `metrics: { llmCalls: number, latencyMs: number }`.
- **FR-002**: System MUST define strongly typed trace events covering `thought`, `action` (including `tool` and `args`), `observation`, `plan`, `critique`, and `answer`.
- **FR-003**: System MUST provide a centralized model factory reading `OPENROUTER_API_KEY` and `OPEN_ROUTER_MODEL`, configuring client connections to OpenRouter with a deterministic temperature of `0`.
- **FR-004**: System MUST provide operational incident management tools:
  - `list_alerts`: Filters alerts by status (`firing`, `resolved`, or all).
  - `open_incident`: Creates a new incident with `title`, `service`, and `severity`.
  - `resolve_incident`: Marks an existing incident as resolved by `id`.
- **FR-005**: All tool inputs and outputs MUST be validated at the boundary using Zod schemas.
- **FR-006**: System MUST persist and query service and alert entities through MySQL/Sequelize models with a fallback in-memory capability for rapid offline testing.
- **FR-007**: System MUST provide an executable seed script that populates exactly 5 services and 6 alerts (3 firing and 3 resolved).
- **FR-008**: System MUST implement a `ReAct` reasoning strategy utilizing LangGraph's tool-calling agent pattern that records complete intermediate steps and tool invocations into the unified trace.
- **FR-009**: System MUST implement a `Plan-and-Execute` reasoning strategy structured as a LangGraph state graph consisting of:
  - A planner that decomposes the prompt into an explicit ordered step list.
  - An executor that executes one step at a time utilizing operational tools.
  - A replanner that evaluates previous step results, adjusts remaining steps, and finishes when no steps remain.
  - A hard limit capping total executed steps at 8.
- **FR-010**: All reasoning strategies MUST respect a configurable maximum iterations limit and track LLM call counts and execution duration.
- **FR-011**: System MUST provide an executable Arena CLI (`src/arena.ts`) supporting `--strategies` and `--max-iterations` flags to run one or more strategies against a single prompt and output formatted traces and comparative metrics.
- **FR-012**: System MUST include a deterministic offline test suite covering store operations, tool schema validation, and trace formatting without requiring external network calls or active LLM credentials.

### Key Entities *(include if feature involves data)*

- **Service**: Represents an operational microservice or component (e.g. `auth-service`, `payment-gateway`, `notification-worker`). Attributes: `id`, `name`, `status`, `createdAt`.
- **Alert**: Represents a monitoring alarm. Attributes: `id`, `serviceId`, `serviceName`, `title`, `status` (`firing` | `resolved`), `severity` (`info` | `warning` | `critical`), `triggeredAt`.
- **Incident**: Represents a formal operational incident. Attributes: `id`, `title`, `service`, `severity`, `status` (`open` | `resolved`), `openedAt`, `resolvedAt`.
- **TraceEvent**: Structured record of an agent step. Attributes: `type` (`thought` | `action` | `observation` | `plan` | `critique` | `answer`), `content`, `timestamp`, and optional `tool` + `args` for action events.
- **StrategyMetrics**: Performance telemetry. Attributes: `llmCalls` (integer), `latencyMs` (integer).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of reasoning strategy executions output valid, structured results conforming to `ReasoningStrategy` contract (`answer`, `trace`, `metrics`).
- **SC-002**: 100% of trace events in ReAct and Plan-and-Execute runs strictly conform to the typed event union schema without missing mandatory fields.
- **SC-003**: Plan-and-Execute strategy guarantees completion within at most 8 steps under any scenario, without infinite replanning loops.
- **SC-004**: Arena CLI successfully executes both `react` and `plan-and-execute` strategies, rendering execution traces and a comparative summary of latency and LLM call counts.
- **SC-005**: Offline unit test suite passes with 100% success rate (`0` failures) and executes in under 5 seconds with zero network activity.
- **SC-006**: The seed script reliably populates exactly 5 services and 6 alerts (3 firing, 3 resolved) verified by deterministic store queries.

## Assumptions

- Users have valid OpenRouter credentials (`OPENROUTER_API_KEY` and `OPEN_ROUTER_MODEL`) in their `.env` file when executing live arena runs.
- MySQL database credentials are configured via environment variables, with in-memory SQLite/mock storage available for deterministic testing without external service dependencies.
- Language models invoked via OpenRouter support structured tool calling or JSON schema outputs necessary for LangGraph ReAct and planner graphs.
