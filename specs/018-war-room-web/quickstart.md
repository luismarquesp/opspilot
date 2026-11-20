# Quickstart Validation Guide: OpsPilot War Room Web UI (`web/`) & CORS

**Feature Branch**: `018-war-room-web`  
**Date**: 2026-11-20  

---

## Prerequisites

1. Node.js 22 LTS installed.
2. Root dependencies installed (`npm install`) and `web/` dependencies installed (`npm --prefix web install`).

---

## Scenario 1: Backend CORS & HTTP `202` Approval Contract

```bash
npm run typecheck
npm test
```

### Expected Outcome
- `OPTIONS /chat` and `OPTIONS /stats` return HTTP `204` with `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, and `Access-Control-Expose-Headers: X-Request-Id`.
- `POST /chat` with `requireApproval: true` returns HTTP `202` with `approvalId`, `requestId`, `conversationId`, and `X-Request-Id` header.
- Submitting `decision: "approve"` returns `200 OK` executing the request; submitting `decision: "reject"` returns `200 OK` confirming cancellation without execution.

---

## Scenario 2: Web Pure Logic & Vite Build under `/opspilot/`

```bash
node --import tsx --test "web/src/**/*.test.ts"
npm --prefix web run typecheck
npm --prefix web run build
```

### Expected Outcome
- Unit tests verify API URL normalization/validation (`normalizeApiUrl`, `isValidApiUrl`), typed trace grouping/labels, and `202` payload parsing.
- `web/dist/index.html` references assets prefixed with `/opspilot/` (confirming `base: "/opspilot/"`).

---

## Scenario 3: Interactive Manual Verification (Optional Dev Run)

1. Start API: `npm run dev` (listens on `http://localhost:3000`).
2. Start Web UI: `npm --prefix web run dev` (serves at `http://localhost:5173/opspilot/`).
3. Send a message → verify answer + click **"Ver raciocínio"** to inspect typed trace events.
4. Click the header gear icon → change API URL → confirm persistence across reload.
5. Trigger a `202` action → click **Aprovar** or **Negar** and observe card transition.
