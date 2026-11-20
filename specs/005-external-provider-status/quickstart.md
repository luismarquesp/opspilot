# Quickstart Validation Guide: External Provider Status Check (Feature 005)

## Prerequisites

- `npm install` completed (no new packages needed — feature uses only built-in `fetch` and existing `zod`)
- `OPENROUTER_API_KEY` set in `.env` (only needed for end-to-end agent test)
- Node.js 22+ (native `fetch` and `AbortSignal.timeout` required)

---

## 1. Unit Tests — No Network Required

```bash
$env:OPSPILOT_DB=":memory:"; npm test
```

**What to verify**:
- `provider-status.test.ts` suite passes all cases:
  - ✅ GitHub operational → `none — All Systems Operational`
  - ✅ Cloudflare major outage → `major — Major Service Outage`
  - ✅ First attempt timeout, second succeeds → returns compact result
  - ✅ Both attempts timeout → returns readable error string
  - ✅ HTTP 5xx first attempt, success on retry → returns compact result
  - ✅ HTTP 503 on both attempts → returns readable error
  - ✅ Malformed JSON (Zod failure) → returns readable error
  - ✅ HTTP 404 (non-retriable) → returns readable error immediately

**Expected output** (subset):
```
▶ checkProviderStatus — Happy Path
  ✔ github: operational → compact string (Xms)
  ✔ cloudflare: major outage → compact string (Xms)
▶ checkProviderStatus — Retry Behaviour
  ✔ timeout on attempt 1, success on attempt 2 (Xms)
  ✔ double timeout → readable error string (Xms)
▶ checkProviderStatus — Error Containment
  ✔ Zod validation failure → readable error (Xms)
  ✔ 404 (non-retriable) → readable error, no retry (Xms)
```

---

## 2. TypeScript Typecheck

```bash
npm run typecheck
```

**Expected**: Zero errors.

---

## 3. Manual End-to-End — Agent Invokes Tool

Start the dev server:

```bash
npm run dev
```

Ask the agent about GitHub status:

```bash
curl -s -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "O GitHub está fora? Verifica o status pra mim."}' \
  | jq '.answer'
```

**Expected**: Agent invokes `check_provider_status`, reports something like:
```
"O GitHub está operacional: none — All Systems Operational"
```

Ask about Cloudflare:

```bash
curl -s -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Como está a Cloudflare agora?"}' \
  | jq '.answer'
```

**Expected**: Agent invokes `check_provider_status({ provider: "cloudflare" })` and returns current status.

---

## 4. Verify Error Containment (Manual)

Temporarily point the GitHub URL to a non-existent host by passing a bad fetcher in a quick script:

```ts
// scratch test — not part of test suite
import { checkProviderStatus } from "./src/agents/provider-status.js";

const fakeFetch = async () => { throw new Error("ECONNREFUSED"); };
const result = await checkProviderStatus("github", fakeFetch as any);
console.log(result); // Must be a readable string, not a thrown error
```

**Expected**: Prints error string, does NOT throw.

---

## 5. Verify Tool Appears in Agent Tools List

```bash
node --import tsx -e "
import { opsTools } from './src/agents/tools.js';
console.log(opsTools.map(t => t.name));
"
```

**Expected output**:
```json
["list_alerts", "open_incident", "resolve_incident", "list_incidents", "consultar_runbook", "check_provider_status"]
```

---

## Artifact References

- Data model: [data-model.md](./data-model.md)
- Tool contract: [contracts/tools.md](./contracts/tools.md)
- Research decisions: [research.md](./research.md)
