# Quickstart Validation Guide: SQLite Real Persistence (Feature 004)

## Prerequisites

- Node.js 22.5+ (for `node:sqlite` built-in)
- `npm install` completed
- `.env` file present (or just `OPSPILOT_DB` set; no DB credentials needed)

---

## 1. Verify the Store Initializes and Seeds

Run tests against `:memory:` — this proves DDL, seed, and all queries work:

```bash
npm test
```

**Expected outcome**: All tests pass, including:
- `SqliteOpsStore` suite: seed count (5 services, 6 alerts, 3 runbooks), idempotent seed, listIncidents filters, resolveIncident, CHECK constraint rejection.
- `tools.test.ts` suite: list_alerts, open_incident, resolve_incident, list_incidents, consultar_runbook.
- All existing suites (arena, bench, reflection, trace, plan-and-execute) remain green.

---

## 2. Verify TypeScript Compilation

```bash
npm run typecheck
```

**Expected outcome**: Zero errors.

---

## 3. Verify Persistent Storage End-to-End

Start the dev server:

```bash
npm run dev
```

Open an incident via the chat API:

```bash
curl -s -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Abre um incidente crítico no payment-api por alta taxa de 5xx"}' \
  | jq .
```

**Expected**: Agent responds confirming incident opened; a new `data/opspilot.db` file exists.

Stop the server (`Ctrl+C`), restart it:

```bash
npm run dev
```

List incidents:

```bash
curl -s -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Quais incidentes estão abertos?"}' \
  | jq .
```

**Expected**: The incident opened before the restart is returned — confirming durability.

---

## 4. Verify Runbook Retrieval

```bash
curl -s -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Qual é o runbook do payment-api?"}' \
  | jq .
```

**Expected**: Agent returns the payment-api runbook content.

---

## 5. Verify Idempotent Seed

Delete and recreate the database, then restart:

```bash
Remove-Item data/opspilot.db -Force   # PowerShell
npm run dev
```

**Expected**: Server starts, database is recreated, baseline data is seeded automatically without errors.

---

## 6. Verify `.gitignore` Exclusion

```bash
git status
```

**Expected**: `data/opspilot.db` does NOT appear in `Untracked files`.

---

## Artifact References

- Data model: [data-model.md](./data-model.md)
- Tool contracts: [contracts/tools.md](./contracts/tools.md)
- Research decisions: [research.md](./research.md)
