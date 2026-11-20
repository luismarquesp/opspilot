# Interface Contract: War Room Web API & CORS

**Feature Branch**: `018-war-room-web`  
**Date**: 2026-11-20  

---

## 1. CORS Policy (`src/http/server.ts`)

Applied to all Express routes (`/chat`, `/requests/:id`, `/stats`, `/memories`):

### Preflight `OPTIONS *`
- **Status**: `204 No Content`
- **Response Headers**:
  - `Access-Control-Allow-Origin`: `<request Origin or *>`
  - `Access-Control-Allow-Methods`: `GET, POST, PUT, PATCH, DELETE, OPTIONS`
  - `Access-Control-Allow-Headers`: `Content-Type, Authorization, X-Request-Id`
  - `Access-Control-Expose-Headers`: `X-Request-Id`

### Standard Cross-Origin Responses (`200`, `202`, `4xx`, `5xx`)
- Include `Access-Control-Allow-Origin` and `Access-Control-Expose-Headers: X-Request-Id` so browser `fetch` can read `response.headers.get("X-Request-Id")`.

---

## 2. `POST /chat` — Standard & Approval (`202`) Contracts

### Request Body (`ChatRequestSchema`)
```json
{
  "message": "Abrir incidente crítico para payment-api",
  "strategy": "react",
  "conversationId": "conv-123",
  "requireApproval": true
}
```

### Response `202 Accepted` (Pending Human Approval)
```json
{
  "status": "pending_approval",
  "approvalId": "apr-7b2e6f1c",
  "requestId": "7b2e6f1c-4c31-4f9e-b1ab-8e92f0123456",
  "conversationId": "conv-123",
  "action": "open_incident",
  "tool": "open_incident",
  "args": {
    "title": "High 5xx on payment-api",
    "service": "payment-api",
    "severity": "critical"
  },
  "reason": "Ação crítica aguarda confirmação humana no War Room.",
  "message": "Aprovação necessária para executar a ação operacional solicitada."
}
```

### Submitting Decision from War Room (`Aprovar` / `Negar`)
```json
{
  "message": "Abrir incidente crítico para payment-api",
  "conversationId": "conv-123",
  "approvalId": "apr-7b2e6f1c",
  "decision": "approve",
  "approved": true
}
```
- When `decision: "approve"` (`approved: true`): executes the request via `runProductionGraph` and returns `200 OK` with `answer`, `trace`, `metrics`, and `requestId`.
- When `decision: "reject"` (`approved: false`): skips execution cleanly and returns `200 OK` with a confirmation message (`"Ação negada pelo operador."`), `requestId`, and empty/audit trace.

---

## 3. UI Component Contracts (`web/src/`)

| Component | Trigger / Prop Contract | Accessibility & Design Rules |
|---|---|---|
| `Header` | Displays title, `/stats` summary strip, theme toggle, and Settings Gear button (`aria-label="Configurações da API"`) | `<header>` landmark, `tabular-nums` on KPIs |
| `ChatTimeline` | Renders `EmptyState` when empty; renders user, assistant (`"Ver raciocínio"` button + `TraceViewer`), `ApprovalCard`, and `ErrorBanner` | `aria-live="polite"` stream container |
| `TraceViewer` | Receives `trace: TypedTraceEvent[]`; collapsed by default; toggled by `"Ver raciocínio"` (`aria-expanded`) | Monospace `node` pills, color + icon + text type badges |
| `ApprovalCard` | Rendered on HTTP `202`; buttons `"Aprovar"` and `"Negar"`; disables during submit; shows final badge | Focusable buttons, clear state announcement |
| `ApiConfigModal` | Opens from Settings Gear; input for API URL + Save/Reset/Cancel; saves normalized URL to `localStorage` | Focus visible, `Escape` closes, `aria-invalid` on bad URL |
| `ErrorBanner` | Rendered on `4xx`/`5xx`/network failure; shows human error, copyable `requestId`, and **Tentar novamente** | `role="alert"`, preserves prompt text |
