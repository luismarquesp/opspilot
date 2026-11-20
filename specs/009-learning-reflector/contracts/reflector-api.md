# API Contracts: Learning Reflector & Forget Preference Tool

**Feature**: `009-learning-reflector` | **Date**: 2026-09-30

---

## 1. Tool Contract: `forget_preference`

### Tool Definition
- **Tool Name**: `forget_preference`
- **Description**: "Remove uma preferência ou fato operacional previamente aprendido para o usuário atual."
- **Parameters**:
  - `queryOrId` (string, required): A natural language description of the preference to forget (e.g. "auth-service" or "pagamentos") or an integer ID.
  - `userId` (string, optional): Target user identifier.

### Execution Output
- **Success (found & deleted)**:
  `"Preferência esquecida com sucesso: '<recalled fact>'"`
- **Not found**:
  `"Nenhuma preferência correspondente encontrada para '<queryOrId>'."`

---

## 2. Reflector Service Contract

### `src/memory/reflector.ts`

```typescript
export class LearningReflector implements ILearningReflector {
  constructor(model?: BaseChatModel);

  reflect(input: {
    userMessage: string;
    assistantAnswer: string;
    userId: string;
    memoryStore: IMemoryStore;
  }): Promise<LearningExtraction>;
}

export const defaultLearningReflector: ILearningReflector;
```
