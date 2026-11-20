# Data Model: Learning Reflector & Memory Distillation

**Feature**: `009-learning-reflector` | **Date**: 2026-09-30

---

## 1. Structured Output Entities

### Schema: `LearningExtractionSchema`

```typescript
// src/memory/reflector.ts

export const LearningExtractionSchema = z.object({
  hasLearning: z.boolean().describe(
    "true se a mensagem declarar fato ou preferência operacional duradoura; false para ações efêmeras, dúvidas pontuais ou saudações"
  ),
  fact: z.string().optional().describe(
    "Fato operacional duradouro em terceira pessoa (ex: 'O usuário é responsável pelo auth-service'). Omitido se hasLearning for false."
  ),
});

export type LearningExtraction = z.infer<typeof LearningExtractionSchema>;
```

### Tool Schema: `ForgetPreferenceSchema`

```typescript
// src/agents/tools.ts

export const ForgetPreferenceSchema = z.object({
  queryOrId: z.string().describe("Descrição em texto da preferência a ser esquecida ou seu ID numérico"),
  userId: z.string().optional().describe("Identificador do usuário (opcional se fornecido no contexto)"),
});

export type ForgetPreferenceInput = z.infer<typeof ForgetPreferenceSchema>;
```

---

## 2. Reflector Service Interface

```typescript
export interface ReflectionInput {
  userMessage: string;
  assistantAnswer: string;
  userId: string;
  memoryStore: IMemoryStore;
}

export interface ILearningReflector {
  /**
   * Evaluates interaction and distills durable fact asynchronously.
   * If hasLearning: true, calls memoryStore.remember(userId, fact).
   */
  reflect(input: ReflectionInput): Promise<LearningExtraction>;
}
```

---

## 3. Sequence Flow: Background Reflection

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Controller as ChatController
    participant Strategy as AgentStrategy
    participant Reflector as LearningReflector
    participant MemoryStore as SqliteMemoryStore

    Client->>Controller: POST /chat { userId: "luis", message: "Cuido do auth-service" }
    Controller->>Strategy: run(message, options)
    Strategy-->>Controller: result { answer: "Entendido, registrei que você cuida do auth-service." }
    
    Note over Controller,Client: 1. Send HTTP Response immediately (0ms delay)
    Controller-->>Client: 200 OK { conversationId, answer, ... }

    Note over Controller,Reflector: 2. Fire-and-forget background reflection
    Controller-)Reflector: reflect({ userMessage, assistantAnswer, userId, memoryStore })
    Reflector->>Reflector: model.withStructuredOutput(LearningExtractionSchema)
    Reflector-->>Reflector: { hasLearning: true, fact: "O usuário é responsável pelo auth-service" }
    Reflector->>MemoryStore: remember("luis", "O usuário é responsável pelo auth-service")
    MemoryStore-->>Reflector: { stored: true, id: 42 }
```
