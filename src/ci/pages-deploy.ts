export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

interface ContractRule {
  pattern: RegExp;
  message: string;
}

const BUILD_AND_DEPLOY_RULES: readonly ContractRule[] = [
  {
    pattern: /on:\s*[\s\S]*?push:\s*[\s\S]*?branches:\s*[\s\S]*?\bmain\b/,
    message: "Workflow deve disparar em push para a branch main.",
  },
  {
    pattern: /workflow_dispatch:/,
    message: "Workflow deve permitir disparo manual via workflow_dispatch.",
  },
  {
    pattern: /uses:\s*actions\/checkout@v\d+/,
    message: "Job de build deve usar actions/checkout.",
  },
  {
    pattern: /uses:\s*actions\/setup-node@v\d+/,
    message: "Job de build deve usar actions/setup-node.",
  },
  {
    pattern: /node-version:\s*["']?22["']?/,
    message: "Workflow deve usar Node.js 22 LTS.",
  },
  {
    pattern: /cache-dependency-path:\s*["']?web\/package-lock\.json["']?/,
    message: "Setup do Node deve fazer cache via web/package-lock.json.",
  },
  {
    pattern: /npm --prefix web ci/,
    message: "Build deve instalar dependências determinísticas via npm --prefix web ci.",
  },
  {
    pattern: /npm --prefix web run typecheck/,
    message: "Build deve validar TypeScript com npm --prefix web run typecheck.",
  },
  {
    pattern: /npm --prefix web run build/,
    message: "Build deve compilar o bundle com npm --prefix web run build.",
  },
  {
    pattern: /uses:\s*actions\/configure-pages@v\d+/,
    message: "Build deve configurar Pages com actions/configure-pages.",
  },
  {
    pattern: /uses:\s*actions\/upload-pages-artifact@v\d+/,
    message: "Build deve empacotar web/dist via actions/upload-pages-artifact.",
  },
  {
    pattern: /path:\s*["']?\.?\/?web\/dist["']?/,
    message: "Artifact de Pages deve apontar para ./web/dist.",
  },
  {
    pattern: /needs:\s*build/,
    message: "Job deploy deve depender do job build (needs: build).",
  },
  {
    pattern: /uses:\s*actions\/deploy-pages@v\d+/,
    message: "Job deploy deve publicar com actions/deploy-pages.",
  },
];

const PERMISSIONS_AND_GOVERNANCE_RULES: readonly ContractRule[] = [
  {
    pattern: /permissions:\s*[\s\S]*?contents:\s*read/,
    message: "Permissions deve conceder contents: read.",
  },
  {
    pattern: /permissions:\s*[\s\S]*?pages:\s*write/,
    message: "Permissions deve conceder pages: write.",
  },
  {
    pattern: /permissions:\s*[\s\S]*?id-token:\s*write/,
    message: "Permissions deve conceder id-token: write.",
  },
  {
    pattern: /concurrency:\s*[\s\S]*?group:\s*["']?pages["']?/,
    message: "Workflow deve definir concurrency group: pages.",
  },
  {
    pattern: /cancel-in-progress:\s*false/,
    message: "Concurrency do Pages deve definir cancel-in-progress: false.",
  },
  {
    pattern: /environment:\s*[\s\S]*?name:\s*github-pages/,
    message: "Job deploy deve usar environment name: github-pages.",
  },
  {
    pattern: /url:\s*\$\{\{\s*steps\.deployment\.outputs\.page_url\s*\}\}/,
    message: "Environment deve expor url: ${{ steps.deployment.outputs.page_url }}.",
  },
];

const README_REQUIRED_RULES: readonly ContractRule[] = [
  {
    pattern: /OpsPilot/,
    message: "README deve identificar o projeto OpsPilot.",
  },
  {
    pattern: /Node\.js\s*22/i,
    message: "README deve documentar o pré-requisito Node.js 22.",
  },
  {
    pattern: /OPENROUTER_API_KEY/,
    message: "README deve documentar OPENROUTER_API_KEY.",
  },
  {
    pattern: /OPENROUTER_MODEL/,
    message: "README deve documentar OPENROUTER_MODEL.",
  },
  {
    pattern: /OPENROUTER_MODEL_FALLBACK/,
    message: "README deve documentar OPENROUTER_MODEL_FALLBACK.",
  },
  {
    pattern: /OPSPILOT_DB/,
    message: "README deve documentar OPSPILOT_DB.",
  },
  {
    pattern: /PORT/,
    message: "README deve documentar PORT.",
  },
  {
    pattern: /npm run dev/,
    message: "README deve documentar npm run dev.",
  },
  {
    pattern: /npm test/,
    message: "README deve documentar npm test.",
  },
  {
    pattern: /npm run typecheck/,
    message: "README deve documentar npm run typecheck.",
  },
  {
    pattern: /npm --prefix web run dev/,
    message: "README deve documentar npm --prefix web run dev.",
  },
  {
    pattern: /npm --prefix web run build/,
    message: "README deve documentar npm --prefix web run build.",
  },
  {
    pattern: /POST \/chat/,
    message: "README deve documentar o endpoint POST /chat.",
  },
  {
    pattern: /GET \/requests\/:id/,
    message: "README deve documentar o endpoint GET /requests/:id.",
  },
  {
    pattern: /GET \/stats/,
    message: "README deve documentar o endpoint GET /stats.",
  },
  {
    pattern: /\/memories/,
    message: "README deve documentar os endpoints /memories.",
  },
  {
    pattern: /upload-pages-artifact/,
    message: "README deve mencionar actions/upload-pages-artifact.",
  },
  {
    pattern: /deploy-pages/,
    message: "README deve mencionar actions/deploy-pages.",
  },
  {
    pattern: /GitHub Actions/i,
    message: "README deve orientar configurar Pages com Source: GitHub Actions.",
  },
  {
    pattern: /\/opspilot\//,
    message: "README deve explicar o base path /opspilot/ e a engrenagem de URL da API.",
  },
];

function collectMissingRules(
  content: string,
  rules: readonly ContractRule[]
): string[] {
  return rules
    .filter((rule) => !rule.pattern.test(content))
    .map((rule) => rule.message);
}

export function validatePagesWorkflowBuildAndDeploy(
  yamlContent: string
): ValidationResult {
  const issues = collectMissingRules(yamlContent, BUILD_AND_DEPLOY_RULES);
  return { valid: issues.length === 0, issues };
}

export function validatePagesPermissionsAndGovernance(
  yamlContent: string
): ValidationResult {
  const issues = collectMissingRules(
    yamlContent,
    PERMISSIONS_AND_GOVERNANCE_RULES
  );

  if (/permissions:\s*write-all/i.test(yamlContent)) {
    issues.push("Workflow não pode usar permissions: write-all.");
  }
  if (/contents:\s*write/i.test(yamlContent)) {
    issues.push("Workflow deve manter contents: read (mínimo privilégio).");
  }

  return { valid: issues.length === 0, issues };
}

export function validateReadmeDocumentation(
  markdownContent: string
): ValidationResult {
  const issues = collectMissingRules(markdownContent, README_REQUIRED_RULES);

  if (/sk-or-v1-[A-Za-z0-9]{10,}/.test(markdownContent)) {
    issues.push("README não deve conter chaves reais de API.");
  }

  return { valid: issues.length === 0, issues };
}
