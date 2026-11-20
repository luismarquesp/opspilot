# Data Model: Persistent Conversation Store

**Feature**: 007-persistent-conversation | **Date**: 2026-09-29

---

## Entities

### ConversationMessage

Represents a single dialogue turn within a conversation session.

| Field            | Type      | Constraints                                    | Description                                           |
|------------------|-----------|------------------------------------------------|-------------------------------------------------------|
| `id`             | integer   | PRIMARY KEY, auto-increment                    | Monotonically increasing row identifier               |
| `conversationId` | string    | NOT NULL, indexed                              | Groups messages into a logical conversation session   |
| `role`           | string    | NOT NULL, CHECK(`role IN ('user','assistant')`) | Origin of the message                                 |
| `content`        | string    | NOT NULL                                       | Text content of the message                           |
| `createdAt`      | Date      | NOT NULL, DEFAULT `datetime('now')`            | Timestamp when the message was recorded               |

**Domain record** (TypeScript):

```typescript
export interface ConversationMessage {
  id: number;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}
```

### IConversationStore (Interface)

Persistence interface managing conversation lifecycle and message retrieval.

```typescript
export interface IConversationStore {
  /** Generate a new unique conversation identifier. */
  create(): string;

  /** Persist a single message. */
  append(conversationId: string, role: "user" | "assistant", content: string): void;

  /** Retrieve up to `limit` most recent messages, sorted oldest → newest. Default limit: 12. */
  lastMessages(conversationId: string, limit?: number): ConversationMessage[];
}
```

---

## SQLite DDL

```sql
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT    NOT NULL,
  role            TEXT    NOT NULL CHECK(role IN ('user','assistant')),
  content         TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, id);
```

**Design notes**:

- `INTEGER PRIMARY KEY AUTOINCREMENT` provides strict monotonic ordering — `ORDER BY id` is equivalent to chronological order within a single-process `DatabaseSync`.
- The composite index `(conversation_id, id)` optimally serves the `lastMessages` query: filter by conversation, order by id, limit N.
- `CHECK(role IN ('user','assistant'))` mirrors the constraint pattern used in `SqliteOpsStore` for severity/status fields.
- `created_at` defaults to `datetime('now')` for auditability but ordering relies on `id`.

---

## Key Queries (Prepared Statements)

### append

```sql
INSERT INTO messages (conversation_id, role, content, created_at)
VALUES (?, ?, ?, ?)
```

### lastMessages

```sql
SELECT * FROM (
  SELECT * FROM messages
  WHERE conversation_id = ?
  ORDER BY id DESC
  LIMIT ?
) sub
ORDER BY id ASC
```

**Rationale**: The subquery selects the N most recent rows (DESC), then the outer query flips them to chronological order (ASC) for prompt composition. This is the standard "last N in order" SQL pattern.

---

## Extended Domain Types (Modifications)

### StrategyMetrics (extended)

```typescript
// In src/agents/types.ts — extend existing StrategyMetricsSchema
export const StrategyMetricsSchema = z.object({
  llmCalls: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  historyMessages: z.number().int().nonnegative().optional(),
});
```

### ChatRequest (extended)

```typescript
// In src/http/schemas.ts — extend existing ChatRequestSchema
export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1),
  strategy: z.string().optional(),
  reflect: z.boolean().optional(),
  conversationId: z.string().optional(),
});
```

### ChatResponse (extended)

The `ChatResponseSchema` already mirrors `StrategyResultSchema`. With `historyMessages` in metrics and `conversationId` added at the response level:

```typescript
export const ChatResponseSchema = StrategyResultSchema.extend({
  conversationId: z.string(),
});
```

---

## Relationships

```text
Conversation (logical, identified by conversationId)
  └── has many → ConversationMessage (via conversation_id FK)

ChatRequest ── optionally carries ──→ conversationId
ChatResponse ── always returns ──→ conversationId + metrics.historyMessages
```

---

## State Transitions

Conversations have no explicit lifecycle states. A conversation exists implicitly the moment a message is appended with its `conversationId`. Messages are append-only — no updates or deletes are part of the interface.
