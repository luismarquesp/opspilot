# Feature Specification: Learning Reflector & Memory Distillation

**Feature Branch**: `009-learning-reflector`  
**Created**: 2026-09-30  
**Status**: Draft  
**Input**: User description: "Refletor de aprendizado Após cada resposta, um withStruturedOutput({hasLearning, fact}), lê a última mensagem do usuário e destila fatos duráveis (nunca pedido pontual, nunca segredo) -> memories.remember assíncrono; tool forget_preference"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Autonomous Operational Fact Distillation (Priority: P1) 🎯 MVP

As an on-call engineer interacting with OpsPilot, I want the assistant to automatically learn durable operational preferences and responsibilities from our conversations in the background, so that I do not need to manually configure or repeat my context in future troubleshooting sessions.

**Why this priority**: Core value of an autonomous copilot — learning from operator behavior continuously and passively without requiring explicit manual registration of facts.

**Independent Test**:
Submit a chat message declaring a durable fact (e.g., "Sou responsável pelo cluster de banco de dados e pela payment-api"). Receive the assistant's response. Verify asynchronously that a durable fact was extracted and stored in `MemoryStore` under the user's ID, while the chat response itself returned without waiting for embedding generation.

**Acceptance Scenarios**:
1. **Given** a chat interaction where the user states an operational preference or role, **When** the assistant completes its response, **Then** the learning reflector distills a durable fact and triggers `memories.remember(userId, fact)` asynchronously.
2. **Given** an ephemeral or command-only request (e.g., "Liste todos os alertas firing" or "Abra um incidente para checkout"), **When** the learning reflector runs, **Then** it evaluates `hasLearning: false` and saves no memory.
3. **Given** a prompt containing sensitive credentials (e.g., API keys, passwords, tokens), **When** evaluated, **Then** the reflector rejects distilling the credential and preserves confidentiality.

---

### User Story 2 - Agent Tool for Forgetting Preferences (Priority: P2)

As an on-call engineer, I want to instruct OpsPilot in natural language to forget or discard an obsolete operational preference, so that outdated memories can be cleanly purged during conversation.

**Why this priority**: Operators need control to revoke or update preferences when service ownership changes or when a past distilled fact is no longer accurate.

**Independent Test**:
Store a preference for a user. In a conversation, instruct the agent: "Esqueça que eu cuido do serviço de pagamentos". Verify the agent invokes `forget_preference` and subsequent queries no longer recall that fact.

**Acceptance Scenarios**:
1. **Given** a stored user preference, **When** the user asks the agent to forget or stop assuming that preference, **Then** the agent calls the `forget_preference` tool.
2. **Given** a call to `forget_preference`, **When** the fact is identified and removed, **Then** the tool returns a confirmation message indicating success.
3. **Given** a request to forget a preference that does not exist, **When** executed, **Then** the tool handles it gracefully and informs that no matching preference was found.

---

### User Story 3 - Asynchronous & Non-Blocking Reflection Execution (Priority: P3)

As an on-call engineer, I want learning reflection to execute in the background without increasing the latency of my chat responses, so that conversational responsiveness remains fast.

**Why this priority**: Reflection involves a secondary model evaluation and local embedding generation. Running it asynchronously guarantees zero impact on user-perceived response time.

**Independent Test**:
Measure `latencyMs` of `POST /chat` with reflection enabled. Verify that the HTTP response is sent immediately after the primary strategy finishes, while the reflection model invocation and `remember` finish in the background.

**Acceptance Scenarios**:
1. **Given** an active chat request, **When** the primary answer is ready, **Then** the HTTP 200 response is dispatched to the client immediately.
2. **Given** background reflection execution, **When** reflection succeeds or fails, **Then** errors are safely caught and logged without affecting the completed HTTP request.

---

### Edge Cases

- **Anonymous Chats (No `userId`)**: When `/chat` is called without `userId`, the learning reflector skips execution because memories cannot be anchored to a specific user.
- **Ambiguous or Short Input**: Messages like "ok", "obrigado", or "entendi" are evaluated as `hasLearning: false`.
- **Contradictory Preferences**: When an operator updates a preference (e.g., "Agora mudei de time, não cuido mais de pagamentos"), the reflector captures the new reality while `forget_preference` allows removing the obsolete premise.
- **Model Failure during Reflection**: If the structured output model call times out or throws an error, the error is swallowed with a warning log and the main application continues uninterrupted.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST implement a `LearningReflector` that receives user message, assistant answer, and `userId`.
- **FR-002**: `LearningReflector` MUST call the language model using `withStructuredOutput` conforming to the schema `{ hasLearning: boolean, fact?: string }`.
- **FR-003**: The reflection prompt MUST instruct the model to distill ONLY durable operational facts (e.g. service ownership, tooling preferences, architectural roles) and STRICTLY REJECT ephemeral instructions, one-off action commands, and secrets/passwords/tokens.
- **FR-004**: When `hasLearning: true` and `fact` is non-empty, the system MUST asynchronously invoke `memoryStore.remember(userId, fact)`.
- **FR-005**: Background reflection MUST NOT block or delay the HTTP response of `POST /chat`.
- **FR-006**: System MUST expose a tool `forget_preference` to agent reasoning strategies (`react` and `plan-and-execute`).
- **FR-007**: `forget_preference` tool MUST accept an argument identifying the preference (by semantic search query or memory ID), delete matching memories for that `userId`, and return an operational status.
- **FR-008**: When `userId` is omitted in `/chat`, learning reflection MUST be skipped.

---

### Key Entities

- **LearningExtraction**:
  - `hasLearning`: Boolean indicating whether a durable operational fact was identified.
  - `fact`: Short, clear statement in natural language describing the durable fact (omitted if `hasLearning: false`).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of ephemeral commands (e.g., "abra um incidente", "liste alertas", "resolva o inc-101") yield `hasLearning: false` with zero spurious memories persisted.
- **SC-002**: 100% of credential leaks or secrets in user input are rejected by the reflector, ensuring zero credential storage.
- **SC-003**: Background reflection adds 0ms of blocking overhead to the HTTP response latency of `POST /chat`.
- **SC-004**: Operators can purge learned preferences via `forget_preference` in a single conversational turn.
- **SC-005**: All existing `/chat` and `memory` test suites continue to pass with 0 regressions.

---

## Assumptions

- Background execution uses Node.js asynchronous unawaited promises (`void runReflection().catch(...)`) or queue-like microtasks safe within a single-process server.
- The model used for structured reflection output can be the primary model or a fast lightweight model instance via `createModel()`.
- The `forget_preference` tool leverages `memoryStore.recall()` to resolve natural language preference queries to target memory IDs when an explicit numeric ID is not supplied by the user.
