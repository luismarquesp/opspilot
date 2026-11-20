# Quickstart Validation Guide: GitHub Pages Deployment & `README.md`

**Feature Branch**: `019-pages-deploy-web`  
**Date**: 2026-11-20  

---

## Scenario 1: Local Verification of Pages Build & Workflow Contract Tests

Run all checks from repository root:

```bash
npm --prefix web run typecheck
npm --prefix web run build
npm run typecheck
npm test
```

### Expected Outcome
- `npm --prefix web run typecheck` and `npm --prefix web run build` exit `0` and emit `web/dist/index.html` with `/opspilot/assets/...` asset URLs.
- `src/ci/pages-deploy.test.ts` passes inside `npm test`, verifying `.github/workflows/deploy-pages.yml` (`upload-pages-artifact`, `deploy-pages`, `permissions`, `github-pages`, `./web/dist`) and required sections in `README.md`.

---

## Scenario 2: GitHub Repository Activation

1. Push branch / merge to `main` (containing `.github/workflows/deploy-pages.yml` and `web/`).
2. On GitHub, open **Settings -> Pages -> Build and deployment** and set **Source** to **GitHub Actions**.
3. Wait for automatic run on push or trigger **Deploy War Room to GitHub Pages** manually via **Actions -> Run workflow**.
4. Open the emitted `page_url` (served at `/opspilot/`), click the header gear (`⚙`), and enter your running OpsPilot API URL if using a remote backend.
