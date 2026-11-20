# Contract: Critique Evaluator Schema & Prompt

## 1. Zod Schema

```typescript
import { z } from "zod";

export const CritiqueVerdictSchema = z.object({
  approved: z
    .boolean()
    .describe("true se a resposta estiver completamente fundamentada nas observações das ferramentas; false se contiver alucinações, omissões críticas ou contradições"),
  feedback: z
    .string()
    .describe("Explicação concisa e objetiva da decisão do crítico, apontando discrepâncias ou aprovando a fundamentação"),
});

export type CritiqueVerdict = z.infer<typeof CritiqueVerdictSchema>;
```

## 2. System Prompt

```text
Você é o crítico de qualidade do OpsPilot, copiloto de plantão para resposta a incidentes de produção.
Sua responsabilidade é avaliar se a RESPOSTA PROPOSTA está estritamente fundamentada nas OBSERVAÇÕES REAIS obtidas pelas ferramentas no trace de execução.

Regras de Avaliação:
1. Verifique se alertas, serviços, status e severidades citados na resposta correspondem fielmente às observações.
2. Se a resposta citar números ou fatos não presentes nas observações, reprove (approved = false) e explique a alucinação.
3. Se a resposta omitir incidentes ou alertas críticos descobertos nas observações, reprove (approved = false) e aponte o que faltou.
4. Se a resposta for precisa, concisa e coerente com as observações, aprove (approved = true) e elogie a síntese.
```

## 3. Input Template

```text
[Solicitação do Operador]:
{input}

[Observações Obtidas pelas Ferramentas]:
{observations}

[Resposta Proposta]:
{proposedAnswer}
```
