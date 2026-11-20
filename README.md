# OpsPilot

Copiloto autônomo de plantão para triagem, gestão e resposta a alertas e incidentes de produção, construído com **LangChain / LangGraph** sobre **OpenRouter**, API **Express 5** com persistência **SQLite (`node:sqlite`)**, servidor **MCP** e console web **War Room (`web/`)**.

---

## Arquitetura Geral

- **Orquestração LangGraph (`src/agents/production-graph.ts`)**: fluxo `context -> router -> (react | plan-and-execute | reflection) -> response`, com fallback automático de modelos (`ResilientChatModel`) e rastreamento tipado de trace (`route`, `thought`, `action`, `observation`, `plan`, `critique`, `fallback`, `summarize`, `answer`).
- **Persistência & Observabilidade (`node:sqlite` + NDJSON)**:
  - Histórico de conversas e resumos incrementais (`conversation_summaries`).
  - Memória semântica por usuário (`memories`).
  - Métricas de execução e traces ordenados (`requests` e `trace_events`) com logs estruturados em linha única JSON (`src/obs/logger.ts`) correlacionados por `requestId` / header `X-Request-Id`.
- **Console War Room (`web/`)**: aplicação Vite + React + TypeScript (`base: "/opspilot/"`) com visualização tipada de raciocínio (**"Ver raciocínio"**), cartões interativos de aprovação para respostas HTTP `202` (**Aprovar / Negar**), barra de telemetria `/stats?since=24h` e configuração em runtime da URL da API via ícone de engrenagem (`⚙`).

---

## Pré-requisitos & Variáveis de Ambiente

- **Node.js 22 LTS** e **npm**

Configure suas variáveis em `.env` localmente (nunca versione `.env`):

| Variável | Descrição | Exemplo / Padrão |
|---|---|---|
| `OPENROUTER_API_KEY` | Chave da API OpenRouter para os modelos LLM | `sk-or-v1-sua-chave-aqui` |
| `OPENROUTER_MODEL` | Modelo principal usado nos nós do grafo | `anthropic/claude-3.5-sonnet` |
| `OPENROUTER_MODEL_FALLBACK` | Lista separada por vírgula de modelos de contingência | `openai/gpt-4o-mini,meta-llama/llama-3.3-70b-instruct:free` |
| `OPSPILOT_DB` | Caminho do arquivo SQLite (`:memory:` nos testes) | `./data/opspilot.db` |
| `PORT` | Porta HTTP da API Express | `3000` |

---

## Comandos

### Backend, Arena & MCP (raiz)

```bash
npm install
npm run seed       # Popula dados iniciais operacionais
npm run dev        # Sobe a API HTTP Express em http://localhost:3000
npm run typecheck  # Valida TypeScript strict: true (tsc --noEmit)
npm test           # Executa suítes node:test via tsx e testes MCP
npm run mcp        # Executa o servidor MCP via stdio
npm run arena      # Executa avaliação comparativa de estratégias
npm run bench      # Executa suíte de benchmark
```

### War Room Web (`web/`)

```bash
npm --prefix web install
npm --prefix web run dev        # Servidor Vite em http://localhost:5173/opspilot/
npm --prefix web run typecheck  # Validação estrita TypeScript de web/
npm --prefix web run build      # Gera bundle estático em web/dist (/opspilot/)
node --import tsx --test "web/src/**/*.test.ts"  # Testes unitários puros do frontend
```

---

## Principais Endpoints HTTP

- `POST /chat`: envia mensagem operacional (suporta `strategy`, `conversationId`, `userId`, `requireApproval` retornando **HTTP 202** `pending_approval`, e envio de `decision: "approve" | "reject"`). Retorna e aceita o header `X-Request-Id`.
- `GET /requests/:id`: consulta registro completo da requisição e sequência ordenada de `trace_events`.
- `GET /stats?since=24h`: métricas agregadas (total, erros, custo com `:free = 0`, `p50`/`p95`, breakdown por rota e modelo).
- `/memories`: endpoints REST para gerenciar fatos de memória semântica (`POST /memories`, `GET /memories`, `GET /memories/recall`, `DELETE /memories/:id`).

---

## Deploy do `web/` no GitHub Pages (GitHub Actions)

O workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) automatiza a publicação do War Room (`web/dist`) no GitHub Pages com permissões mínimas (`contents: read`, `pages: write`, `id-token: write`) e controle de concorrência (`group: pages`):

1. **Build (`build`)**: executa `npm ci` e `npm run build` dentro de `web/` (que também valida `tsc --noEmit`) e envia `web/dist` via `actions/configure-pages` e `actions/upload-pages-artifact`.
2. **Deploy (`deploy`)**: publica o artefato no ambiente `github-pages` usando `actions/deploy-pages`, expondo a `page_url` publicada sob `/opspilot/`.

### Como ativar no repositório GitHub

1. Acesse **Settings → Pages → Build and deployment** no repositório.
2. Em **Source**, selecione **GitHub Actions**.
3. Faça push na branch `main` (ou dispare manualmente via **Actions → Deploy War Room to GitHub Pages → Run workflow**).
4. Ao abrir o War Room publicado em `https://<usuario>.github.io/opspilot/`, clique no ícone de **engrenagem (`⚙`)** no cabeçalho para apontar a interface estática para a URL do seu servidor OpsPilot (já preparado com suporte a CORS e exposição de `X-Request-Id`).
