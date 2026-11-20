---

description: "Task list for OpsPilot War Room Web UI (web/) & CORS"
---

# Tasks: OpsPilot War Room Web UI (`web/`) & CORS

**Input**: Design documents from `/specs/018-war-room-web/`
**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/war-room-api.md`, `quickstart.md`

**Tests**: Backend integration tests (`node:test` + `supertest`) and pure frontend unit tests (`node:test` via `tsx`) are included explicitly per `plan.md` and the OpsPilot Constitution. Tests are written before their corresponding implementation tasks within each story phase.

**Organization**: Tasks are grouped by dependency order and user story so that platform foundations (`/opspilot/` + CORS), runtime configuration (Settings Gear), the War Room chat & typed trace MVP (US1), and HTTP `202` human-in-the-loop approvals (US2) can each be implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`, `US4`)
- Include exact file paths in descriptions

## Path Conventions

- **Backend (`src/`)**: Express HTTP layer under `src/http/` at repository root
- **Frontend (`web/`)**: Standalone Vite + React + TypeScript application under `web/` configured with `base: "/opspilot/"`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the standalone `web/` Vite + React + TypeScript project configured under `/opspilot/`

- [X] T001 Create Vite + React + TypeScript project configuration with base "/opspilot/" in web/package.json, web/tsconfig.json, web/vite.config.ts, and web/index.html
- [X] T002 Install frontend dependencies for web/ in web/package.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core styling tokens (`design.instruction.md`), frontend TypeScript contracts, and backend Zod schemas that block all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Implement design.instruction.md CSS custom properties (4px spacing scale --space-1..16, dark/light surfaces, semantic status tokens, tabular-nums, :focus-visible, prefers-reduced-motion) in web/src/styles/tokens.css and web/src/styles/global.css
- [X] T004 [P] Define War Room domain types (TypedTraceEvent, PendingApprovalPayload, ChatTimelineItem, WarRoomSettings, StatsSummaryView) in web/src/types/war-room.ts
- [X] T005 [P] Extend ChatRequestSchema with requireApproval, approvalId, decision, and approved fields and add PendingApprovalResponseSchema in src/http/schemas.ts

**Checkpoint**: Foundation ready — user story implementation can now begin in sequence or in parallel across independent slices

---

## Phase 3: User Story 4 - Base Path `/opspilot/`, Backend CORS & Design System Compliance (Priority: P1)

**Goal**: Enable cross-origin browser requests from the War Room UI to the Express backend with full CORS headers, `X-Request-Id` header exposure, and HTTP `204` `OPTIONS` preflight handling alongside `/opspilot/` base configuration and `design.instruction.md` foundations.

**Independent Test**: Issue cross-origin requests (`Origin: http://localhost:5173`) and `OPTIONS` preflight requests against Express (`src/http/cors.test.ts`) and verify `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Expose-Headers: X-Request-Id`, and HTTP `204` preflight status; inspect `web/vite.config.ts` and `web/src/styles/` for `base: "/opspilot/"` and design tokens.

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T006 [P] [US4] Create integration tests verifying CORS headers, Access-Control-Expose-Headers: X-Request-Id, and OPTIONS 204 preflight in src/http/cors.test.ts

### Implementation for User Story 4

- [X] T007 [US4] Implement Express CORS middleware (Allow-Origin, Allow-Methods, Allow-Headers, Expose X-Request-Id, OPTIONS 204) in src/http/server.ts

**Checkpoint**: Express CORS and `/opspilot/` + design tokens foundation verified independently

---

## Phase 4: User Story 3 - Configurable API Base URL via Settings Gear (Priority: P1)

**Goal**: Allow on-call operators to inspect, validate, normalize, and persist the OpsPilot API base URL and theme preference at runtime via a header settings gear without rebuilding static assets.

**Independent Test**: Run `web/src/lib/url.test.ts` to verify URL normalization (trailing slash removal), validation of malformed/non-HTTP(S) URLs, and `localStorage` persistence; open `ApiConfigModal` from `Header` gear button, save a custom URL (e.g., `http://localhost:4000/`), reload, and confirm `http://localhost:4000` persists and feeds API calls.

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T008 [P] [US3] Create unit tests for normalizeApiUrl, isValidApiUrl, and settings persistence in web/src/lib/url.test.ts

### Implementation for User Story 3

- [X] T009 [US3] Implement pure URL normalization, validation, and localStorage settings helpers in web/src/lib/url.ts
- [X] T010 [US3] Implement ApiConfigModal settings dialog in web/src/components/ApiConfigModal.tsx and Header with settings gear and theme toggle in web/src/components/Header.tsx

**Checkpoint**: Runtime API URL configuration and theme switching work and pass unit tests independently

---

## Phase 5: User Story 1 - Interactive War Room Chat with Typed Reasoning Trace ("Ver raciocínio") (Priority: P1) 🎯 MVP

**Goal**: Deliver the core War Room operational workflow: submitting prompts to `POST /chat`, displaying assistant responses with `requestId`/route/model/latency/token telemetry, surfacing `/stats?since=24h` KPIs and accessible error banners, and toggling **"Ver raciocínio"** to inspect typed trace events (`route`, `thought`, `action`, `observation`, `plan`, `critique`, `fallback`, `summarize`, `answer`).

**Independent Test**: Run `web/src/lib/trace.test.ts` to verify typed trace event formatting and HTTP `200`/`202` payload parsing; render the War Room components against `POST /chat` and `GET /stats?since=24h`, verify telemetry badges (`tabular-nums`), and click **"Ver raciocínio"** (`aria-expanded`) to expand/collapse typed trace steps with `node` attribution and variant fields (`tool`, `args`, `route`, `reason`, `fromModel`, `toModel`).

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T011 [P] [US1] Create unit tests for typed trace event descriptors, node attribution, and 200/202 payload parsing in web/src/lib/trace.test.ts

### Implementation for User Story 1

- [X] T012 [US1] Implement pure typed trace helpers in web/src/lib/trace.ts and API client (sendChatMessage, fetchStats, fetchRequestTrace) in web/src/lib/api.ts
- [X] T013 [P] [US1] Implement TraceViewer component ("Ver raciocínio" toggle with aria-expanded and discriminated rendering for all 9 trace event types) in web/src/components/TraceViewer.tsx
- [X] T014 [P] [US1] Implement StatsStrip KPI bar in web/src/components/StatsStrip.tsx and accessible ErrorBanner (role="alert", copyable requestId, Retry button) in web/src/components/ErrorBanner.tsx

**Checkpoint**: Core War Room chat + typed trace ("Ver raciocínio") MVP components and pure trace/API logic are complete and independently testable

---

## Phase 6: User Story 2 - Human-in-the-Loop Approval Card for HTTP 202 Responses (Priority: P1)

**Goal**: Handle `POST /chat` HTTP `202 Accepted` pending-approval responses end-to-end by rendering an interactive `ApprovalCard` (**"Aprovar"** / **"Negar"**) with duplicate-submit protection, dispatching decisions back to `POST /chat`, transitioning to `Aprovado` / `Negado`, and assembling the complete `ChatTimeline` + `App` War Room interface.

**Independent Test**: Execute `src/http/cors.test.ts` verifying `POST /chat` HTTP `202` pending-approval responses and `approve`/`reject` resolution; in the assembled War Room (`App.tsx` + `ChatTimeline.tsx`), trigger an HTTP `202` response, verify the rendered `ApprovalCard`, test duplicate-click locking while in flight, and confirm final `Aprovado` or `Negado` state alongside guided empty states when no messages exist.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T015 [P] [US2] Add integration tests for POST /chat HTTP 202 pending approval and approve/reject resolution in src/http/cors.test.ts

### Implementation for User Story 2

- [X] T016 [US2] Update POST /chat handler to emit HTTP 202 pending approval payloads and process approve/reject decisions in src/http/chat.controller.ts
- [X] T017 [US2] Implement ApprovalCard component ("Aprovar" and "Negar" controls with duplicate-submit lock and resolved badge) in web/src/components/ApprovalCard.tsx
- [X] T018 [US2] Implement ChatTimeline (guided empty state, messages, TraceViewer, ApprovalCard, ErrorBanner) in web/src/components/ChatTimeline.tsx, War Room App in web/src/App.tsx, and entrypoint in web/src/main.tsx

**Checkpoint**: Full War Room application (`web/`) and backend CORS + `202` approval flow are integrated and independently testable

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end typechecking, backend integration tests, frontend unit tests, and production `/opspilot/` bundle verification

- [X] T019 Run npm run typecheck and npm test in package.json to verify all backend and shared test suites pass
- [X] T020 Run node --import tsx --test "web/src/**/*.test.ts", npm --prefix web run typecheck, and npm --prefix web run build in web/package.json to verify frontend unit tests, strict types, and /opspilot/ bundle

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately (`T001` → `T002`)
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories (`T003`, `T004`, `T005` can run in parallel)
- **US4 CORS Foundation (Phase 3)**: Depends on Phase 2 — `T006` before `T007`
- **US3 Settings Gear (Phase 4)**: Depends on Phase 2 (`T003`, `T004`) — `T008` before `T009`, then `T010`
- **US1 Chat & Typed Trace MVP (Phase 5)**: Depends on Phase 2 (`T003`, `T004`) and `T009` (settings/URL for `api.ts`) — `T011` before `T012`; `T013` and `T014` can run in parallel once `T003` and `T004` are done
- **US2 202 Approval Card & War Room Assembly (Phase 6)**: Backend `T015` → `T016` depends on `T005` and `T007`; frontend `T017` depends on `T003`, `T004`; `T018` integrates `T010`, `T012`, `T013`, `T014`, `T017`
- **Polish (Phase 7)**: Depends on Phases 1–6 completion (`T019`, `T020`)

### User Story Dependencies

- **US4 (P1)**: Independent backend CORS + `/opspilot/` + design token verification once Foundational Phase 2 completes
- **US3 (P1)**: Independent runtime API URL configuration once Foundational Phase 2 completes
- **US1 (P1 🎯 MVP)**: Consumes `url.ts` (`US3`) for base API URL and delivers `/chat` + `"Ver raciocínio"` typed `TraceViewer` + `StatsStrip` + `ErrorBanner`
- **US2 (P1)**: Extends `POST /chat` (`src/http/schemas.ts`, `src/http/chat.controller.ts`) for HTTP `202` approval payloads and integrates `ApprovalCard` with `US1`/`US3` components inside `ChatTimeline.tsx` and `App.tsx`

### Parallel Opportunities

- **Phase 2**: `T003` (`web/src/styles/`), `T004` (`web/src/types/war-room.ts`), and `T005` (`src/http/schemas.ts`) modify completely disjoint files and can execute in parallel.
- **After Phase 2**: Backend `US4` (`T006` → `T007`) and frontend `US3` (`T008` → `T009` → `T010`) have zero file overlap and can execute in parallel.
- **Within Phase 5 (US1)**: `T013` (`TraceViewer.tsx`) and `T014` (`StatsStrip.tsx` + `ErrorBanner.tsx`) can execute in parallel with `T012` (`trace.ts` + `api.ts`).
- **Within Phase 6 (US2)**: Backend `T015` → `T016` (`src/http/cors.test.ts`, `src/http/chat.controller.ts`) can run in parallel with frontend `T017` (`ApprovalCard.tsx`) before final assembly in `T018`.

---

## Parallel Example: Foundational & Story Split

```bash
# Phase 2 parallel tasks (disjoint files):
Task: "Implement design.instruction.md CSS custom properties ... in web/src/styles/tokens.css and web/src/styles/global.css" (T003)
Task: "Define War Room domain types ... in web/src/types/war-room.ts" (T004)
Task: "Extend ChatRequestSchema ... in src/http/schemas.ts" (T005)

# After Phase 2, US4 backend and US3 frontend run in parallel:
Task: "Create integration tests verifying CORS headers ... in src/http/cors.test.ts" (T006)
Task: "Create unit tests for normalizeApiUrl, isValidApiUrl, and settings persistence in web/src/lib/url.test.ts" (T008)
```

---

## Implementation Strategy

### MVP First (Foundations + US4 + US3 + US1 Core)

1. Complete Phase 1: Setup (`T001`–`T002`)
2. Complete Phase 2: Foundational (`T003`–`T005`)
3. Complete Phase 3 (US4 CORS) & Phase 4 (US3 Gear Settings) (`T006`–`T010`)
4. Complete Phase 5 (US1 Chat & `"Ver raciocínio"` Typed Trace) (`T011`–`T014`)
5. Wire minimal War Room view or proceed immediately into Phase 6 (`T015`–`T018`) to validate interactive `/chat` + trace telemetry + `202` cards

### Incremental Delivery

1. Setup + Foundational → `web/` Vite scaffold, `design.instruction.md` tokens, domain types, Zod extensions ready
2. US4 → Express serves CORS headers and exposes `X-Request-Id`
3. US3 → Settings gear configures and persists runtime API URL cleanly
4. US1 (🎯 MVP) → War Room `/chat` + `"Ver raciocínio"` typed trace viewer + KPI stats + accessible errors
5. US2 → HTTP `202` `ApprovalCard` (**"Aprovar"** / **"Negar"**) and complete `ChatTimeline` + `App` assembly
6. Polish (`T019`–`T020`) → Backend `typecheck` + `npm test`, frontend unit tests, strict `tsc`, and `vite build` (`/opspilot/`) all green

---

## Notes

- `[P]` tasks operate on separate files with no unmet dependencies
- `[Story]` labels trace every implementation/test task directly to `specs/018-war-room-web/spec.md`
- All `web/**` UI styling and markup must strictly follow `design.instruction.md` (`4px` spacing tokens, `tabular-nums`, dark-first layered surfaces, guided empty states, `role="alert"` errors with `requestId` + Retry, WCAG 2.1 AA)
- Commit or verify cleanly after each checkpoint; never commit or read `.env`
