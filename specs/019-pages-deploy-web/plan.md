# Implementation Plan: Deploy do War Room (`web/`) no GitHub Pages via Actions & Atualização do `README.md`

**Branch**: `019-pages-deploy-web` | **Date**: 2026-11-20 | **Spec**: [specs/019-pages-deploy-web/spec.md](file:///c:/Users/luism/OneDrive/Documentos/P%C3%B3s%20gradua%C3%A7%C3%A3o/Handsome/me/modulo04-agentes-autonomos/ops-pilot/specs/019-pages-deploy-web/spec.md)

**Input**: Feature specification from `/specs/019-pages-deploy-web/spec.md`

## Summary

Automate deployment of the OpsPilot War Room frontend (`web/`) to GitHub Pages under `/opspilot/` via GitHub Actions and create a comprehensive root `README.md`:
1. **GitHub Actions Pages Workflow (`.github/workflows/deploy-pages.yml`)**: Two-job pipeline (`build` + `deploy`) with least-privilege permissions (`contents: read`, `pages: write`, `id-token: write`), `pages` concurrency (`cancel-in-progress: false`), Node 22 build of `web/` (`npm --prefix web ci`, `typecheck`, `build`), `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` (`path: ./web/dist`), and `actions/deploy-pages@v4` targeting the `github-pages` environment.
2. **Root Documentation (`README.md`)**: Document architecture, Node 22 prerequisites, environment variables, backend & `web/` commands, REST API routes, and GitHub Pages + Settings Gear instructions.
3. **Contract Test (`src/ci/pages-deploy.test.ts`)**: Verify workflow YAML structure/permissions/actions and `README.md` completeness automatically within `npm test`.

## Technical Context

**Language/Version**: YAML (GitHub Actions workflow), Markdown (`README.md`), TypeScript ESM `strict: true` (`node:test` via `tsx`)  
**Primary Dependencies**: GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`), Node.js 22 LTS, Vite (`web/`)  
**Storage**: N/A (stateless CI/CD build & static Pages artifact `./web/dist`)  
**Testing**: `node:test` via `tsx` (`src/ci/pages-deploy.test.ts`), `npm --prefix web run typecheck`, `npm --prefix web run build`, `npm run typecheck`, `npm test`  
**Target Platform**: GitHub Actions (`ubuntu-latest`) & GitHub Pages (`github-pages` environment at `/opspilot/`)  
**Project Type**: CI/CD workflow + project documentation + config contract test  
**Performance Goals**: Cached `web/package-lock.json` install with frontend-only build avoiding heavyweight backend ML/ONNX dependencies  
**Constraints**: Least-privilege `permissions` (`contents: read`, `pages: write`, `id-token: write`); artifact path `./web/dist`; never expose or read `.env` secrets; keep `npm run typecheck` and `npm test` green  
**Scale/Scope**: `.github/workflows/deploy-pages.yml`, `README.md`, and `src/ci/pages-deploy.test.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status | Verification |
|---|---|---|---|
| **I. Pure Functions & MVC Architecture** | Workflow/docs changes do not couple or alter backend MVC boundaries; verification test isolates static file assertions cleanly | **PASS** | Verified in `research.md` & `data-model.md` |
| **II. Strict Boundary Validation with Zod** | Workflow/CI inputs are constrained by explicit triggers, `permissions`, and `pages` environment; `README.md` documents existing Zod-validated endpoints accurately | **PASS** | Verified in `contracts/pages-workflow-contract.md` |
| **III. Test-First & Non-Negotiable Quality Gates** | Automated `node:test` contract suite (`src/ci/pages-deploy.test.ts`) ensures workflow and `README.md` compliance within `npm test` + `npm run typecheck` | **PASS** | Verified in `quickstart.md` |
| **IV. Secret & Environment Safety** | No `.env` reads or embedded tokens; OIDC `id-token: write` replaces static deploy tokens, and `README.md` uses placeholders only | **PASS** | Clean runtime & docs safety |
| **V. Agent-Centric Orchestration (OpsPilot)** | Enables zero-friction access to the hosted War Room UI (`/opspilot/`) interacting with OpsPilot's LangGraph API via CORS | **PASS** | Aligns with `018-war-room-web` |

## Project Structure

### Documentation (this feature)

```text
specs/019-pages-deploy-web/
├── spec.md                              # Feature specification
├── plan.md                              # This file (/speckit-plan output)
├── research.md                          # Phase 0 workflow, permission & caching decisions
├── data-model.md                        # Phase 1 CI/CD flow & documentation entities
├── quickstart.md                        # Phase 1 verification & Pages activation guide
├── checklists/
│   └── requirements.md                  # Spec quality checklist
└── contracts/
    └── pages-workflow-contract.md       # Phase 1 workflow & README contracts
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── deploy-pages.yml                 # Build web/ + upload-pages-artifact + deploy-pages
src/
└── ci/
    └── pages-deploy.test.ts             # Automated contract tests for workflow & README.md
README.md                                # Updated project, API & GitHub Pages documentation
```

**Structure Decision**: Keep deployment automation cleanly isolated in `.github/workflows/deploy-pages.yml`, documentation in root `README.md`, and contract tests in `src/ci/pages-deploy.test.ts` so standard `npm test` verifies CI/documentation invariants continuously.
