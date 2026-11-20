# Research: Deploy do War Room (`web/`) no GitHub Pages via Actions & `README.md`

**Feature Branch**: `019-pages-deploy-web`  
**Date**: 2026-11-20  

## Technical Questions & Decisions

### 1. Two-Job GitHub Actions Workflow (`actions/upload-pages-artifact` + `actions/deploy-pages`)

- **Context**: The OpsPilot War Room static frontend in `web/` is built with Vite + React + TypeScript using `base: "/opspilot/"` (`web/vite.config.ts`) and outputs static assets into `web/dist`.
- **Decision**:
  - Create `.github/workflows/deploy-pages.yml` triggered on:
    - `push` to `branches: ["main"]` with `paths: ["web/**", ".github/workflows/deploy-pages.yml"]`
    - `workflow_dispatch` for on-demand manual runs.
  - Structure two jobs:
    1. **`build`**:
       - Checks out repository (`actions/checkout@v4`).
       - Configures Node.js 22 (`actions/setup-node@v4`) with npm caching targeting `web/package-lock.json`.
       - Installs `web/` dependencies (`npm --prefix web ci`), runs strict TypeScript validation (`npm --prefix web run typecheck`), and builds production assets (`npm --prefix web run build` → `web/dist`).
       - Configures Pages metadata (`actions/configure-pages@v5`).
       - Uploads `./web/dist` via `actions/upload-pages-artifact@v3`.
    2. **`deploy`**:
       - Depends on `build` (`needs: build`).
       - Binds `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`.
       - Publishes via `actions/deploy-pages@v4` (`id: deployment`).
- **Rationale**: Keeping `web/package-lock.json` as the sole install target avoids pulling heavy backend LLM/ONNX dependencies (`@huggingface/transformers`) during frontend-only deploys, while `npm --prefix web run typecheck && npm --prefix web run build` still verifies strict types and bundle integrity before `upload-pages-artifact`.
- **Alternatives Considered**:
  - *Pushing built artifacts to a `gh-pages` branch*: Rejected because the official GitHub Actions artifact flow (`configure-pages` -> `upload-pages-artifact` -> `deploy-pages`) is safer, requires no branch force-pushes, and works cleanly with OIDC `id-token` attestation.

---

### 2. Least-Privilege `permissions` & Concurrency Governance

- **Context**: Official GitHub Pages Actions require OIDC minting and Pages API write access while keeping repository code access read-only.
- **Decision**:
  - Set top-level `permissions`:
    - `contents: read`
    - `pages: write`
    - `id-token: write`
  - Set top-level `concurrency`:
    - `group: "pages"`
    - `cancel-in-progress: false`
- **Rationale**: Follows least-privilege security (no `contents: write` or `write-all`) and prevents aborting an active `deploy-pages` roll-forward if another commit lands on `main`.
- **Alternatives Considered**:
  - *`cancel-in-progress: true`*: Rejected per GitHub Pages guidance because cancelling an active deployment step can leave a partially updated Pages deployment state.

---

### 3. Root `README.md` Update & Hosted UI Connectivity

- **Context**: The repository currently lacks a root `README.md`. Developers and operators need clear documentation covering the backend API, MCP server, War Room `web/`, tests, and how the GitHub Pages-hosted War Room (`/opspilot/`) connects to a live OpsPilot API.
- **Decision**:
  - Create root `README.md` containing:
    - Project overview & architecture (LangGraph `router -> strategy -> response`, SQLite `node:sqlite`, OpenRouter fallback resilience, MCP server, React War Room).
    - Prerequisites (Node.js 22 LTS) & safe environment variable table (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_MODEL_FALLBACK`, `OPSPILOT_DB`, `PORT` — referencing variable names only, never `.env` secrets).
    - Verified backend commands (`npm run dev`, `npm test`, `npm run typecheck`, `npm run arena`, `npm run bench`, `npm run seed`, `npm run mcp`) and War Room commands (`npm --prefix web run dev`, `npm --prefix web run build`, `npm --prefix web run typecheck`, `node --import tsx --test "web/src/**/*.test.ts"`).
    - REST API summary (`POST /chat` with HTTP `200` + `202` approval flow and `X-Request-Id`, `GET /requests/:id`, `GET /stats?since=24h`, `/memories`).
    - Step-by-step GitHub Pages enablement (`Settings -> Pages -> Source: GitHub Actions`) and how operators open the header Settings Gear (`⚙`) in the deployed `/opspilot/` UI to target their API origin (enabled via Express CORS).
- **Rationale**: Aligns documentation 1:1 with the implemented repository scripts, Constitution rules, and `018-war-room-web` deployment topology.

---

### 4. Continuous Verification Test (`src/ci/pages-deploy.test.ts`)

- **Context**: OpsPilot's Constitution requires automated tests under `node:test` (`npm test`) for newly added operational configurations.
- **Decision**:
  - Add `src/ci/pages-deploy.test.ts` validating that `.github/workflows/deploy-pages.yml` declares `contents: read`, `pages: write`, `id-token: write`, `concurrency`, `actions/upload-pages-artifact`, `path: ./web/dist`, `environment: github-pages`, and `actions/deploy-pages`, and that `README.md` covers required setup, endpoints, and Pages instructions.
- **Rationale**: Catches accidental removal of Pages permissions, wrong artifact directory, or stale workflow paths during routine `npm test` runs.
