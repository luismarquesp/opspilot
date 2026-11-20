# Research: Learning Reflector & Memory Distillation

**Feature**: `009-learning-reflector` | **Date**: 2026-09-30

---

## 1. Structured Output Distillation Pattern

### Decision
Use `createModel().withStructuredOutput(LearningExtractionSchema)` to evaluate user messages and extract durable operational facts.

```typescript
export const LearningExtractionSchema = z.object({
  hasLearning: z.boolean().describe("true se houver fato duradouro; false para pedidos pontuais ou efêmeros"),
  fact: z.string().optional().describe("Fato operacional conciso a ser persistido"),
});
```

### Rationale
- `withStructuredOutput` enforces JSON-schema validation directly through the LLM provider, guaranteeing a strictly typed `{ hasLearning: boolean, fact?: string }` object without regex parsing or fragile extraction.
- Clear binary classification: `hasLearning` acts as a deterministic gate before any embedding or database operation is triggered.

### Alternatives Considered
- **Regex or rule-based pattern matching**: Fails on natural language variations, implicit statements, or conversational idioms.
- **Unstructured text prompt**: Requires parsing free-form LLM output and risks generating malformed memories or conversational filler.

---

## 2. Asynchronous Fire-and-Forget Execution

### Decision
Execute reflection in `createChatHandler()` asynchronously via unawaited promise with error catching:
```typescript
if (userId) {
  void reflector.reflect({ userMessage: message, assistantAnswer: result.answer, userId, memoryStore })
    .catch((err) => console.error("[OpsPilot] Background reflection failed:", err));
}
```

### Rationale
- Calling an LLM with structured output takes 500ms–2000ms. If executed synchronously inside the HTTP handler, response latency would double.
- Running it as a detached asynchronous task ensures 0ms blocking overhead on the `/chat` endpoint.
- Since learning distillation is an asynchronous background process, failure does not compromise the current conversational interaction.

### Alternatives Considered
- **Worker threads or external message queue (Bull/Redis)**: Overkill for single-process Node 22 on-call copilot; introduces unnecessary operational infrastructure.
- **Synchronous execution before sending HTTP response**: Degrades user experience by delaying answers.

---

## 3. Negative Constraint Filtering (Punctual Requests & Secrets)

### Decision
Instruct the distillation prompt with strict negative constraints:
1. **Never extract punctual commands or one-off actions** (e.g. "abra um incidente para auth", "liste alertas", "resolva o inc-101").
2. **Never extract secrets or credentials** (passwords, API keys, bearer tokens, connection strings).
3. **Only extract durable operational facts** (service ownership, role, on-call preferences).

### Rationale
- Operational copilots process many impermanent commands every minute. Persisting every command as a "fact" would poison the semantic memory store with low-signal noise.
- Confidentiality is a core principle: credentials must never be written to SQLite `memories`.

---

## 4. `forget_preference` Tool Design

### Decision
Create a tool `forget_preference` registered in `opsTools` for agent reasoning strategies (`react` and `plan-and-execute`):
- Arguments: `queryOrId: string` and optional `userId?: string`.
- Logic:
  - If `queryOrId` matches numeric ID, call `memoryStore.forget(userId, Number(queryOrId))`.
  - Otherwise, call `memoryStore.recall(userId, queryOrId, 1, 0.3)`. If a match is found, delete via `memoryStore.forget(userId, match[0].id)`.
  - Return status string indicating whether the preference was forgotten or not found.

### Rationale
- Operators express preferences in natural language ("Não cuido mais do serviço de pagamentos"). Enabling semantic matching in `forget_preference` allows the agent to find and delete the right memory without requiring the user to know internal database row IDs.
