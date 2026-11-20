# Feature Specification: Model Fallback & Retry Resilience

**Feature Branch**: `015-model-fallback-resilience`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Resiliência de modelo: env: OPENROUTER_MODEL_FALLBACK; Fábrica model.ts: withRetry no primário; withFallbacks([reservas]); trace: evento fallback, metrics.modelUsed; caso nada funcione, 503"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Model Fallback on Primary Failure (Priority: P1)

As an on-call engineer interacting with OpsPilot, I need requests to succeed seamlessly even when the primary LLM provider suffers outages, rate limits, or transient connection errors, so that incident triage and response are not interrupted.

**Why this priority**: OpsPilot is a mission-critical on-call copilot. If the primary model becomes unavailable (e.g., HTTP 429 rate limits, provider downtime, or timeouts), triage operations must immediately failover to a configured backup model without manual intervention or operator downtime.

**Independent Test**: Simulate an outage or rate limit (HTTP 429/500/timeout) on the primary model. Send a request to OpsPilot and verify that the system successfully returns a valid operational response powered by the fallback model, records a `"fallback"` trace event, and sets `metrics.modelUsed` to the fallback model name.

**Acceptance Scenarios**:

1. **Given** the primary model fails with an unrecoverable error or exceeds retry limits, **When** the agent executes an operational reasoning cycle, **Then** the system automatically switches to the backup model in the fallback pool, successfully completes the request, records a `"fallback"` event in the execution trace, and reports the fallback model in `metrics.modelUsed`.
2. **Given** the primary model succeeds without errors, **When** a user makes a request, **Then** the primary model handles the request, no `"fallback"` event is emitted, and `metrics.modelUsed` reflects the primary model name.

---

### User Story 2 - Transient Retry on Primary Model (Priority: P2)

As a DevOps engineer, I want transient errors (e.g., temporary network glitches, momentary throttling) on the primary model to be retried automatically before switching models, so that OpsPilot prefers the higher-quality primary model whenever possible.

**Why this priority**: Switching to a fallback model may produce slightly different reasoning or tool calling patterns. Retrying transient failures on the primary model prevents unnecessary model churn and maintains optimal response quality.

**Independent Test**: Simulate a single transient failure on the primary model followed by a successful attempt. Verify that the primary model retries, succeeds, emits no `"fallback"` event, and reports the primary model in `metrics.modelUsed`.

**Acceptance Scenarios**:

1. **Given** the primary model experiences a transient failure that clears on the next attempt, **When** an operation is invoked, **Then** the system retries the primary model and returns the response without triggering a fallback to backup models.
2. **Given** the primary model fails continuously past the maximum retry attempts, **When** retries are exhausted, **Then** the system initiates fallback to the configured backup model list.

---

### User Story 3 - Graceful Degradation & HTTP 503 on Total Provider Outage (Priority: P3)

As an operations operator or automated monitoring client, I want OpsPilot to return a clean HTTP 503 Service Unavailable error when both primary and all fallback models are unreachable, so that upstream monitoring and alerting can immediately detect catastrophic AI provider downtime.

**Why this priority**: When all models are down, the service must not hang, crash, or return ambiguous errors (such as unhandled 500 internal errors). It must return a standardized 503 status code with descriptive machine-readable error details.

**Independent Test**: Simulate a complete outage where the primary model and all fallback models fail. Send a request to the chat endpoint and verify that the API responds with HTTP 503 Service Unavailable, a clear error code, and no hanging connections.

**Acceptance Scenarios**:

1. **Given** both primary model and all configured fallback models fail, **When** an operator submits an operational request, **Then** the system returns HTTP 503 with an error payload identifying model unavailability.
2. **Given** no fallback models are configured and the primary model fails after retries, **When** the request cannot be serviced, **Then** the system returns HTTP 503.

---

### User Story 4 - Trace Visibility & Model Attribution Telemetry (Priority: P4)

As an on-call lead inspecting audit trails, I need full visibility into which model served each response and whether any fallback occurred, so that our team can track LLM reliability, debug degradations, and calculate accurate provider usage.

**Why this priority**: Operational auditing requires knowing exactly which model generated a diagnostic or remediation plan, especially if an incident occurred while operating in a degraded fallback state.

**Independent Test**: Inspect the response trace and telemetry metrics of completed requests across normal, retried, and fallback executions. Verify that `metrics.modelUsed` accurately reflects the model that generated the final output and that any model switches contain structured trace events.

**Acceptance Scenarios**:

1. **Given** a request completed using a fallback model, **When** inspecting the response metrics and trace, **Then** `metrics.modelUsed` contains the fallback model identifier, and `trace` includes a `"fallback"` event specifying the original model, target model, and reason.
2. **Given** a request completed using the primary model, **When** inspecting response metrics, **Then** `metrics.modelUsed` contains the primary model identifier, and no `"fallback"` trace event is present.

---

### Edge Cases

- **Empty or Whitespace Fallback Configuration**: What happens if `OPENROUTER_MODEL_FALLBACK` is empty, unset, or only contains whitespace? The system MUST function with only the primary model and retry logic, omitting fallback chains.
- **Multiple Fallback Models**: How does the system handle comma-separated lists of fallback models (e.g., `openai/gpt-4o-mini,meta-llama/llama-3.3-70b-instruct`)? The system MUST try fallback models sequentially in the order specified until one succeeds or all fail.
- **Structured Output Compatibility**: What happens if a fallback model fails to adhere to structured output schemas (e.g., for routing or reflection critique)? The retry and fallback mechanism MUST treat structured output parse errors as recoverable errors and proceed to the next fallback candidate.
- **Identical Primary and Fallback**: What happens if `OPENROUTER_MODEL_FALLBACK` specifies the same model as `OPENROUTER_MODEL`? The system MUST deduplicate the fallback list so the same model is not invoked redundantly in the fallback chain.
- **Fast Timeout Budget**: How does retry behavior interact with request timeout budgets? Total retry and fallback elapsed time must be bounded to avoid exceeding the overall HTTP gateway timeout.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support configuring one or more fallback models via the environment configuration `OPENROUTER_MODEL_FALLBACK`.
- **FR-002**: The system MUST parse `OPENROUTER_MODEL_FALLBACK` as an optional string or comma-separated list of model identifiers, trimming whitespace and filtering out empty or duplicate entries matching the primary model.
- **FR-003**: The model factory MUST configure automatic retry mechanisms on the primary model for transient network and provider errors (including HTTP 429 rate limits, 5xx server errors, and connection timeouts).
- **FR-004**: The model factory MUST configure an ordered fallback chain such that if the primary model fails after exhausting its retry attempts, invocation automatically cascades through the configured fallback models in declared sequence.
- **FR-005**: The system MUST emit a `"fallback"` trace event into the operational execution trace whenever execution cascades from a failing model to a fallback model.
- **FR-006**: The `"fallback"` trace event MUST include the originating node, timestamp, source model identifier (`fromModel`), destination model identifier (`toModel`), and error or reason (`reason`).
- **FR-007**: The system MUST populate `metrics.modelUsed` in the response metrics indicating the exact model identifier that produced the completed output.
- **FR-008**: When both the primary model and all fallback models fail or when an unconfigured system experiences model failure, the API boundary MUST translate the domain error to HTTP 503 Service Unavailable with a structured error payload.
- **FR-009**: The system MUST ensure that structured output methods (such as `withStructuredOutput` used by routers and evaluators) inherit retry and fallback capabilities across all models in the pool.
- **FR-010**: All trace events emitted during fallback handling MUST adhere to the mandatory `node: string` attribution schema.

### Key Entities *(include if feature involves data)*

- **ModelResilienceConfig**: Configuration entity defining primary model name, array of ordered fallback model names, retry count, and timeout thresholds.
- **FallbackTraceEvent**: Execution trace event representing a model switch, extending the base trace schema with `fromModel`, `toModel`, and `reason`.
- **ExecutionMetrics**: Operational metrics entity extended to include `modelUsed` (string representing the model that fulfilled the request).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of requests encountering primary model rate limits or provider downtime successfully complete without failure when at least one functioning fallback model is configured.
- **SC-002**: Model failover occurs within 2.5 seconds of primary retry exhaustion without dropping conversational state or message context.
- **SC-003**: 100% of completed responses contain an accurate `metrics.modelUsed` field matching the model that generated the final response.
- **SC-004**: 100% of fallback occurrences emit a valid `"fallback"` event into the execution trace containing origin, destination, and rationale.
- **SC-005**: 100% of total provider outages (when all models fail) result in an HTTP 503 response within the designated request timeout rather than unhandled 500 crashes or indefinite hangs.

## Assumptions

- OpenRouter API key configured in `OPENROUTER_API_KEY` is shared across both primary and fallback models.
- Fallback models accept standard chat completion message formats and support basic tool calling and JSON structured outputs.
- Transient retries on the primary model are limited to at most 2 retries (3 total attempts) with exponential or constant backoff to preserve response time budgets.
- When `OPENROUTER_MODEL_FALLBACK` is absent or unset, the system defaults to having zero fallback models and fails immediately to 503 upon exhausting primary retries.
