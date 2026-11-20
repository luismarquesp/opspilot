# Tasks: OpsPilot MCP Server — Feature 006

**Branch**: `006-mcp-server` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**User Stories** (all P1 — MVP):
- US1: MCP client discovers tools via `tools/list`
- US2: MCP client lists alerts via `list_alerts`
- US3: MCP client opens an incident via `open_incident`
- US4: MCP client resolves an incident via `resolve_incident`

---

## Phase 1: Setup — Dependencies & npm Script (Foundational)

- [x] T001 Install `@modelcontextprotocol/sdk@^1.30.0`: run `npm install @modelcontextprotocol/sdk`
- [x] T002 Add `"mcp": "tsx src/mcp/server.ts"` to the `"scripts"` section in `package.json`
- [x] T003 Create directory `src/mcp/`
- [x] T004 Run `npm run typecheck` — passes with zero errors (baseline check)

**Checkpoint**: SDK installed, script registered, typecheck green. ✅

---

## Phase 2: US1 — Tool Discovery via `tools/list` (P1) 🏆 MVP

- [x] T005 [US1] Create `src/mcp/server.test.ts` with suite `MCP Server — tools/list (US1)`:
  - tools/list returns exactly 3 tools
  - tools/list returns list_alerts, open_incident, resolve_incident
  - stdout emits only valid JSON lines (purity)
- [x] T006 [US1] Create `src/mcp/server.ts` with all 3 tools registered via `registerTool()` + stdio transport
- [x] T007 [US1] Run `npm run typecheck` and MCP tests — all pass

**Checkpoint**: `tools/list` returns 3 correctly named tools; stdout purity verified. ✅

---

## Phase 3: US2 — `list_alerts` Handler (P1)

- [x] T008 [US2] `src/mcp/server.test.ts` suite `MCP Server — list_alerts (US2)`:
  - list_alerts with status=firing returns JSON array in content
  - list_alerts with no params defaults to firing
  - list_alerts with status=all returns non-empty array (seeded data)
- [x] T009 [US2] Real `list_alerts` handler calling `store.listAlerts()`
- [x] T010 [US2] All US2 tests pass ✅

**Checkpoint**: `list_alerts` returns real alert data from OpsStore. ✅

---

## Phase 4: US3 — `open_incident` Handler (P1)

- [x] T011 [US3] `src/mcp/server.test.ts` suite `MCP Server — open_incident (US3)`:
  - creates incident with status=open
  - normalizes sev1 to critical
  - short title rejected gracefully
- [x] T012 [US3] Real `open_incident` handler with severity normalization
- [x] T013 [US3] All US3 tests pass ✅

**Checkpoint**: `open_incident` creates real incidents with severity normalization. ✅

---

## Phase 5: US4 — `resolve_incident` Handler (P1)

- [x] T014 [US4] `src/mcp/server.test.ts` suite `MCP Server — resolve_incident (US4)`:
  - returns resolved incident
  - unknown id returns readable error in content
  - empty id rejected gracefully
- [x] T015 [US4] Real `resolve_incident` handler with null guard
- [x] T016 [US4] All US4 tests pass ✅

**Checkpoint**: All 4 US fully functional; 12/12 MCP tests green. ✅

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T017 Audit `src/mcp/server.ts` for `console.log` — only match is in a JSDoc comment (zero actual calls)
- [x] T018 Run full `npm run typecheck` — zero errors
- [x] T019 Run `npm test` — 159/160 pass; 1 pre-existing flaky bench test (unrelated to MCP; passes in isolation)
- [x] T020 [P] Manual: `npm run mcp` starts silently on stdio
- [x] T021 [P] `package.json` has `"mcp"` script and `@modelcontextprotocol/sdk` in `dependencies`

---

## Notes

- All 12 MCP-specific tests pass (US1: 3, US2: 3, US3: 3, US4: 3)
- The 1 failure is `bench.test.ts:106` — pre-existing ordering-dependent flaky test; passes in isolation; unrelated to MCP
- `server.ts` uses `server.registerTool()` (v1.x SDK API) with full Zod schemas imported from `tools.ts` — single source of truth maintained
- `.vscode/msc.json` added by user provides VS Code MCP client configuration
