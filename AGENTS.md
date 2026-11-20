# OpsPilot

OpsPilot, copiloto de plantão que gerencia alertas e incidentes de produção.
A API é um agente LangChain/LangGraph sobre OpenRouter.

## Stack
- Node.js 22 LTS
- TypeScript ESM, strict: true
- zod na fronteira (HTTP/CLI) para validar entrada e saída
- Testes: node:test via tsx
- Express com SQLite via node:sqlite (DatabaseSync); path em OPSPILOT_DB (default ./data/opspilot.db); ":memory:" nos testes

## Comandos
- `npm run dev`: `tsx src/index.ts`
- `npm run arena`: `tsx src/arena.ts`
- `npm run bench`: `tsx src/bench.ts`
- `npm test`: `node --import tsx --test "src/**/*.test.ts"`
- `npm run typecheck`: `tsc --noEmit`

## Convenções
- Camadas padrão MVC (Model, Service, Controller)
- Toda entrada externa é validada com zod
- Erros de domínio são classes traduzidas na borda.
- Lógica nova nasce com teste.
- `npm run typecheck` e `npm test` sempre verdes
- Nunca commitar e nunca ler `.env`
- Sempre utilize funções puras

## Fluxo
- Seguir o fluxo do Spec Kit: `/speckit.specify` -> `plan` -> `task` -> `implement`
- Specs devem ser versionadas.

