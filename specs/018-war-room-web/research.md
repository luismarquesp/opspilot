# Research: OpsPilot War Room Web UI (`web/`) & CORS

**Feature Branch**: `018-war-room-web`  
**Date**: 2026-11-20  

## Technical Questions & Decisions

### 1. Vite + React + TypeScript Architecture in `web/` with `base: "/opspilot/"`

- **Context**: OpsPilot needs a dedicated web War Room client in `web/` built with Vite, React, and TypeScript, hosted under the `/opspilot/` base path while keeping the root Node.js backend project cleanly decoupled.
- **Decision**:
  - Scaffold an independent `web/` package (`web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/`) using React 18/19, Vite, and TypeScript (`strict: true`).
  - Configure `base: "/opspilot/"` in `web/vite.config.ts` so all production asset URLs and router/relative fetches resolve cleanly under `/opspilot/`.
  - Isolate pure TypeScript helpers (`web/src/lib/url.ts`, `web/src/lib/trace.ts`, `web/src/lib/api.ts`) without DOM/React runtime dependencies so unit tests can run directly with `node:test` via `tsx` from the repository root (`npm test` / `web` tests) in addition to `vite build`.
- **Rationale**: Keeping pure logic separate from React components adheres to OpsPilot's pure-functions architecture and enables deterministic automated testing without heavy headless-browser test dependencies.
- **Alternatives Considered**:
  - *Mixing React dependencies into root `package.json`*: Rejected because keeping `web/package.json` self-contained avoids polluting backend dependencies (`@langchain/*`, `express`, `node:sqlite`) and cleanly scopes `applyTo: "web/**"`.

---

### 2. Typed Reasoning Trace Viewer ("Ver raciocínio")

- **Context**: `POST /chat` returns `trace: TraceEvent[]` where every event carries `type`, `node`, `content`, `timestamp`, and type-specific fields (`action`: `tool`/`args`; `route`: `route`/`reason`; `fallback`: `fromModel`/`toModel`/`reason`). Per `design.instruction.md`, progressive disclosure is required so the operator first sees the consolidated answer and expands the reasoning steps on demand.
- **Decision**:
  - Render a toggle button `"Ver raciocínio"` (`aria-expanded={open}`, `aria-controls={tracePanelId}`) below every assistant message that includes trace events.
  - Inside `TraceViewer`, switch on `event.type` using TypeScript discriminated union narrowing (`route`, `thought`, `action`, `observation`, `plan`, `critique`, `fallback`, `summarize`, `answer`) to render:
    - An accessible badge combining **color + icon + text label** (never color alone).
    - A monospace `node` attribution pill (`router`, `react`, `plan-and-execute`, `reflection`, `response`, `context`).
    - Typed detail blocks: `action` shows tool name and formatted `args` JSON; `route` shows chosen strategy badge and `reason`; `fallback` highlights `fromModel -> toModel` degradation with `reason`; `thought`/`observation`/`plan`/`critique`/`summarize`/`answer` show structured readable content.
- **Rationale**: Discriminated rendering makes every LangGraph decision path immediately auditable by on-call engineers while keeping the default chat stream scannable.
- **Alternatives Considered**:
  - *Dumping `JSON.stringify(trace, null, 2)` in a `<pre>` block*: Rejected because raw JSON fails readability, operational hierarchy, and `design.instruction.md` guidelines.

---

### 3. HTTP `202 Accepted` Human-in-the-Loop Approval Card (`Aprovar` / `Negar`)

- **Context**: When `POST /chat` triggers a gated/sensitive operational step requiring human confirmation, the API returns HTTP `202 Accepted`. The War Room UI must convert `202` responses into an interactive **Aprovar / Negar** card.
- **Decision**:
  - Define a clear `PendingApprovalResponse` contract on `POST /chat` (`status: 202`) containing `{ status: "pending_approval", approvalId, requestId, conversationId, action, tool?, args?, reason?, message, trace?, metrics? }`.
  - Extend `ChatRequestSchema` (`src/http/schemas.ts`) and `createChatHandler` (`src/http/chat.controller.ts`) to support:
    - Optional `requireApproval?: boolean` (or gated action trigger) returning `202 Accepted` with `PendingApprovalResponse` and `X-Request-Id` header.
    - Optional `approvalId?: string` and `decision?: "approve" | "reject"` (or `approved?: boolean`) so clicking **"Aprovar"** or **"Negar"** dispatches `POST /chat` with `{ message, conversationId, approvalId, decision, approved }`, executes or cancels the gated action, and returns `200 OK` with the final answer & trace.
  - In `ApprovalCard.tsx`, track local card state (`pending` → `submitting` → `approved` | `rejected` | `error`), disable both **"Aprovar"** and **"Negar"** buttons while `submitting`, and render a permanent status badge (`[APROVADO]` / `[NEGADO]`) once resolved.
- **Rationale**: Supporting `202 Accepted` + decision submission directly on `POST /chat` (while remaining tolerant of any `202` payload fields returned by custom backends) ensures both live integration and simulated `202` scenarios work seamlessly.
- **Alternatives Considered**:
  - *Frontend-only mocked `202` state with no backend support*: Rejected because end-to-end integration tests with Express and real browser interactions need a real HTTP `202` flow and `X-Request-Id` correlation.

---

### 4. Settings Gear API URL Persistence & Express CORS Middleware

- **Context**: The War Room served at `/opspilot/` (e.g., `http://localhost:5173/opspilot/`) talks cross-origin to the Express server (default `http://localhost:3000`). Operators must also be able to change the API URL via a gear icon in the header.
- **Decision**:
  - Build a pure URL helper (`normalizeApiUrl`, `isValidApiUrl`) in `web/src/lib/url.ts`: validates `http:` / `https:` URLs and strips trailing slashes (`http://localhost:3000/` → `http://localhost:3000`).
  - Persist the URL in `localStorage` under `opspilot.apiUrl`, falling back to `import.meta.env.VITE_API_URL` or `"http://localhost:3000"`.
  - Add lightweight, dependency-free CORS middleware in `src/http/server.ts` setting:
    - `Access-Control-Allow-Origin: *` (or configurable `CORS_ORIGIN`, defaulting to `*` / request `Origin`)
    - `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`
    - `Access-Control-Allow-Headers: Content-Type, Authorization, X-Request-Id`
    - `Access-Control-Expose-Headers: X-Request-Id`
    - Responding `204 No Content` immediately to `OPTIONS` preflight requests.
- **Rationale**: Zero extra runtime dependencies (`cors` package not needed), immediately exposes `X-Request-Id` to `fetch` responses (`res.headers.get("X-Request-Id")`), and keeps the backend test suite fast and clean.
- **Alternatives Considered**:
  - *Relying exclusively on Vite `server.proxy`*: Rejected because production static builds under `/opspilot/` and the configurable gear API URL require real browser CORS support on Express.

---

### 5. `design.instruction.md` Compliance (`applyTo: "web/**"`)

- **Context**: `design.instruction.md` mandates strict visual hierarchy, a `4px` spacing scale (`--space-1`..`--space-16`), guided empty and error states, dark mode (`--bg-canvas: #0B0F17`, `--bg-surface: #111827`, `--bg-elevated: #1E293B`), and WCAG 2.1 AA accessibility.
- **Decision**:
  - Centralize all CSS custom properties in `web/src/styles/tokens.css` using exact token names and values from `design.instruction.md` (both `[data-theme="dark"]` default/system preference and `[data-theme="light"]`).
  - Implement dedicated `EmptyState`, `ErrorBanner`, `Header`, `StatsBar`, `ChatTimeline`, `TraceViewer`, `ApprovalCard`, and `ApiSettingsModal` components obeying `:focus-visible`, `aria-live="polite"`, `role="alert"`, `tabular-nums`, color + icon + text badges, and `@media (prefers-reduced-motion: reduce)`.
- **Rationale**: Guarantees 100% traceability between `design.instruction.md` rules and implemented CSS/DOM structures.
