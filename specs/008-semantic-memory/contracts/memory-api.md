# API Contracts: Semantic Memory & Chat Integration

**Feature**: `008-semantic-memory` | **Date**: 2026-09-30

---

## 1. HTTP Endpoint: `POST /chat` (Extended)

### Request Schema

```typescript
export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1),
  strategy: z.string().optional(),
  reflect: z.boolean().optional(),
  conversationId: z.string().optional(),
  userId: z.string().trim().min(1).optional(),
});
```

### Request Example (with `userId`)

```json
{
  "userId": "luis-ops",
  "conversationId": "conv-munxmxsl-5bd8",
  "message": "Quais tarefas de banco devo priorizar hoje?"
}
```

### Response Schema

```typescript
export const ChatResponseSchema = StrategyResultSchema.extend({
  conversationId: z.string(),
  userId: z.string().optional(),
});
```

### Response Example

```json
{
  "conversationId": "conv-munxmxsl-5bd8",
  "userId": "luis-ops",
  "answer": "Com base na sua responsabilidade sobre bancos relacionais e PostgreSQL, você deve priorizar o incidente inc-101 no cluster de banco de dados.",
  "trace": [
    {
      "type": "thought",
      "content": "Consultando incidentes relacionados a PostgreSQL para luis-ops",
      "timestamp": 1790762308820
    },
    {
      "type": "answer",
      "content": "Com base na sua responsabilidade sobre bancos relacionais e PostgreSQL...",
      "timestamp": 1790762308822
    }
  ],
  "metrics": {
    "llmCalls": 1,
    "latencyMs": 1420,
    "historyMessages": 2
  }
}
```

---

## 2. In-Process Service Contracts

### `src/memory/embeddings.ts`

```typescript
export interface EmbeddingService {
  embed(text: string): Promise<Float32Array>;
}

export function getEmbeddingPipeline(): Promise<EmbeddingService>;
```

### `src/memory/memory-store.ts`

```typescript
export class SqliteMemoryStore implements IMemoryStore {
  constructor(dbPath?: string);

  remember(userId: string, fact: string): Promise<RememberResult>;
  recall(userId: string, query: string, limit?: number, minScore?: number): Promise<RecalledMemory[]>;
  forget(userId: string, memoryId: number): Promise<boolean>;
  list(userId: string): Promise<Omit<MemoryRecord, "embedding">[]>;
  close(): void;
}
```
