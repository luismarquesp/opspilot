# Feature Specification: Deploy do War Room (`web/`) no GitHub Pages via Actions & Atualização do `README.md`

**Feature Branch**: `019-pages-deploy-web`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "Deploy do web/ no Pages via Actions: upload-pages-artifact + deploy-pages, permissions, README (atualizar)"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automated War Room (`web/`) Build & Deployment to GitHub Pages (Priority: P1) 🎯 MVP

As a platform engineer maintaining OpsPilot, I want changes to the War Room web console (`web/`) merged into the default branch (or triggered manually) to automatically build static assets, upload the Pages artifact via `actions/upload-pages-artifact`, and publish the bundle via `actions/deploy-pages`, so that the live War Room console is always accessible under `/opspilot/` without manual asset copying.

**Why this priority**: Eliminates manual static builds and ensures every merged War Room change is reproducibly built, verified, and published.

**Independent Test**:
Inspect the workflow configuration and simulate/validate the build job locally (`web/` install, strict typecheck, production build generating `web/dist` with `/opspilot/` base assets), verifying that the workflow uploads `web/dist` with `upload-pages-artifact` and publishes it in a subsequent `deploy` job using `deploy-pages`.

**Acceptance Scenarios**:

1. **Given** a push to `main` touching `web/**` (or the deployment workflow) or a manual `workflow_dispatch` trigger, **When** the GitHub Actions workflow runs, **Then** the build job checks out the repository, sets up Node.js 22 with dependency caching, runs unit tests / typecheck / production build inside `web/`, and uploads `web/dist` via `actions/upload-pages-artifact`.
2. **Given** a successful build artifact upload, **When** the `deploy` job executes, **Then** it consumes the uploaded artifact and publishes the site via `actions/deploy-pages`, exposing `page_url` as the job environment URL.
3. **Given** a failing test, type error, or build failure in `web/`, **When** the build job fails, **Then** artifact upload and Pages deployment are aborted so no broken War Room bundle reaches production.

---

### User Story 2 - Least-Privilege Workflow Permissions & Concurrency Governance (Priority: P1)

As a repository security reviewer, I want the GitHub Pages deployment workflow to declare explicit least-privilege permissions (`contents: read`, `pages: write`, `id-token: write`), bind deployment to the `github-pages` environment, and serialize concurrent deployments, so that deployment tokens have only the minimum access required and overlapping pushes never race or corrupt the published site.

**Why this priority**: Enforces GitHub Actions security best practices and prevents deployment race conditions during rapid merges.

**Independent Test**:
Inspect the workflow definition and verify top-level `permissions` explicitly restrict access (`contents: read`, `pages: write`, `id-token: write`), a `concurrency` group prevents parallel overlapping deployments (`cancel-in-progress: false` so an active deploy finishes cleanly), and the deploy job sets `environment: name: github-pages` with `url: ${{ steps.deployment.outputs.page_url }}`.

**Acceptance Scenarios**:

1. **Given** the Pages workflow definition, **When** auditing token permissions, **Then** only `contents: read`, `pages: write`, and `id-token: write` are granted (no broad `write-all` permissions).
2. **Given** two pushes arriving within seconds of each other on `main`, **When** queued by GitHub Actions, **Then** the `pages` concurrency group guarantees sequential safe deployment rather than interrupting an in-progress publish.
3. **Given** the `deploy` job configuration, **When** deployment succeeds, **Then** the `github-pages` environment records the published `page_url`.

---

### User Story 3 - Updated `README.md` with Architecture, Commands & Pages Deployment Guide (Priority: P2)

As an engineer or evaluator cloning OpsPilot for the first time, I want an up-to-date root `README.md` explaining the project architecture, local backend and War Room `web/` setup, test/typecheck commands, HTTP endpoints, environment configuration, and how GitHub Pages deploys `web/` (including pointing the hosted UI to a live backend API via the settings gear), so that I can operate and deploy OpsPilot without guessing missing instructions.

**Why this priority**: Ensures reproducibility across local development, CI/CD, and hosted Pages usage for developers and on-call operators.

**Independent Test**:
Read the generated/updated `README.md` and verify it accurately lists all actual npm scripts (`dev`, `test`, `typecheck`, `arena`, `bench`, `mcp`, plus `web/` dev/build/test commands), HTTP endpoints (`/chat`, `/requests/:id`, `/stats`, `/memories`), required environment variables (without revealing secrets), GitHub Pages setup instructions (`Settings -> Pages -> GitHub Actions`), and settings gear usage under `/opspilot/`.

**Acceptance Scenarios**:

1. **Given** a contributor reading the root `README.md`, **When** setting up locally, **Then** clear step-by-step commands start the Express API and the `web/` War Room console without reading `.env` secrets or guessing ports.
2. **Given** a maintainer enabling deployment on GitHub, **When** following the GitHub Pages section in `README.md`, **Then** they know which repository setting to enable (`Source: GitHub Actions`), what triggers the workflow, and how to point the deployed `/opspilot/` UI to any API URL using the header gear icon.

---

### Edge Cases

- **Test or Typecheck Failure Before Artifact Upload**: Running `web` unit tests and `tsc --noEmit` prior to `vite build` ensures invalid code cannot create a Pages artifact.
- **Repository Subpath Deployment (`/opspilot/`)**: Since GitHub Pages for project repositories serves under `/<repo>/` (matching `/opspilot/`), `web/` assets built with `base: "/opspilot/"` resolve cleanly on `*.github.io/opspilot/`.
- **In-Flight Pages Deployment During Rapid Pushes**: Concurrency uses `group: "pages"` with `cancel-in-progress: false` so active deployments are never terminated mid-publish.
- **Cross-Origin API Access from GitHub Pages**: Hosted UI origin (`https://<user>.github.io`) differs from local or cloud Express API origins, documented clearly alongside the Settings Gear and CORS support already built into Express.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a GitHub Actions workflow under `.github/workflows/` triggered on pushes to `main` (scoped to relevant `web/**` and workflow changes, or explicit run) and manual `workflow_dispatch`.
- **FR-002**: The workflow MUST declare explicit least-privilege `permissions` (`contents: read`, `pages: write`, `id-token: write`) and a `pages` concurrency group (`cancel-in-progress: false`).
- **FR-003**: The `build` job MUST install dependencies cleanly in `web/` (using deterministic `npm ci` when lockfile exists or safe fallback `npm install`), verify `web/` tests and strict TypeScript types, build `web/dist` with base `/opspilot/`, and upload `./web/dist` using `actions/upload-pages-artifact`.
- **FR-004**: The `deploy` job MUST depend on `build` (`needs: build`), target `environment: name: github-pages` with `url: ${{ steps.deployment.outputs.page_url }}`, and publish the uploaded artifact using `actions/deploy-pages`.
- **FR-005**: Root `README.md` MUST be created/updated with accurate documentation covering OpsPilot overview, stack, prerequisites, environment variables (strictly placeholder names, zero secrets), backend & `web/` commands, API endpoints, and GitHub Pages + Settings Gear deployment guide.

### Key Entities

- **Pages Deployment Workflow**: Automated two-stage CI/CD pipeline (`build` -> `deploy`) with least-privilege permissions and concurrency safety.
- **War Room Static Artifact**: Production-ready `web/dist` bundle served under `/opspilot/`.
- **Root Documentation (`README.md`)**: Single operational and onboarding reference matching implemented repository scripts, routes, and workflows.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of workflow triggers compile, typecheck, and test `web/` before uploading the Pages artifact, guaranteeing zero broken bundles reach deployment.
- **SC-002**: Workflow permission scope is restricted strictly to `contents: read`, `pages: write`, and `id-token: write` with `0` unnecessary write scopes.
- **SC-003**: Root `README.md` documents 100% of active backend & frontend commands, core API endpoints, and GitHub Pages setup steps so a new engineer can launch both API and War Room locally in under 5 minutes.
- **SC-004**: All verification checks for `web/` (`test`, `typecheck`, `build`) and backend (`typecheck`, `test`) remain 100% green after applying the workflow and documentation updates.

---

## Assumptions

- Target repository hosts its default branch as `main` and publishes the project site at `/opspilot/` (matching `web/vite.config.ts` `base: "/opspilot/"` and the repository name `ops-pilot` / `opspilot`).
- Repository maintainers enable GitHub Pages source as **GitHub Actions** in repository settings prior to the first run.
- Because the Express backend is stateful (SQLite + LLM/MCP orchestration), only the static frontend (`web/dist`) is hosted on GitHub Pages, connecting cross-origin to any running OpsPilot API URL configured via the War Room gear icon.
