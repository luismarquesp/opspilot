# Feature Specification: OpsPilot War Room Web UI (`web/`) & CORS

**Feature Branch**: `018-war-room-web`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "War room web/ (Vite+react+TS) com as instructions de design: chat -> /chat, com "ver raciocínio" abrindo trace tipado. 202 vira cartão aprovar/negar; engrenagem com URL da API. base /opspilot/; CORS"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Interactive War Room Chat with Typed Reasoning Trace ("Ver raciocínio") (Priority: P1) 🎯 MVP

As an on-call SRE operating in the OpsPilot War Room, I want to submit operational questions to `/chat`, read the consolidated answer alongside key telemetry (`requestId`, route, model used, latency, prompt tokens), and click **"Ver raciocínio"** to inspect the step-by-step typed reasoning trace, so that I can verify tool invocations, routing decisions, and fallbacks before taking production action.

**Why this priority**: Core operational workflow of the War Room — turning raw agent telemetry into an inspectable, trustworthy on-call console.

**Independent Test**:
Submit a prompt in the War Room chat input targeting `POST /chat`. Verify that the message renders in the conversation timeline, the assistant response displays its answer and telemetry metadata (`requestId`, `modelUsed`, `latencyMs`, `promptTokens`), and clicking **"Ver raciocínio"** toggles a structured, typed trace panel displaying each event's `node`, `type` (`route`, `thought`, `action`, `observation`, `plan`, `critique`, `fallback`, `summarize`, `answer`), and type-specific attributes (`tool`, `args`, `route`, `reason`, `fromModel`, `toModel`).

**Acceptance Scenarios**:

1. **Given** an operator submits a valid message in the War Room chat, **When** `POST /chat` returns HTTP `200`, **Then** the UI displays the assistant answer, preserves `conversationId` for subsequent turns, and shows compact telemetry badges (`requestId`, route, model, latency, tokens).
2. **Given** an assistant response containing trace events, **When** the operator clicks **"Ver raciocínio"**, **Then** a typed trace viewer expands showing every trace step with its originating `node`, typed badge/icon, and structured payload (`tool` + `args` for `action`, `route` + `reason` for `route`, `fromModel` + `toModel` + `reason` for `fallback`).
3. **Given** an expanded trace panel, **When** the operator clicks **"Ocultar raciocínio"** (or presses `Enter`/`Space` on the toggle button), **Then** the trace panel collapses cleanly and updates `aria-expanded`.

---

### User Story 2 - Human-in-the-Loop Approval Card for HTTP 202 Responses (Priority: P1)

As an on-call engineer reviewing a high-impact operational action proposed by OpsPilot, I want an HTTP `202 Accepted` response from `/chat` to render as an interactive approval card with **"Aprovar"** and **"Negar"** actions, so that sensitive remediations (such as opening/resolving critical incidents or executing mutations) require explicit human confirmation before execution.

**Why this priority**: Enforces safe human-in-the-loop governance over autonomous incident mitigations directly inside the War Room stream.

**Independent Test**:
Simulate or trigger a `POST /chat` response returning HTTP `202` with pending action metadata. Verify that the War Room renders an interactive approval card displaying the action summary/arguments and **"Aprovar"** and **"Negar"** buttons, submits the operator's decision when clicked, prevents duplicate clicks while pending, and updates the card to its final resolved state (`Aprovado` or `Negado`).

**Acceptance Scenarios**:

1. **Given** `POST /chat` returns HTTP `202 Accepted` with pending action metadata, **When** rendered in the chat timeline, **Then** the UI displays a highlighted approval card showing the action name, parameters/arguments, rationale, and **"Aprovar"** and **"Negar"** buttons.
2. **Given** a pending `202` approval card, **When** the operator clicks **"Aprovar"**, **Then** the UI disables both buttons during submission, sends the approval decision to the API, and transitions the card to an **Aprovado** state (displaying any follow-up answer/result).
3. **Given** a pending `202` approval card, **When** the operator clicks **"Negar"**, **Then** the UI disables both buttons during submission, sends the rejection decision to the API, and transitions the card to a **Negado** state without executing the proposed action.

---

### User Story 3 - Configurable API Base URL via Settings Gear (Priority: P1)

As an engineer running the War Room UI against local, staging, or remote OpsPilot backends, I want a settings gear button in the header to view, edit, and save the OpsPilot API base URL, so that I can retarget the frontend at runtime without rebuilding assets.

**Why this priority**: Decouples static frontend builds (`/opspilot/`) from backend host configuration across local dev and multi-environment deployments.

**Independent Test**:
Click the settings gear button in the War Room header, enter a custom API URL (e.g., `http://localhost:4000/`), save it, reload the page, and verify that the normalized URL (`http://localhost:4000`) persists in `localStorage` and subsequent `/chat` and `/stats` requests target the configured URL.

**Acceptance Scenarios**:

1. **Given** the War Room header, **When** the operator clicks the settings gear button, **Then** a settings dialog/popover opens displaying the active API base URL and theme controls.
2. **Given** the settings dialog, **When** the operator enters a valid HTTP/HTTPS URL and saves, **Then** trailing slashes are normalized, the URL is persisted in `localStorage`, and subsequent API calls immediately use the updated base URL.
3. **Given** an invalid or malformed URL entered in the settings dialog, **When** attempting to save, **Then** inline validation feedback (`aria-invalid="true"`) blocks saving and preserves the user's input.

---

### User Story 4 - Base Path `/opspilot/`, Backend CORS & Design System Compliance (Priority: P1)

As a platform engineer deploying the OpsPilot War Room under `/opspilot/` against a separate Express API origin, I want the frontend configured with base path `/opspilot/`, the Express backend configured with CORS (including `X-Request-Id` header exposure and `OPTIONS` preflight handling), and the entire UI built in strict compliance with `design.instruction.md`, so that cross-origin requests succeed reliably and the console meets operational usability and WCAG 2.1 AA accessibility standards.

**Why this priority**: Guarantees deployability under `/opspilot/`, seamless browser communication with the API, and consistent dark-first on-call ergonomics.

**Independent Test**:
Build `web/` and verify generated asset paths resolve under `/opspilot/`. Execute cross-origin requests (`Origin: http://localhost:5173`) and `OPTIONS` preflight requests against Express and verify `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, and `Access-Control-Expose-Headers: X-Request-Id`. Verify UI layout tokens, dark mode toggle, empty/error states, and accessibility attributes.

**Acceptance Scenarios**:

1. **Given** the Vite configuration for `web/`, **When** built or served, **Then** the application base path is `/opspilot/`.
2. **Given** a browser client on a different origin (e.g., Vite dev server) issuing `OPTIONS` preflight or `POST /chat` / `GET /stats` / `GET /requests/:id` requests, **When** handled by Express, **Then** the server responds with proper CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Expose-Headers: X-Request-Id`) and HTTP `204` on preflight.
3. **Given** any view in `web/**`, **When** inspecting styles and DOM semantics, **Then** all tokens follow the `4px` spacing scale (`--space-1`..`--space-16`), monospace telemetry uses `tabular-nums`, dark mode works via `[data-theme="dark"]` and `prefers-color-scheme: dark`, empty/error states show clear guidance and `requestId` + Retry, and WCAG 2.1 AA accessibility rules (`:focus-visible`, `aria-live`, color + icon + text) are enforced.

---

## Edge Cases

- **Duplicate Click Prevention on `202` Approval Card**: While an **"Aprovar"** or **"Negar"** submission is in flight, both buttons are disabled and show a loading indicator so operators cannot trigger duplicate approvals.
- **API Unreachable or `500`/`503`/`504` Errors**: Renders an accessible `role="alert"` banner with a human-readable explanation, the `X-Request-Id` / `requestId` (when returned) with a copy action, a **Tentar novamente** button preserving the prompt, and a quick trigger to inspect/edit the API URL via the gear settings.
- **Empty Conversation & Empty Stats Window**: When no messages have been sent or `/stats` returns `total: 0`, the UI renders a guided empty state with an icon, helpful prompt suggestions, and clear next actions (never blank screens or raw `[]`).
- **URL Normalization & Validation in Gear Settings**: Trailing slashes (e.g., `http://localhost:3000/`) are stripped cleanly; empty or non-HTTP(S) strings trigger inline validation errors.
- **Keyboard & Reduced Motion Support**: Trace toggles, approval cards, and the gear settings dialog support full keyboard navigation (`Tab`, `Enter`/`Space`, `Escape`), visible focus rings (`:focus-visible`), and `@media (prefers-reduced-motion: reduce)`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Vite + React + TypeScript web application under `web/` configured with `base: "/opspilot/"`.
- **FR-002**: The War Room chat view MUST send prompts to `POST /chat`, track `conversationId` across turns, and display assistant responses with `requestId`, route, model used, latency, and token metrics.
- **FR-003**: Assistant messages with trace events MUST provide a **"Ver raciocínio"** toggle (`aria-expanded`) revealing a typed trace viewer supporting every `TraceEvent` type (`route`, `thought`, `action`, `observation`, `plan`, `critique`, `fallback`, `summarize`, `answer`), `node` attribution, and typed fields (`tool`, `args`, `route`, `reason`, `fromModel`, `toModel`).
- **FR-004**: When `POST /chat` returns HTTP `202 Accepted`, the War Room MUST render an interactive approval card displaying the pending action details and **"Aprovar"** / **"Negar"** buttons, dispatch the operator's decision to the API, and update the card state to `Aprovado` or `Negado`.
- **FR-005**: The War Room header MUST provide a settings gear control (`aria-label`) opening a dialog/panel to inspect, validate, and persist the API base URL in `localStorage` (defaulting to `VITE_API_URL` or `http://localhost:3000`).
- **FR-006**: The Express backend (`src/http/server.ts`) MUST enable CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Expose-Headers: X-Request-Id`) and respond `204 No Content` to `OPTIONS` preflight requests.
- **FR-007**: All components and stylesheets in `web/**` MUST adhere to [design.instruction.md](file:///c:/Users/luism/OneDrive/Documentos/P%C3%B3s%20gradua%C3%A7%C3%A3o/Handsome/me/modulo04-agentes-autonomos/ops-pilot/design.instruction.md):
  - Operational visual hierarchy (`critical` > `warning` > `info`) and monospace `tabular-nums` for IDs, nodes, latencies, tokens, and costs.
  - Strict `4px` spatial scale tokens (`--space-1` to `--space-16`).
  - Guided empty states and actionable error states (`400`/`422` inline, `404` guidance, `500`/`503`/`504` alert banner with `requestId` + retry).
  - Dark-first theme support (`prefers-color-scheme: dark` and `[data-theme="dark"]` / `[data-theme="light"]`) with layered semantic surface tokens.
  - WCAG 2.1 AA accessibility (4.5:1 text contrast, color + icon + text labels, semantic landmarks, `:focus-visible`, `aria-live`, `prefers-reduced-motion: reduce`).
- **FR-008**: The War Room SHOULD surface live summary telemetry from `GET /stats?since=24h` (and allow looking up persisted traces via `GET /requests/:id`) in a compact operational header/panel without cluttering the primary chat flow.

### Key Entities *(include if feature involves data)*

- **WarRoomMessage**: Chat timeline entry representing a user prompt, an assistant response (`answer`, `trace`, `metrics`, `requestId`, `selectedRoute`), an HTTP `202` approval card, or an error state.
- **TypedTraceEvent**: Discriminated union matching backend `TraceEventSchema` (`route`, `thought`, `action`, `observation`, `plan`, `critique`, `fallback`, `summarize`, `answer`) with `node`, `content`, `timestamp`, and type-specific attributes.
- **PendingApprovalPayload**: Structured HTTP `202` payload containing `approvalId`/`requestId`, `conversationId`, `action`/`tool`, `args`, `description`/`message`, and UI resolution state (`pending` | `submitting` | `approved` | `rejected`).
- **WarRoomSettings**: Persisted browser settings (`apiUrl`, `theme`) stored in `localStorage`.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of `POST /chat` turns in the War Room render their answer, telemetry badges, and expandable **"Ver raciocínio"** typed trace without unformatted raw JSON dumps for trace headers.
- **SC-002**: 100% of HTTP `202 Accepted` responses transform into interactive **Aprovar / Negar** cards that transition cleanly to resolved states upon user confirmation.
- **SC-003**: Updating the API URL via the settings gear immediately persists across page reloads and routes subsequent API requests to the new origin.
- **SC-004**: Cross-origin requests from the Vite app (`/opspilot/`) to Express succeed including `OPTIONS` preflight and client access to `X-Request-Id`.
- **SC-005**: Production build (`vite build` in `web/` with `base: "/opspilot/"`), TypeScript compilation (`npm run typecheck`), and test suites (`npm test`) pass with zero errors.

---

## Assumptions

- The OpsPilot Express API exposes `POST /chat`, `GET /requests/:id`, and `GET /stats?since=24h`.
- For HTTP `202 Accepted` responses from `POST /chat`, the backend/approval contract includes an explicit approval action payload (or decision callback endpoint such as `POST /chat` / `POST /approvals/:id` or decision message/action payload) that the War Room submits when **Aprovar** or **Negar** is clicked; details of the backend `202` approval endpoint will be formalized during `/speckit-plan`.
- Modern browsers supporting ES modules, CSS Custom Properties, `localStorage`, and `fetch` are targeted.
