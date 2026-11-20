---

description: "Task list for GitHub Pages deployment of web/ and README.md update"
---

# Tasks: Deploy do War Room (`web/`) no GitHub Pages via Actions & Atualização do `README.md`

**Input**: Design documents from `/specs/019-pages-deploy-web/`
**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/pages-workflow-contract.md`, `quickstart.md`

**Tests**: Unit/contract tests under `node:test` (`src/ci/pages-deploy.test.ts`) are included per OpsPilot Constitution Principle III to validate `.github/workflows/deploy-pages.yml` and `README.md` invariants before and after implementation.

**Organization**: Tasks are grouped by user story (`US1` Pages Build/Deploy MVP, `US2` Permissions & Concurrency Governance, `US3` Root `README.md`) so each slice can be validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`)
- Include exact file paths in descriptions

## Path Conventions

- **CI/CD Workflow**: `.github/workflows/deploy-pages.yml`
- **Documentation**: `README.md` at repository root
- **Validation & Tests**: `src/ci/pages-deploy.ts`, `src/ci/pages-deploy.test.ts`
- **Frontend Target**: `web/` (`web/vite.config.ts`, `web/package.json`, `web/package-lock.json`, `web/dist/`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify baseline frontend Vite subpath and lockfile artifacts required by the Pages Actions pipeline

- [X] T001 Verify web/ Vite base "/opspilot/" configuration and lockfile presence in web/vite.config.ts and web/package-lock.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure contract parser/validator helpers for workflow YAML and `README.md` checks used across all user stories

**⚠️ CRITICAL**: No user story test or workflow task should finalize before this helper module exists

- [X] T002 Create pure workflow and README contract validator helpers in src/ci/pages-deploy.ts

**Checkpoint**: Contract validation module ready — user story tests and deliverables can proceed

---

## Phase 3: User Story 1 - Automated War Room (`web/`) Build & Deployment to GitHub Pages (Priority: P1) 🎯 MVP

**Goal**: Automate building `web/` under Node.js 22 (with npm cache on `web/package-lock.json`), running strict typecheck & Vite build, packaging `./web/dist` via `actions/upload-pages-artifact`, and publishing via `actions/deploy-pages` on pushes to `main` (`web/**`) or `workflow_dispatch`.

**Independent Test**: Run `src/ci/pages-deploy.test.ts` (US1) and execute `npm --prefix web run typecheck && npm --prefix web run build` locally to confirm `.github/workflows/deploy-pages.yml` builds `web/`, uploads `./web/dist` with `upload-pages-artifact`, and publishes with `deploy-pages`, while `web/dist/index.html` references `/opspilot/assets/...`.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T003 [P] [US1] Create unit tests verifying build job, upload-pages-artifact (./web/dist), and deploy-pages steps in src/ci/pages-deploy.test.ts

### Implementation for User Story 1

- [X] T004 [US1] Create GitHub Actions Pages workflow with build (Node 22, web typecheck & build, upload-pages-artifact) and deploy (deploy-pages) jobs in .github/workflows/deploy-pages.yml

**Checkpoint**: Automated Pages build + upload-pages-artifact + deploy-pages workflow is valid and independently verifiable

---

## Phase 4: User Story 2 - Least-Privilege Workflow Permissions & Concurrency Governance (Priority: P1)

**Goal**: Enforce minimal GitHub token permissions (`contents: read`, `pages: write`, `id-token: write`), bind the `deploy` job to `environment: github-pages` with `page_url` output, and serialize overlapping deployments with `concurrency` (`group: pages`, `cancel-in-progress: false`).

**Independent Test**: Execute `src/ci/pages-deploy.test.ts` (US2) and confirm `.github/workflows/deploy-pages.yml` grants strictly `contents: read`, `pages: write`, `id-token: write`, defines `concurrency` (`group: pages`, `cancel-in-progress: false`), and binds `environment.name: github-pages` + `url: ${{ steps.deployment.outputs.page_url }}`.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T005 [P] [US2] Add unit tests verifying least-privilege permissions (contents: read, pages: write, id-token: write), pages concurrency group, and github-pages environment URL output in src/ci/pages-deploy.test.ts

### Implementation for User Story 2

- [X] T006 [US2] Enforce least-privilege permissions, concurrency (group: pages, cancel-in-progress: false), and github-pages environment output in .github/workflows/deploy-pages.yml

**Checkpoint**: Workflow permissions, concurrency control, and `github-pages` environment binding verified independently

---

## Phase 5: User Story 3 - Updated `README.md` with Architecture, Commands & Pages Deployment Guide (Priority: P2)

**Goal**: Provide a complete, accurate root `README.md` documenting OpsPilot architecture, prerequisites, placeholder environment variables, backend & `web/` commands, REST API routes (`/chat`, `/requests/:id`, `/stats`, `/memories`), GitHub Pages Actions setup (`Settings -> Pages -> GitHub Actions`), and connecting `/opspilot/` to the backend API via the Settings Gear.

**Independent Test**: Execute `src/ci/pages-deploy.test.ts` (US3) and inspect `README.md` to confirm zero exposed secrets, accurate command parity with `package.json` / `web/package.json`, full endpoint documentation, and step-by-step GitHub Pages + Settings Gear instructions.

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T007 [P] [US3] Add unit tests verifying README.md documents stack, env placeholders, backend/web commands, API endpoints, and GitHub Pages + Settings Gear instructions in src/ci/pages-deploy.test.ts

### Implementation for User Story 3

- [X] T008 [US3] Create root project documentation with architecture, commands, endpoints, GitHub Pages Actions activation, and War Room API URL gear configuration in README.md

**Checkpoint**: Root `README.md` matches codebase reality and passes automated contract validation

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify full frontend production build (`/opspilot/`), backend TypeScript compilation, and all test suites pass cleanly together

- [X] T009 Run npm --prefix web run typecheck and npm --prefix web run build in web/package.json to verify the /opspilot/ Pages bundle
- [X] T010 Run npm run typecheck and npm test in package.json to verify all contract and integration tests pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verify `web/` baseline first (`T001`)
- **Foundational (Phase 2)**: Depends on Setup (`T001`) — creates pure validation helpers in `src/ci/pages-deploy.ts` (`T002`)
- **US1 Pages Build/Deploy MVP (Phase 3)**: Depends on Phase 2 — `T003` before `T004`
- **US2 Permissions & Concurrency (Phase 4)**: Depends on `T004` for workflow file — `T005` before `T006`
- **US3 Root `README.md` (Phase 5)**: Depends on Phase 2 — completely disjoint from `.github/workflows/deploy-pages.yml` (`T007` before `T008`)
- **Polish (Phase 6)**: Depends on Phases 3–5 completion (`T009`, `T010`)

### User Story Dependencies

- **US1 (P1 🎯 MVP)**: Core Pages Actions build + artifact upload + deploy pipeline
- **US2 (P1)**: Security permissions, `pages` concurrency, and `github-pages` environment hardening on the workflow created in US1
- **US3 (P2)**: Independent documentation file (`README.md`) referencing workflow path, commands, and Settings Gear runtime API connection

### Parallel Opportunities

- After Phase 2 (`T002`) and once US1 (`T003`–`T004`) starts, US3 documentation (`T007` → `T008` targeting `README.md`) has zero file overlap with `.github/workflows/deploy-pages.yml` (`T004`, `T006`) and can be developed in parallel.
- In Phase 6, `T009` (`web/` checks) and `T010` (root checks) inspect separate sub-projects and can execute independently once edits finish.

---

## Parallel Example: Workflow vs Documentation

```bash
# Once Foundational T002 completes, US3 README documentation can progress alongside workflow hardening:
Task: "Create unit tests verifying build job, upload-pages-artifact ... in src/ci/pages-deploy.test.ts" (T003)
Task: "Create root project documentation ... in README.md" (T008)
```

---

## Implementation Strategy

### MVP First (US1 + US2 Workflow Core)

1. Verify `web/` config & lockfile (`T001`) and implement pure contract validators (`T002`)
2. Write US1 tests (`T003`) -> create `.github/workflows/deploy-pages.yml` (`T004`)
3. Add US2 permissions & concurrency tests (`T005`) -> verify/enforce in `.github/workflows/deploy-pages.yml` (`T006`)

### Incremental Delivery

1. Add US3 documentation test (`T007`) -> author root `README.md` (`T008`)
2. Run full verification gates across `web/` (`T009`) and root backend/tests (`T010`)

---

## Notes

- Never read `.env` or embed real API keys in `README.md` or workflow files
- Ensure `actions/upload-pages-artifact` explicitly points to `./web/dist` (built with `base: "/opspilot/"`)
- Verify all `src/ci/pages-deploy.test.ts` checks run and pass inside standard `npm test`
