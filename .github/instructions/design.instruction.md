---
applyTo: "web/**"
---

# Diretrizes de Design UI/UX — OpsPilot (`web/**`)

Estas instruções governam qualquer interface web construída sob `web/**` para o **OpsPilot** (console de plantão, chat operacional `/chat`, histórico de traces `/requests/:id` e painel de métricas `/stats`).

---

## 1. Hierarquia Visual e Tipográfica

- **Prioridade Operacional de Plantão**: A leitura visual deve destacar primeiro o que exige ação imediata:
  1. **Alertas e Incidentes Críticos (`critical` / `sev1` / erros `5xx`)** — maior contraste, destaque semântico no topo da viewport.
  2. **Degradações (`warning` / `sev2` / fallbacks de modelo)** — destaque secundário com badge explícito.
  3. **Informações e Estados Saudáveis (`info` / `healthy` / `ok`)** — baixo ruído visual para não competir com anomalias.
- **Escala Tipográfica Modular (`rem`)**:
  - `h1` (Título de página): `1.75rem` (`28px`), peso `700`, `line-height: 1.25`, `letter-spacing: -0.02em`.
  - `h2` (Seções / Painéis): `1.25rem` (`20px`), peso `600`, `line-height: 1.3`.
  - `h3` (Subtítulos / Cards): `1rem` (`16px`), peso `600`, `line-height: 1.4`.
  - Corpo padrão: `0.875rem`–`1rem` (`14px`–`16px`), `line-height: 1.5`.
  - Metadados e legendas: `0.75rem` (`12px`), `line-height: 1.4`.
- **Tipografia Monospace Obrigatória para Telemetria**: Identificadores (`requestId`, `conversationId`, `inc-*`), nomes de nós (`router`, `react`, `plan-and-execute`, `reflection`, `response`), latências (`p50`/`p95`), tokens, custos e payloads de tool calls devem usar fonte monospace com `font-variant-numeric: tabular-nums` para alinhamento vertical em tabelas e gráficos.
- **Divulgação Progressiva (*Progressive Disclosure*)**: Exibir primeiro o resumo executivo (KPIs de `/stats` e resposta consolidada do `/chat`) e manter traces passo a passo (`/requests/:id`, eventos `thought`, `action`, `observation`, `fallback`) em painéis expansíveis/colapsáveis por padrão.

---

## 2. Espaçamento em Escala

- **Base Rígida de `4px` (`0.25rem`)**: Todo `padding`, `margin` e `gap` deve derivar exclusivamente da escala abaixo via CSS Custom Properties. **Valores arbitrários (ex.: `13px`, `18px`, `27px`) são proibidos.**
  - `--space-1`: `0.25rem` (`4px`) — micro-espaçamento entre ícone e rótulo ou badges.
  - `--space-2`: `0.5rem` (`8px`) — espaçamento interno compacto entre elementos irmãos.
  - `--space-3`: `0.75rem` (`12px`) — padding de células em tabelas de logs/traces e inputs compactos.
  - `--space-4`: `1rem` (`16px`) — padding padrão de cards, alertas e gap entre itens de formulário.
  - `--space-6`: `1.5rem` (`24px`) — separação entre blocos de conteúdo e cards em grid.
  - `--space-8`: `2rem` (`32px`) — espaçamento entre seções principais da página.
  - `--space-12`: `3rem` (`48px`) — respiro de cabeçalhos ou empty states centralizados.
  - `--space-16`: `4rem` (`64px`) — margens macro de layout.
- **Densidade Consistente**:
  - Tabelas operacionais (alertas, `/requests/:id`, breakdown por rota/modelo) utilizam densidade compacta (`--space-2` / `--space-3`).
  - Cartões de resumo e área de conversa `/chat` utilizam densidade confortável (`--space-4` / `--space-6`) para facilitar leitura rápida sob estresse de plantão.

---

## 3. Estados Vazios e de Erro

### Estados Vazios (*Empty States*)
- Nunca renderizar telas em branco, containers vazios ou strings cruas como `[]`, `null` ou `{}`.
- Todo estado vazio (lista de alertas vazia, janela `/stats?since=24h` sem registros, nova conversa no `/chat`, nenhuma memória em `/memories`) deve apresentar:
  1. Ícone ilustrativo discreto (`aria-hidden="true"`).
  2. Título objetivo explicando a ausência de dados (ex.: *"Nenhum alerta ativo no momento"* ou *"Nenhuma requisição registrada nas últimas 24h"*).
  3. Subtítulo orientando o próximo passo.
  4. Ação primária clara (CTA), quando aplicável (ex.: ampliar janela para `7d`, iniciar nova consulta no `/chat`, limpar filtros).

### Estados de Erro (*Error States*)
- Erros nunca devem falhar silenciosamente nem expor stack traces internos na UI. Mapear explicitamente as respostas da API OpsPilot:
  - **Validação (`400 validation_error` / `422 unknown_strategy`)**: Exibir feedback inline junto ao campo inválido (`aria-invalid="true"` + `aria-describedby`), preservando o texto digitado pelo operador.
  - **Não Encontrado (`404 request_not_found` / `memory_not_found`)**: Exibir estado amigável informando o ID consultado e botão para voltar à listagem ou iniciar nova busca.
  - **Indisponibilidade / Timeout (`503 model_unavailable`, `504 gateway_timeout`, `500 internal_error`)**: Exibir banner de alerta (`role="alert"`) com:
    - Causa legível para humanos (ex.: *"Todos os modelos configurados estão indisponíveis no momento"* ou *"A execução excedeu o tempo limite"*).
    - Exibição do `requestId` / header `X-Request-Id` em monospace com botão de copiar para correlação imediata em logs.
    - Botão explícito de **Tentar novamente** sem perder o prompt ou estado anterior.

---

## 4. Dark Mode

- **Suporte Nativo Dark-First**: Operadores de plantão trabalham frequentemente em ambientes com baixa luminosidade. A interface deve suportar `prefers-color-scheme: dark` e alternância explícita via atributo `[data-theme="dark"]` / `[data-theme="light"]`.
- **Tokens Semânticos Obrigatórios** (proibido usar hexadecimais hardcoded diretamente em componentes):
  - Superfícies em camadas (evitar `#000000` puro e `#FFFFFF` puro para reduzir halation/fadiga ocular):
    - `--bg-canvas`: `#0B0F17` (dark) / `#F8FAFC` (light)
    - `--bg-surface`: `#111827` (dark) / `#FFFFFF` (light)
    - `--bg-elevated`: `#1E293B` (dark) / `#F1F5F9` (light)
  - Texto:
    - `--text-primary`: `#F1F5F9` (dark) / `#0F172A` (light)
    - `--text-secondary`: `#94A3B8` (dark) / `#475569` (light)
  - Bordas e divisores:
    - `--border-subtle`: `#1F2937` (dark) / `#E2E8F0` (light)
  - Semântica calibrada para ambos os temas (sem neon estourado no escuro):
    - `--status-critical`, `--status-warning`, `--status-success`, `--status-info` ajustados por tema mantendo legibilidade de texto sobre fundo translúcido ou sólido.
- **Elevação no Dark Mode**: Utilizar diferenciação tonal de superfície (`--bg-elevated`) e bordas sutis (`1px solid var(--border-subtle)`) em vez de sombras escuras pesadas.

---

## 5. Acessibilidade (WCAG 2.1 AA)

- **Contraste Mínimo**:
  - Texto normal (`< 18px` regular ou `< 14px` bold): razão mínima de **4.5:1**.
  - Texto grande, ícones funcionais, bordas de input e indicadores de foco: razão mínima de **3:1**.
- **Independência de Cor**: Nunca comunicar severidade, status ou estratégia apenas pela cor. Sempre combinar **cor + ícone + rótulo textual** (ex.: badge `[CRÍTICO]`, `[FALLBACK]`, `status: ok`, `status: error`).
- **HTML Semântico e Navegação por Teclado**:
  - Usar landmarks (`<header>`, `<nav>`, `<main>`, `<aside>`), `<button>` nativos para ações e `<a>` para navegação (nunca `<div>` clicável sem papel semântico e suporte a `Enter`/`Space`).
  - Todo elemento interativo deve possuir estado `:focus-visible` claramente visível (`outline: 2px solid var(--focus-ring); outline-offset: 2px`).
  - Ordem de `Tab` lógica acompanhando o fluxo visual; modais/drawers de inspeção de trace devem aprisionar foco (*focus trap*) e fechar com `Escape`.
- **Regiões Dinâmicas (`ARIA Live`)**:
  - Respostas assíncronas do `/chat` e atualizações de `/stats` devem anunciar mudanças em regiões `aria-live="polite"`.
  - Alertas críticos e falhas (`503`/`504`/`500`) devem usar `role="alert"` (`aria-live="assertive"`).
  - Controles somente-ícone (ex.: copiar `requestId`, alternar tema, expandir trace) devem possuir `aria-label` descritivo.
- **Redução de Movimento**: Respeitar `@media (prefers-reduced-motion: reduce)`, desabilitando animações de transição, pulses e skeletons animados quando ativado.
