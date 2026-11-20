import { Router, type Request, type Response } from "express";
import type { IRequestTraceStore } from "../models/request-trace.js";
import { getDefaultRequestTraceStore } from "../store/request-trace-store.js";
import { GetRequestParamsSchema, RequestTraceResponseSchema } from "./schemas.js";

export function createRequestsRouter(
  requestTraceStore: IRequestTraceStore = getDefaultRequestTraceStore()
): Router {
  const router = Router();

  // GET /requests/:id
  router.get("/:id", (req: Request, res: Response): void => {
    const parsedParams = GetRequestParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        error: "validation_error",
        issues: parsedParams.error.issues,
      });
      return;
    }

    const { id } = parsedParams.data;

    try {
      const record = requestTraceStore.getRequestWithTrace(id);
      if (!record) {
        res.status(404).json({
          error: "request_not_found",
          requestId: id,
        });
        return;
      }

      const validated = RequestTraceResponseSchema.parse(record);
      res.status(200).json(validated);
    } catch (err) {
      console.error("[OpsPilot] Request trace lookup error:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
