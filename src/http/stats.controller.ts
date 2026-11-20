import { Router, type Request, type Response } from "express";
import type { IRequestTraceStore } from "../models/request-trace.js";
import { getDefaultRequestTraceStore } from "../store/request-trace-store.js";
import { InvalidStatsWindowError } from "../obs/stats.js";
import { StatsQuerySchema, StatsResponseSchema } from "./schemas.js";

export function createStatsRouter(
  requestTraceStore: IRequestTraceStore = getDefaultRequestTraceStore()
): Router {
  const router = Router();

  // GET /stats?since=24h
  router.get("/", (req: Request, res: Response): void => {
    const parsedQuery = StatsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        error: "validation_error",
        issues: parsedQuery.error.issues,
      });
      return;
    }

    try {
      const stats = requestTraceStore.getStats(parsedQuery.data.since);
      const validated = StatsResponseSchema.parse(stats);
      res.status(200).json(validated);
    } catch (err) {
      if (err instanceof InvalidStatsWindowError) {
        res.status(400).json({
          error: "validation_error",
          issues: [{ path: ["since"], message: err.message }],
        });
        return;
      }
      console.error("[OpsPilot] Stats aggregation error:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
