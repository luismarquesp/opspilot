# Implementation Plan: OpsPilot War Room Web UI (`web/`) & CORS

**Branch**: `018-war-room-web` | **Date**: 2026-11-20 | **Spec**: [specs/018-war-room-web/spec.md](file:///c:/Users/luism/OneDrive/Documentos/P%C3%B3s%20gradua%C3%A7%C3%A3o/Handsome/me/modulo04-agentes-autonomos/ops-pilot/specs/018-war-room-web/spec.md)

**Input**: Feature specification from `/specs/018-war-room-web/spec.md`

## Summary

Build the **OpsPilot War Room** frontend under `web/` (Vite + React + TypeScript, `base: "/opspilot/"`) strictly adhering to [design.instruction.md](file:///c:/Users/luism/OneDrive/Documentos/P%C3%B3s%20gradua%C3%A7%C3%A3o/Handsome/me/modulo04-agentes-autonomos/ops-pilot/design.instruction.md), and add Express CORS + HTTP `202` approval flow support:
1. **Express CORS & `202` Approval Flow (`src/http/`)**: Add CORS middleware in `src/http/server.ts` exposing `X-Request-Id` and handling `OPTIONS` preflight with `204`; extend `ChatRequestSchema` and `chat.controller.ts` to support `202 Accepted` pending-approval payloads and `approve`/`reject` resolution.
2. **Vite + React + TypeScript War Room (`web/`)**: Configure `web/vite.config.ts` with `base: "/opspilot/"`; implement `web/src/styles/tokens.css` & `global.css` encoding `design.instruction.md` (`4px` scale `--space-1`..`--space-16`, dark-first layered surfaces, monospace `tabular-nums`, `:focus-visible`, `prefers-reduced-motion`).
3. **War Room Features**:
   - Chat stream sending to `POST /chat` with telemetry badges and **"Ver raciocínio"** toggle rendering typed `TraceViewer` events (`route`, `thought`, `action`, `observation`, `plan`, `critique`, `fallback`, `summarize`, `answer`).
   - HTTP `202` rendered as an interactive `ApprovalCard` with **"Aprovar"** and **"Negar"** actions.
   - Header settings gear opening `ApiConfigModal` to edit/persist the API URL in `localStorage`, plus compact `/stats?since=24h` KPI bar, guided empty states, and `role="alert"` error banners with `requestId` + Retry.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM (`strict: true`) for backend (`src/`) and React + Vite TypeScript (`strict: true`) for frontend (`web/`)  
**Primary Dependencies**:
- Backend: `express` (`^5.2.1`), `zod` (`^4.5.4`), `node:sqlite`
- Frontend (`web/`): `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`  
**Storage**: Browser `localStorage` for War Room settings (`apiUrl`, `theme`); backend SQLite via `node:sqlite`  
**Testing**: `node:test` via `tsx` + `supertest` for backend (`src/http/cors.test.ts`, `src/http/chat.test.ts`) and pure `web/src/lib/*.test.ts` unit tests; `tsc --noEmit` + `vite build` for `web/`  
**Target Platform**: Modern browsers (under `/opspilot/`) + Node.js HTTP server  
**Project Type**: Full-stack web console (`web/`) + REST/Agent API (`src/`)  
**Performance Goals**: Zero-dependency CORS overhead (<1ms); Vite production bundle cleanly built under `/opspilot/`; instant trace expand/collapse  
**Constraints**: Strict compliance with `design.instruction.md` (`applyTo: "web/**"`); `base: "/opspilot/"`; `Access-Control-Expose-Headers: X-Request-Id`; `npm run typecheck` and `npm test` green  
**Scale/Scope**: `src/http/server.ts`, `src/http/schemas.ts`, `src/http/chat.controller.ts`, `src/http/cors.test.ts`, and `web/` standalone Vite + React + TS app

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status | Verification |
|---|---|---|---|
| **I. Pure Functions & MVC Architecture** | Frontend pure helpers (`web/src/lib/url.ts`, `web/src/lib/trace.ts`, `web/src/lib/api.ts`) separated from React UI; backend CORS & approval validation handled at controller/middleware boundary | **PASS** | Verified in `research.md` & `data-model.md` |
| **II. Strict Boundary Validation with Zod** | Backend `ChatRequestSchema` & `PendingApprovalResponseSchema` validated via Zod; frontend URL validation guards gear settings | **PASS** | Verified in `contracts/war-room-api.md` |
| **III. Test-First & Non-Negotiable Quality Gates** | Automated tests for CORS, HTTP `202` approval flow, and `web/src/lib/*.test.ts` pure helpers; `tsc --noEmit` + `npm test` + `vite build` | **PASS** | Verified in `quickstart.md` |
| **IV. Secret & Environment Safety** | No `.env` reads; API URL configured via `VITE_API_URL` or runtime gear settings (`localStorage`) | **PASS** | Clean runtime config |
| **V. Agent-Centric Orchestration & Design Rules** | Surfacing typed LangGraph traces (`node`, `route`, `action`, `fallback`) and complying 100% with `design.instruction.md` | **PASS** | Verified against `design.instruction.md` |

## Project Structure

### Documentation (this feature)

```text
specs/018-war-room-web/
├── spec.md                       # Feature specification
├── plan.md                       # This file (/speckit-plan output)
├── research.md                   # Phase 0 technical decisions
├── data-model.md                 # Phase 1 types, tokens & sequence flow
├── quickstart.md                 # Phase 1 validation scenarios
├── checklists/
│   └── requirements.md           # Spec quality checklist
└── contracts/
    └── war-room-api.md           # Phase 1 CORS, 202 approval & UI contracts
```

### Source Code (repository root)

```text
src/
└── http/
    ├── schemas.ts                # Add requireApproval, approvalId, decision, approved, PendingApprovalResponseSchema
    ├── chat.controller.ts        # Handle 202 pending_approval & approve/reject resolution
    ├── server.ts                 # Add CORS middleware (Allow-Origin/Methods/Headers, Expose X-Request-Id, OPTIONS 204)
    └── cors.test.ts              # Integration tests for CORS, OPTIONS preflight & HTTP 202 approval flow

web/
├── package.json                  # Vite + React + TypeScript scripts & deps
├── tsconfig.json                 # Strict TypeScript config
├── vite.config.ts                # base: "/opspilot/"
├── index.html                    # Entry HTML with dark-mode anti-flash / root mount
└── src/
    ├── main.tsx                  # React root mount
    ├── App.tsx                   # War Room layout (Header + StatsStrip + ChatTimeline + Composer + ApiConfigModal)
    ├── styles/
    │   ├── tokens.css            # design.instruction.md tokens (--space-1..16, dark/light surfaces, status colors)
    │   └── global.css            # Base reset, tabular-nums, :focus-visible, prefers-reduced-motion
    ├── types/
    │   └── war-room.ts           # TypedTraceEvent, PendingApprovalPayload, ChatTimelineItem, WarRoomSettings
    ├── lib/
    │   ├── url.ts                # Pure API URL normalization, validation & localStorage helpers
    │   ├── url.test.ts           # Unit tests for URL normalization & validation
    │   ├── trace.ts              # Pure typed trace event descriptor & metadata helpers
    │   ├── trace.test.ts         # Unit tests for typed trace formatting & 202 payload parsing
    │   └── api.ts                # Fetch client (POST /chat 200/202, GET /stats, GET /requests/:id, X-Request-Id)
    └── components/
        ├── Header.tsx            # Top bar with title, stats summary, theme toggle, gear button
        ├── StatsStrip.tsx        # Compact /stats?since=24h operational KPI bar
        ├── ChatTimeline.tsx      # aria-live stream + guided EmptyState
        ├── TraceViewer.tsx       # "Ver raciocínio" collapsible typed trace viewer
        ├── ApprovalCard.tsx      # HTTP 202 interactive Aprovar / Negar card
        ├── ErrorBanner.tsx       # role="alert" error state with requestId copy + Retry
        └── ApiConfigModal.tsx    # Settings gear dialog for API base URL & theme
```

**Structure Decision**: Keep backend MVC in `src/` and place the standalone Vite + React + TS application in `web/` so `design.instruction.md` (`applyTo: "web/**"`) governs the entire frontend cleanly while allowing `web/src/lib/*.test.ts` to run under Node's native test runner too.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations detected.*
