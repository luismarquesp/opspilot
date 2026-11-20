# Feature Specification: Strategy Reflection Layer

**Feature Branch**: `002-strategy-reflection`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Camada Reflection: withReflection (strategy, opts) decora qualquer ReasoningStrategy: executa a base, um crítico (mesmo modelo, saída estruturada { approved, feedback }) avalia a resposta contra as observações do trace; se reprovar, regenera com o feedback no contexto; para approved ou maxReflection (default:2). Evento 'critique' no trace; métricas somam as chamadas extras. Arena: reflect:react e reflect:plan-and-execute."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Self-Critique and Verification of Operational Answers (Priority: P1)

As an on-call engineer relying on OpsPilot during production incident triage, I want the agent's proposed answers to be automatically verified against the actual tool observations recorded in the trace, so that answers containing inaccuracies, hallucinations, or ungrounded claims are flagged before being presented.

**Why this priority**: OpsPilot generates incident assessments and actions that directly impact production systems. Ensuring answers are grounded in actual tool observations prevents misleading triage recommendations.

**Independent Test**: Wrap a baseline reasoning strategy with the reflection layer and submit an operational query where tool observations are available. Verify that the critique evaluator inspects the proposed answer against observations, produces an approved verdict with feedback, emits a `critique` event in the trace, and outputs the validated response.

**Acceptance Scenarios**:

1. **Given** an operational reasoning strategy that produced an answer supported by tool observations, **When** evaluated by the reflection layer, **Then** the critique marks the answer as approved, appends a critique trace event, and returns the answer.
2. **Given** an answer that accurately addresses the user inquiry using evidence from the execution trace, **When** reflection completes on the first attempt, **Then** the final response matches the verified answer without triggering further iterations.

---

### User Story 2 - Feedback-Driven Answer Regeneration on Rejection (Priority: P2)

As an on-call operator, when an initial response contradicts or omits critical findings from tool observations, I want OpsPilot to reject the ungrounded answer and re-evaluate the response using the critic's corrective feedback, until approved or a bounded reflection limit is reached.

**Why this priority**: Criticism without automated correction does not solve the underlying quality issue. Bounded regeneration guided by specific critique feedback turns detection of hallucinations into self-healing.

**Independent Test**: Provide an operational scenario where the initial answer is flagged as incomplete or inaccurate by the critic. Verify that the critic rejects the answer (`approved = false`) with specific feedback, triggers a regeneration cycle with that feedback in context, and halts when approved or upon reaching `maxReflection` (default: 2).

**Acceptance Scenarios**:

1. **Given** an initial answer rejected by the critic, **When** reflection attempts have not exceeded `maxReflection` (default: 2), **Then** the strategy re-runs with the critique feedback included in context to produce a corrected answer.
2. **Given** a regenerated answer that resolves the previous deficiencies, **When** the critic evaluates the revision, **Then** the critic approves the answer, appends the approval critique event, and terminates the reflection loop.
3. **Given** a scenario where the revision is still not approved after reaching `maxReflection` attempts, **When** the reflection ceiling is met, **Then** the execution terminates cleanly, returning the latest answer with the accumulated critique notes.

---

### User Story 3 - Transparent Critique Trace and Cumulative Telemetry (Priority: P3)

As a systems administrator or auditor, I want complete visibility into every critique cycle, including the critic's feedback and total resource consumption (additional model invocations and elapsed latency), so that I can inspect the cost-benefit trade-off of self-reflection.

**Why this priority**: Autonomous retry loops can silently introduce high latency and token costs. Telemetry transparency ensures observability and auditable operational decisions.

**Independent Test**: Execute a query that triggers at least one reflection rejection and subsequent regeneration. Verify that the execution trace contains distinct, ordered `critique` events for each review pass and that reported metrics reflect the cumulative sum of all base and critique evaluations.

**Acceptance Scenarios**:

1. **Given** an execution that performed multiple critique cycles, **When** inspecting the resulting trace, **Then** each review pass is recorded as a typed `critique` event containing the critic's feedback.
2. **Given** a decorated strategy execution, **When** measuring total metrics, **Then** the reported call count and latency represent the cumulative sum of the initial run, critic evaluations, and all regeneration runs.

---

### User Story 4 - Arena Comparative Benchmarking for Reflected Strategies (Priority: P4)

As a reliability engineer evaluating reasoning architectures, I want to run `reflect:react` and `reflect:plan-and-execute` in the Strategy Arena side-by-side with baseline strategies, so that I can compare accuracy, latency overhead, and iteration depth across identical incident scenarios.

**Why this priority**: Standardized benchmarking allows teams to quantify whether reflection delivers sufficient answer quality improvements to justify the additional latency and model call overhead.

**Independent Test**: Run the Arena CLI specifying `--strategies react,reflect:react,plan-and-execute,reflect:plan-and-execute`. Verify that all four strategies run the same prompt, stream their traces, and render a unified comparison table in the summary.

**Acceptance Scenarios**:

1. **Given** the Arena CLI, **When** `--strategies reflect:react,reflect:plan-and-execute` is supplied, **Then** both reflected strategies execute, display formatted event streams, and include their critique events.
2. **Given** the final Arena summary, **When** results are rendered, **Then** reflected strategies appear in the comparison table with answer lengths, cumulative call counts, and elapsed latency.

---

### Edge Cases

- **Empty Tool Observations**: When a base strategy runs but invokes no tools, the critic must still evaluate whether the answer appropriately reflects the absence of tool findings rather than fabricating data.
- **Immediate Rejection at maxReflection = 0**: If reflection is configured with `maxReflection = 0`, the critic evaluates the answer once; if rejected, it immediately returns the original response with the critique event rather than looping.
- **Critic Evaluation Failure**: If the critic model call encounters a syntax error or fails to produce structured output, the system must fallback gracefully, record a critique notice, and return the base answer without crashing the pipeline.
- **Max Reflection Ceiling**: When `maxReflection` is reached (default 2 additional iterations), the loop must strictly terminate regardless of whether the critic returned `approved = true`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a reflection decorator function `withReflection` that wraps any object implementing the `ReasoningStrategy` contract.
- **FR-002**: The reflection layer MUST accept configuration options including `maxReflection` (positive integer, defaulting to 2) and optional critic model overrides.
- **FR-003**: The critic evaluator MUST analyze the base strategy's answer specifically against the observation events recorded in the trace.
- **FR-004**: The critic MUST produce a structured evaluation output containing an `approved` boolean flag and a descriptive `feedback` text explaining the decision.
- **FR-005**: If `approved` is true, the reflection layer MUST finalize execution, record a `critique` event, and return the approved answer and trace.
- **FR-006**: If `approved` is false and current reflection count is strictly less than `maxReflection`, the system MUST trigger regeneration by re-invoking the strategy with the critic's feedback incorporated into the context.
- **FR-007**: If current reflection count reaches `maxReflection`, the system MUST stop the reflection loop and return the most recent answer.
- **FR-008**: Every critic pass MUST append a typed `critique` event to the trace containing the feedback and approval status.
- **FR-009**: Cumulative metrics returned by the decorated strategy MUST aggregate all model invocations and elapsed latency from the base run, critic evaluations, and all regeneration passes.
- **FR-010**: The Arena CLI MUST register and support `reflect:react` and `reflect:plan-and-execute` as first-class selectable strategy identifiers.

### Key Entities

- **ReflectionOptions**: Configuration parameters for reflection decoration, specifying `maxReflection` (default: 2) and optional critic model settings.
- **CritiqueVerdict**: Structured critic output entity containing `approved` (boolean) and `feedback` (string detailing justification or corrective guidance).
- **DecoratedStrategy**: An enhanced `ReasoningStrategy` instance wrapping an underlying strategy, preserving the strategy contract while managing the critique-and-regeneration lifecycle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of executions decorated with reflection output at least one explicit `critique` event in the execution trace.
- **SC-002**: Reflection loops never exceed the specified `maxReflection` limit (default 2), guaranteeing deterministic bounded execution.
- **SC-003**: Reported strategy metrics accurately reflect total cumulative resource usage (sum of base run, critic calls, and regeneration runs) with zero lost telemetry.
- **SC-004**: The Arena CLI benchmarks both `reflect:react` and `reflect:plan-and-execute` against baseline strategies without manual configuration.

## Assumptions

- The critic uses the same underlying model provider and temperature settings as the primary agent strategies to maintain consistent operational reasoning standards.
- Ground-truth evaluation relies on the observations captured by operational tools (`list_alerts`, `open_incident`, `resolve_incident`) within the execution trace.
- If a strategy achieves approval on the initial evaluation, the reflection overhead is exactly 1 critique evaluation call with no regeneration delay.
- The reflection layer is fully decoupled from specific strategy implementations, operating strictly through the `ReasoningStrategy` interface.
