import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  validatePagesWorkflowBuildAndDeploy,
  validatePagesPermissionsAndGovernance,
  validateReadmeDocumentation,
} from "./pages-deploy.js";

const REPO_ROOT = path.resolve(process.cwd());
const WORKFLOW_PATH = path.join(
  REPO_ROOT,
  ".github",
  "workflows",
  "deploy.yml"
);
const README_PATH = path.join(REPO_ROOT, "README.md");

test("GitHub Pages Workflow & README Contract Tests (019-pages-deploy-web)", async (t) => {
  await t.test("T003 (US1): validates upload-pages-artifact and deploy-pages build/deploy rules", () => {
    const missingArtifact = validatePagesWorkflowBuildAndDeploy(`
on:
  push:
    branches: [main]
jobs:
  build:
    steps:
      - run: npm --prefix web run build
`);
    assert.equal(missingArtifact.valid, false);
    assert.ok(
      missingArtifact.issues.some((i) => i.includes("upload-pages-artifact"))
    );

    assert.equal(fs.existsSync(WORKFLOW_PATH), true, "deploy.yml must exist");
    const workflowYaml = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const buildResult = validatePagesWorkflowBuildAndDeploy(workflowYaml);
    assert.deepEqual(buildResult.issues, []);
    assert.equal(buildResult.valid, true);
  });

  await t.test("T005 (US2): enforces least-privilege permissions, concurrency, and github-pages environment", () => {
    const overprivileged = validatePagesPermissionsAndGovernance(`
permissions: write-all
concurrency:
  group: pages
  cancel-in-progress: true
`);
    assert.equal(overprivileged.valid, false);
    assert.ok(overprivileged.issues.some((i) => i.includes("write-all")));

    assert.equal(fs.existsSync(WORKFLOW_PATH), true, "deploy.yml must exist");
    const workflowYaml = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const govResult = validatePagesPermissionsAndGovernance(workflowYaml);
    assert.deepEqual(govResult.issues, []);
    assert.equal(govResult.valid, true);
  });

  await t.test("T007 (US3): verifies root README.md documents stack, placeholders, commands, API, and Pages gear setup", () => {
    const secretLeakCheck = validateReadmeDocumentation(
      "OPENROUTER_API_KEY=sk-or-v1-1234567890abcdef"
    );
    assert.equal(secretLeakCheck.valid, false);
    assert.ok(
      secretLeakCheck.issues.some((i) => i.includes("chaves reais"))
    );

    assert.equal(fs.existsSync(README_PATH), true, "README.md must exist");
    const readmeContent = fs.readFileSync(README_PATH, "utf8");
    const readmeResult = validateReadmeDocumentation(readmeContent);
    assert.deepEqual(readmeResult.issues, []);
    assert.equal(readmeResult.valid, true);
  });
});
