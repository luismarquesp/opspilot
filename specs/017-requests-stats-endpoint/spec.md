# Feature Specification: Requests Telemetry & Cost Aggregation (`GET /stats?since=24h`)

**Feature Branch**: `017-requests-stats-endpoint`

**Created**: 2026-11-18

**Status**: Draft

**Input**: User description: "Crie GET /stats?since=24h sobre requests: total, erros, custo (:free=0), p50/p95, por rota e modelo"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Windowed Request Telemetry Summary (`GET /stats?since=24h`) (Priority: P1) 🎯 MVP

As an on-call SRE or engineering lead monitoring OpsPilot, I want to query `GET /stats?since=24h` over persisted request records so that I can inspect request volume (`total`), failure counts (`errors`/`erros`), estimated inference spend (`cost`/`custo`), and latency percentiles (`p50`, `p95`) within a configurable time window.

**Why this priority**: Provides real-time operational health, SLA latency tracking, and budget visibility across production triage workflows.

**Independent Test**:
Seed or execute requests across multiple timestamps (some inside the window, some older), including successful and errored requests. Call `GET /stats?since=24h` (and `GET /stats?since=1h`) and verify that `total`, `errors`, `p50`, and `p95` accurately reflect only requests within the requested time window.

---

### User Story 2 - Free-Tier Model Zero-Cost Accounting (`:free=0`) (Priority: P1)

As a platform engineer controlling OpenRouter spend, I want models tagged with `:free` (such as `meta-llama/llama-3.3-70b-instruct:free`) to always calculate cost as `0` regardless of token count, while paid models accumulate cost based on prompt and completion tokens.

**Why this priority**: Prevents false spend inflation when OpsPilot uses free-tier OpenRouter models or free fallback tiers.

**Independent Test**:
Persist requests using a `:free` model alongside requests using a paid model (e.g., `openai/gpt-4o-mini`). Verify `cost === 0` for the `:free` model bucket and `cost > 0` for the paid model bucket.

---

### User Story 3 - Breakdown by Route (`porRota`/`byRoute`) and Model (`porModelo`/`byModel`) (Priority: P1)

As an engineer optimizing agent strategy routing and model fallbacks, I want `GET /stats` to group metrics by routing strategy (`react`, `plan-and-execute`, `reflection`) and by model identifier (`modelUsed`) so I can compare error rates, token consumption, cost, and `p50`/`p95` latency per route and per model.

**Why this priority**: Enables identifying slow routes, expensive strategies, or flaky models at a glance.

**Independent Test**:
Persist requests across multiple routes and models and verify `byRoute`/`porRota` and `byModel`/`porModelo` contain accurate per-bucket `count`, `total`, `errors`, `cost`, `tokens`, `p50`, and `p95`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose `GET /stats` accepting an optional `since` query parameter defaulting to `"24h"`.
- **FR-002**: `since` MUST support relative durations (`<positive_int><s|m|h|d>`, e.g., `"24h"`, `"1h"`, `"30m"`, `"7d"`, `"60s"`) and valid ISO-8601 timestamps; invalid values MUST return HTTP 400 (`validation_error`).
- **FR-003**: System MUST aggregate persisted rows from the SQLite `requests` table within the `since` window and return `total`, `errors`/`erros`, `cost`/`custo`, `p50`, `p95` (also under `latency: { p50, p95 }`), `tokens`, `byRoute`/`porRota`, and `byModel`/`porModelo`.
- **FR-004**: Cost calculation MUST be implemented as a pure function (`calculateModelCost`) returning `0` whenever `modelUsed` contains `:free` (case-insensitive) or has zero tokens, and computing USD cost for paid models.
- **FR-005**: Failed `/chat` requests (`504`, `503`, `500`) MUST persist a `status: "error"` row in `requests` so `GET /stats` captures real error rates.
- **FR-006**: All HTTP query parameters and responses MUST be validated with Zod schemas at the boundary.
