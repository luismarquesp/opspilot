# Interface Contract: GitHub Pages Workflow & Root `README.md`

**Feature Branch**: `019-pages-deploy-web`  
**Date**: 2026-11-20  

---

## 1. GitHub Actions Workflow Contract (`.github/workflows/deploy-pages.yml`)

Required top-level keys and job contracts:

- **Name**: `Deploy War Room to GitHub Pages`
- **Triggers (`on`)**:
  - `push`: `branches: [main]`, `paths: ["web/**", ".github/workflows/deploy-pages.yml"]`
  - `workflow_dispatch`
- **Permissions (`permissions`)**:
  - `contents: read`
  - `pages: write`
  - `id-token: write`
- **Concurrency (`concurrency`)**:
  - `group: pages`
  - `cancel-in-progress: false`
- **Job `build`**:
  - Runs on `ubuntu-latest`
  - Uses `actions/checkout@v4`
  - Uses `actions/setup-node@v4` with `node-version: "22"`, `cache: "npm"`, `cache-dependency-path: "web/package-lock.json"`
  - Executes `npm --prefix web ci`
  - Executes `npm --prefix web run typecheck`
  - Executes `npm --prefix web run build`
  - Uses `actions/configure-pages@v5`
  - Uses `actions/upload-pages-artifact@v3` with `with.path: ./web/dist`
- **Job `deploy`**:
  - `needs: build`
  - Runs on `ubuntu-latest`
  - `environment`:
    - `name: github-pages`
    - `url: ${{ steps.deployment.outputs.page_url }}`
  - Step `id: deployment` uses `actions/deploy-pages@v4`

---

## 2. Root Documentation Contract (`README.md`)

`README.md` MUST document accurately (strictly matching observed codebase files/scripts):

1. **Architecture & Features**: OpsPilot LangChain/LangGraph copilot, SQLite persistence (`node:sqlite`), OpenRouter fallback chain, structured JSON logging, MCP server, and `web/` War Room UI (`/opspilot/`).
2. **Prerequisites & Environment Variables**: Node.js 22 LTS; variable reference matching `src/config/env.ts` (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_MODEL_FALLBACK`, `OPSPILOT_DB`, `PORT`) with zero real secrets.
3. **Scripts & Commands**:
   - Backend: `npm run dev`, `npm test`, `npm run typecheck`, `npm run arena`, `npm run bench`, `npm run seed`, `npm run mcp`
   - Web (`web/`): `npm --prefix web install`, `npm --prefix web run dev`, `npm --prefix web run typecheck`, `npm --prefix web run build`, `node --import tsx --test "web/src/**/*.test.ts"`
4. **API Endpoints**:
   - `POST /chat` (including `requestId` / `X-Request-Id`, `strategy`, HTTP `200`, and HTTP `202` `requireApproval` / `decision` flow)
   - `GET /requests/:id`
   - `GET /stats?since=24h`
   - `/memories` (`POST`, `GET`, `GET /recall`, `DELETE /:id`)
5. **GitHub Pages Deploy Guide**:
   - Workflow file [deploy-pages.yml](../../.github/workflows/deploy-pages.yml) using `upload-pages-artifact` + `deploy-pages`
   - Repository configuration: **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**
   - Connecting the static `/opspilot/` UI on Pages to a backend API via the Settings Gear (`⚙`) and Express CORS support.
