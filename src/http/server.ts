import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createChatHandler, type ChatControllerOptions } from "./chat.controller.js";
import { createMemoryRouter } from "./memory.controller.js";
import { createRequestsRouter } from "./requests.controller.js";
import { createStatsRouter } from "./stats.controller.js";
import { getDefaultRequestTraceStore } from "../store/request-trace-store.js";

export type AppOptions = ChatControllerOptions;

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const requestTraceStore = options.requestTraceStore ?? getDefaultRequestTraceStore();

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestOrigin =
      typeof req.headers.origin === "string" && req.headers.origin.length > 0
        ? req.headers.origin
        : "*";

    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    if (requestOrigin !== "*") {
      res.setHeader("Vary", "Origin");
    }
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Request-Id"
    );
    res.setHeader("Access-Control-Expose-Headers", "X-Request-Id");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json());

  app.post("/chat", createChatHandler({ ...options, requestTraceStore }));
  app.use("/memories", createMemoryRouter(options.memoryStore));
  app.use("/requests", createRequestsRouter(requestTraceStore));
  app.use("/stats", createStatsRouter(requestTraceStore));

  // Global error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && "status" in err && (err as { status?: number }).status === 400) {
      res.status(400).json({
        error: "validation_error",
        issues: [{ path: ["body"], message: "Invalid JSON format" }],
      });
      return;
    }
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

export const app: Express = createApp();
export default app;
