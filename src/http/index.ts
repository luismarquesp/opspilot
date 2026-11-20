import { createApp } from "./server.js";
import { getEnv } from "../config/env.js";
import { SqliteConversationStore } from "../store/conversation-store.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";
import { SqliteRequestTraceStore } from "../store/request-trace-store.js";

const env = getEnv();
const conversationStore = new SqliteConversationStore();
const memoryStore = new SqliteMemoryStore();
const requestTraceStore = new SqliteRequestTraceStore();
const app = createApp({ conversationStore, memoryStore, requestTraceStore });

const server = app.listen(env.PORT, () => {
  console.log(`[OpsPilot] HTTP server listening on port ${env.PORT}`);
});

server.on("error", (err) => {
  console.error("[OpsPilot] HTTP server error:", err);
  process.exit(1);
});
