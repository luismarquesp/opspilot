# Feature Specification: HTTP Chat API Endpoint

**Feature Branch**: `003-chat-api-endpoint`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "POST /chat em src/http/server.ts (ou padrão do express): body { message, strategy?, reflect? } validando com zod; default react. 200 { answer, trace, metrics }; 400 body inválido { issues do zod }; 422 estratégia desconhecida; timeout 180s -> 504. Registry em src/agents/index.ts (nome -> estratégia; reflect aplica wihReflection). TEste de integração com estratégia fake determinística, sem rede."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Interactive Incident Chat via HTTP (Priority: P1)

As an on-call engineer or external operations system, I want to submit operational inquiries to OpsPilot via an HTTP POST endpoint, so that I receive an operational diagnosis or resolution along with execution telemetry and full event tracing.

**Why this priority**: An HTTP API is the core external integration interface for OpsPilot, enabling automated alerts, ChatOps bots, and web consoles to consult the agent on demand.

**Independent Test**: Send an HTTP POST request to `/chat` with a valid operational query (e.g. `{"message": "Check service health"}`). The system executes using the default reasoning strategy, responds with HTTP 200 containing `answer`, `trace`, and `metrics`, and requires no optional parameters.

**Acceptance Scenarios**:

1. **Given** a running OpsPilot HTTP server, **When** a client posts `{"message": "Summarize open critical alerts"}`, **Then** the server responds with status code 200, a non-empty `answer` string, an array of structured `trace` events, and performance `metrics`.
2. **Given** an incoming request with no explicit `strategy` provided, **When** processed by the server, **Then** the server defaults to executing the `react` strategy.
3. **Given** an incoming request with no explicit `reflect` provided, **When** processed by the server, **Then** reflection is disabled by default.

---

### User Story 2 - Configurable Reasoning Strategy and Reflection (Priority: P2)

As an operations lead, I want to select specific reasoning strategies (such as `react` or `plan-and-execute`) and optionally enable self-critique reflection in the request payload, so that I can balance speed and answer rigor depending on incident severity.

**Why this priority**: Complex incidents often require structured planning or self-critique, while quick diagnostic checks benefit from fast single-pass execution.

**Independent Test**: Send an HTTP POST request to `/chat` specifying `{"message": "...", "strategy": "plan-and-execute", "reflect": true}`. Verify that the server resolves the requested strategy from the registry, applies the reflection wrapper, executes the multi-phase workflow, and returns HTTP 200 with critique events in the trace.

**Acceptance Scenarios**:

1. **Given** a request specifying `{"message": "Investigate memory leak", "strategy": "plan-and-execute"}`, **When** processed, **Then** the server resolves and executes the `plan-and-execute` strategy from the registry.
2. **Given** a request specifying `{"message": "Restart crashed pod", "strategy": "react", "reflect": true}`, **When** processed, **Then** the strategy execution is wrapped with the reflection layer, generating critique evaluations visible in the response trace.
3. **Given** a request specifying `reflect: false` or omitting `reflect`, **When** processed, **Then** the strategy runs without reflection decoration.

---

### User Story 3 - Robust Boundary Validation & Error Reporting (Priority: P3)

As an API consumer or developer, I want clear, structured validation and semantic HTTP error codes when my request is malformed or requests an unsupported strategy, so that I can quickly diagnose integration problems without ambiguous failures.

**Why this priority**: Predictable error boundaries prevent malformed data from polluting agent workflows and give immediate actionable feedback to API callers.

**Independent Test**: Submit invalid payloads (e.g., missing message, non-string message, unknown strategy name) and verify that the endpoint rejects them with corresponding HTTP status codes (400 for validation failures with detail issues, 422 for unknown strategies).

**Acceptance Scenarios**:

1. **Given** an HTTP request with an empty body, missing `message`, or non-boolean `reflect`, **When** submitted to `/chat`, **Then** the server returns HTTP 400 Bad Request with a structured error payload detailing the validation issues.
2. **Given** an HTTP request with a `message` that is empty or whitespace-only, **When** submitted to `/chat`, **Then** the server returns HTTP 400 Bad Request indicating the message must not be blank.
3. **Given** an HTTP request specifying an unregistered strategy (e.g. `{"message": "Hello", "strategy": "unknown-model"}`), **When** submitted to `/chat`, **Then** the server returns HTTP 422 Unprocessable Entity with an explanatory error message.

---

### User Story 4 - Long-Running Execution Timeout Protection (Priority: P4)

As a site reliability engineer, I want incoming requests to be bounded by a 180-second timeout, so that runaway LLM chains or stalled reasoning loops do not leave HTTP connections hanging indefinitely or exhaust server resources.

**Why this priority**: Production APIs must enforce strict operational deadlines. Bounding execution prevents connection pool exhaustion and resource starvation during upstream service slowdowns.

**Independent Test**: Configure or invoke a slow agent strategy that takes longer than 180 seconds to finish. Verify that the server terminates the request with HTTP 504 Gateway Timeout and cleans up the active execution context.

**Acceptance Scenarios**:

1. **Given** a strategy execution that exceeds the 180-second threshold, **When** the timeout fires, **Then** the server terminates the HTTP response with status code 504 Gateway Timeout and an error message indicating operation timeout.
2. **Given** a strategy execution that completes in under 180 seconds, **When** results are ready, **Then** the server responds normally with HTTP 200 before the timeout triggers.

---

### User Story 5 - Deterministic Offline Integration Testing (Priority: P5)

As an automated testing and CI pipeline, I want to execute full-stack integration tests against `/chat` using a deterministic mock strategy without external network calls or billable LLM tokens, so that regressions in HTTP routing, validation, and timeouts are caught reliably and swiftly.

**Why this priority**: Flaky, network-dependent tests slow down deployment and fail unpredictably. Deterministic local integration tests ensure rock-solid quality gates.

**Independent Test**: Run the test suite (`npm test`) to execute integration tests that spin up the HTTP application, dispatch requests using a fake deterministic reasoning strategy, and assert on HTTP status codes (200, 400, 422, 504) and response payloads without network access.

**Acceptance Scenarios**:

1. **Given** an integration test suite using a registered fake deterministic strategy, **When** dispatching valid and invalid requests against `/chat`, **Then** all assertions on status codes and response bodies pass with zero network calls.
2. **Given** an integration test simulating execution exceeding the timeout duration, **When** dispatched, **Then** the test reliably verifies the 504 Gateway Timeout response.

---

### Edge Cases

- **Empty or Whitespace-Only Message**: Submitting `{"message": "   "}` must be treated as invalid and rejected with HTTP 400.
- **Extra Unknown Fields in Request Body**: The boundary validator should either strip or reject extraneous fields based on strict schema validation rules.
- **Client Disconnection During Execution**: If the HTTP client disconnects before execution finishes, the server should handle the abort signal gracefully without unhandled promise rejections.
- **Internal Agent Failure**: If the underlying strategy throws an unexpected internal error during execution, the server must capture the error and return HTTP 500 Internal Server Error without leaking internal stack traces or crashing the process.
- **Timeout Boundary Conditions**: The timeout countdown must accurately reflect total execution time, including reflection iterations if enabled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose an HTTP service with a `POST /chat` endpoint.
- **FR-002**: The endpoint MUST accept a JSON request body containing `message` (required, non-empty string), `strategy` (optional string), and `reflect` (optional boolean).
- **FR-003**: All incoming request payloads MUST be validated at the boundary using a schema validation mechanism.
- **FR-004**: If request payload validation fails, the server MUST respond with HTTP status code 400 and a structured body detailing the validation issues.
- **FR-005**: If `strategy` is omitted in a valid request, the system MUST default to the `react` strategy.
- **FR-006**: The system MUST maintain a strategy registry that maps strategy names to their corresponding reasoning strategy implementations.
- **FR-007**: If a requested `strategy` is not found in the strategy registry, the server MUST reject the request with HTTP status code 422 Unprocessable Entity.
- **FR-008**: If `reflect` is `true`, the system MUST decorate the resolved strategy with the reflection layer (`withReflection`) before execution.
- **FR-009**: If `reflect` is `false` or omitted, the system MUST execute the base strategy directly without reflection decoration.
- **FR-010**: On successful strategy completion, the server MUST return HTTP status code 200 with a JSON payload containing `answer` (string), `trace` (array of trace events), and `metrics` (execution telemetry).
- **FR-011**: The server MUST enforce a maximum execution duration of 180 seconds per request; if this threshold is exceeded, the server MUST respond with HTTP status code 504 Gateway Timeout.
- **FR-012**: The system MUST provide automated integration tests using a deterministic fake strategy to test the complete HTTP flow (success, 400, 422, and 504) without external network dependencies.

### Key Entities

- **ChatRequestBody**: The structured request payload containing `message`, optional `strategy`, and optional `reflect`.
- **ChatResponseBody**: The successful response payload consisting of `answer` (string), `trace` (ordered list of execution events), and `metrics` (total duration, call counts, token counters).
- **ValidationErrorResponse**: The response payload returned on HTTP 400, containing the error summary and detailed validation issues.
- **StrategyRegistry**: The registry interface and catalog mapping string identifiers to reasoning strategy factories or instances.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of invalid request payloads receive HTTP 400 with actionable validation issue details.
- **SC-002**: 100% of requests requesting unregistered strategies receive HTTP 422 with a descriptive error message.
- **SC-003**: Strategy execution exceeding 180 seconds consistently returns HTTP 504 across all scenarios.
- **SC-004**: All integration tests execute and pass completely offline in under 10 seconds without any external network or LLM API calls.
- **SC-005**: End-to-end HTTP chat requests with valid inputs achieve successful execution and return HTTP 200 with complete answer, trace, and telemetry fields.

## Assumptions

- The default server port and host will be configurable via environment variables or sensible local defaults (e.g. port 3000).
- The strategy registry supports dynamic or predefined registration of strategies, including `react`, `plan-and-execute`, and testing mocks.
- The 180-second timeout can be simulated or parameterized in integration test environments using short durations to allow fast test execution.
- Operational tools and LLM models are abstracted behind the `ReasoningStrategy` interface, allowing full substitution during testing.
