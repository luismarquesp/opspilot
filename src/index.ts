export * from "./config/env.js";
export * from "./models/store.js";
export * from "./agents/types.js";
export * from "./agents/model.js";
export * from "./agents/tools.js";
export * from "./agents/trace.js";
export * from "./agents/react.js";
export * from "./agents/plan-and-execute.js";
export * from "./arena.js";

import { getEnv } from "./config/env.js";

async function main() {
  const env = getEnv();
  console.log(`[OpsPilot] Initialized in ${env.NODE_ENV} mode.`);
  console.log(`[OpsPilot] Run 'npm run arena' to compare reasoning strategies.`);
}

// Check if running as main entrypoint
const isMain = process.argv[1] && (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js"));
if (isMain) {
  main().catch((err) => {
    console.error("[OpsPilot] Startup error:", err);
    process.exit(1);
  });
}
