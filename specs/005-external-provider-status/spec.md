# Feature Specification: External Provider Status Check

**Feature ID**: 005  
**Short Name**: external-provider-status  
**Directory**: `specs/005-external-provider-status`  
**Status**: Draft  
**Created**: 2026-09-21  
**Last Updated**: 2026-09-21

---

## Summary

OpsPilot gains the ability to query the public status page of a supported external provider (GitHub or Cloudflare) and report whether that provider is currently experiencing an incident. This allows the on-call operator to quickly distinguish between internal service failures and external provider outages — answering the key operational question: *"Is this our problem, or theirs?"*

---

## Problem Statement

When a production incident fires, one of the first triage questions is whether an external dependency (such as GitHub Actions, GitHub APIs, or Cloudflare CDN/DNS) is itself degraded. Without quick access to this information, operators must manually navigate status pages, losing precious minutes during outage response. OpsPilot should surface this signal directly in the conversation, keeping the operator in one context.

---

## User Stories

### US1 (P1): Query External Provider Status

**As an** on-call operator  
**I want to** ask OpsPilot whether GitHub or Cloudflare is currently experiencing an incident  
**So that** I can immediately rule out or confirm an external dependency as the root cause of a production issue

**Acceptance Criteria**:
- The operator can invoke the status check by asking a natural-language question (e.g., "está o GitHub fora?", "verifique o status da Cloudflare")
- The agent uses the provider status tool to retrieve current operational state
- The response is concise: provider name, indicator, and a one-line human-readable description
- The default provider, when none is specified, is GitHub

### US2 (P2): Resilient Status Retrieval

**As an** on-call operator  
**I want** the status check to succeed even when the provider's status page is slow or briefly unavailable  
**So that** a transient network issue does not prevent me from completing my triage workflow

**Acceptance Criteria**:
- The request to the provider status API has a 5-second timeout
- If the first attempt fails (network error or 5xx response), exactly one retry is made automatically
- If both attempts fail, the agent reports a readable error as its observation (does not crash or throw an uncaught exception)
- The agent never surfaces raw stack traces to the operator

### US3 (P2): Validated and Compact Response

**As an** on-call operator  
**I want** the status response to be validated and compact  
**So that** invalid or unexpected API responses do not produce misleading information, and the agent context window is not inflated

**Acceptance Criteria**:
- The API response is validated against a known schema; unexpected shapes produce a clear error message
- The output contains only the indicator and description (e.g., `none — All Systems Operational`)
- No raw JSON blobs are forwarded into the agent context as observations

---

## Functional Requirements

### FR-001: Supported Providers
- The system MUST support exactly two external providers: GitHub and Cloudflare
- Each provider is identified by a stable slug: `"github"` and `"cloudflare"`
- The status API endpoints are:
  - GitHub: `https://www.githubstatus.com/api/v2/status.json`
  - Cloudflare: `https://www.cloudflarestatus.com/api/v2/status.json`
- No API key or authentication is required for either endpoint

### FR-002: Tool Interface
- The tool MUST accept a `provider` parameter (enum: `github | cloudflare`, default `github`)
- The tool description MUST guide the agent on when to invoke it: upon suspicion of an external issue, when a dependency appears down, or to answer "is this our problem or the provider's?"
- The tool MUST return a compact one-line result: `<indicator> — <description>`
- Possible indicator values (sourced from statuspage.io API): `none`, `minor`, `major`, `critical`

### FR-003: HTTP Request Behaviour
- Each outbound request MUST use a 5-second wall-clock timeout enforced via an abort signal
- On network error or HTTP 5xx response, the system MUST make exactly one retry (total: 2 attempts maximum)
- HTTP 4xx responses (except 429) are treated as permanent failures and NOT retried
- On permanent failure, the tool returns a readable error string as its result (not an exception)

### FR-004: Response Validation
- The API response body MUST be validated against a Zod schema matching the statuspage.io v2 shape: `{ status: { indicator: string, description: string } }`
- Unrecognised or malformed response shapes MUST produce a user-readable error result, not an exception

### FR-005: Testability via Dependency Injection
- The HTTP fetch function MUST be injectable (passed as a parameter or closure) to allow unit testing without network access
- Tests MUST cover: successful response, network timeout, HTTP 5xx with retry, and malformed response — all without real network calls

### FR-006: Error Containment
- All errors (network, validation, timeout) MUST be caught within the tool boundary
- The tool MUST return a human-readable string result under all failure conditions
- No exception MUST propagate out of the tool to the agent framework

---

## Out of Scope

- Adding more providers beyond GitHub and Cloudflare (future feature)
- Storing or caching historical status query results
- Alerting or proactive monitoring (the tool is reactive, invoked on demand)
- Authentication or private status pages

---

## User Scenarios & Testing

### Scenario A: Happy path — GitHub operational
1. Operator asks: "O GitHub está fora?"
2. Agent invokes `check_provider_status({ provider: "github" })`
3. Status API returns `{ status: { indicator: "none", description: "All Systems Operational" } }`
4. Agent responds: `none — All Systems Operational`

### Scenario B: Provider degraded — Cloudflare incident
1. Operator asks: "Como está a Cloudflare?"
2. Agent invokes `check_provider_status({ provider: "cloudflare" })`
3. Status API returns `{ status: { indicator: "major", description: "Major Service Outage" } }`
4. Agent responds: `major — Major Service Outage`

### Scenario C: Network timeout with retry
1. Tool sends request; first attempt times out after 5 seconds
2. Tool retries once; second attempt also times out
3. Tool returns readable error: `Erro ao consultar status de github: timeout após 2 tentativas`
4. Agent reports the error as an observation; triage continues with other signals

### Scenario D: Invalid API response (validation failure)
1. Status API returns an unexpected JSON shape
2. Zod validation fails
3. Tool returns: `Erro ao consultar status de github: resposta inesperada da API`
4. No exception propagates to agent framework

### Scenario E: HTTP 5xx with one retry, then failure
1. First request returns HTTP 503
2. Tool retries once; second attempt also returns 503
3. Tool returns readable error

### Scenario F: Single 5xx, second attempt succeeds
1. First request returns HTTP 500
2. Retry succeeds with valid response
3. Tool returns compact success result

---

## Success Criteria

- Operators can determine external provider status in under 6 seconds (5s timeout + retry latency)
- The agent's triage workflow is never interrupted by a provider status check failure (error containment)
- 100% of unit tests pass without network access (injected fake fetch)
- The status result adds no more than one line to the agent's observation context
- TypeScript typecheck passes with zero errors
- All tests pass (`npm test`)

---

## Key Entities

### Provider
- `id`: `"github" | "cloudflare"` — stable slug for tool parameter
- `statusUrl`: URL of the public statuspage.io v2 API endpoint

### ProviderStatusResponse
- `indicator`: `"none" | "minor" | "major" | "critical"` — operational signal
- `description`: human-readable string — e.g., `"All Systems Operational"`

### ProviderStatusResult (tool output)
- Compact string: `"<indicator> — <description>"` on success
- Human-readable error string on failure

---

## Assumptions

1. **No authentication**: statuspage.io public APIs do not require an API key; this is intentional per spec.
2. **Retry strategy is fixed**: exactly one retry, no exponential backoff; the time budget (5s per attempt) constrains this.
3. **Provider set is fixed**: extending to more providers (PagerDuty, AWS, etc.) is explicitly out of scope and requires a new feature.
4. **Fetch is the HTTP primitive**: Node.js 22 native `fetch` is used; `AbortSignal.timeout(5000)` is the timeout mechanism.
5. **Indicator values**: statuspage.io v2 returns `none`, `minor`, `major`, or `critical`; the spec accepts any string but the compact output shows exactly what the API returns.
6. **Language of error messages**: error strings are in Portuguese to match the operator's language, consistent with other OpsPilot tool descriptions.
7. **Tool name**: `check_provider_status` (consistent with snake_case tool naming convention in the project).

---

## Dependencies

- Feature 004 (SQLite OpsStore): no dependency — this feature adds only a new agent tool
- Node.js 22 native `fetch` API (available since Node 18, stable in Node 22): no new npm dependency
- `zod` (already present): used for response schema validation
- `@langchain/core` `tool()` helper (already present): used to register the tool

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| statuspage.io API changes shape | Low | Medium | Zod validation returns structured error; tool never crashes |
| Provider adds auth requirement | Very Low | High | Tool returns clear error; escalate to extend with API key support |
| Retry inflates triage latency to 10s | Low | Low | Documented in Success Criteria; operators can abort and proceed with other signals |
