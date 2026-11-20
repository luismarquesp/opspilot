// ---------------------------------------------------------------------------
// Conversation domain types & interface
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  id: number;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export interface ConversationSummary {
  conversationId: string;
  summary: string;
  lastSummarizedMessageId: number;
  updatedAt: Date;
}

export interface IConversationStore {
  /** Generate a new unique conversation identifier. */
  create(): string;

  /** Persist a single message under the given conversation. */
  append(conversationId: string, role: "user" | "assistant", content: string): void;

  /**
   * Retrieve up to `limit` most recent messages for a conversation,
   * sorted chronologically from oldest to newest.
   * @default limit 12
   */
  lastMessages(conversationId: string, limit?: number): ConversationMessage[];

  /**
   * Retrieves the current rolling summary for a conversation, or null if none exists.
   */
  getSummary(conversationId: string): ConversationSummary | null;

  /**
   * Upserts the rolling summary for a conversation and advances lastSummarizedMessageId.
   */
  setSummary(conversationId: string, summary: string, lastSummarizedMessageId: number): void;

  /**
   * Returns messages that have fallen out of the active window of `windowSize` (default 8)
   * and have not yet been summarized (id > lastSummarizedMessageId and id < windowCutoffId).
   */
  getEvictedUnsummarizedMessages(conversationId: string, windowSize?: number): ConversationMessage[];
}

