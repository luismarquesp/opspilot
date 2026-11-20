import { Router, type Request, type Response } from "express";
import type { IMemoryStore } from "../models/memory.js";
import { getDefaultMemoryStore } from "../memory/memory-store.js";
import {
  CreateMemorySchema,
  ListMemoriesQuerySchema,
  DeleteMemoryParamsSchema,
  DeleteMemoryQuerySchema,
  RecallMemoriesQuerySchema,
} from "./schemas.js";

export function createMemoryRouter(memoryStore: IMemoryStore = getDefaultMemoryStore()): Router {
  const router = Router();

  // POST /memories
  router.post("/", async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateMemorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation_error",
        issues: parsed.error.issues,
      });
      return;
    }

    const { userId, fact } = parsed.data;
    try {
      const result = await memoryStore.remember(userId, fact);
      if (result.stored) {
        res.status(201).json({
          id: result.id,
          userId,
          fact,
          stored: true,
          similarity: result.similarity,
        });
      } else {
        res.status(200).json({
          id: result.id,
          userId,
          fact,
          stored: false,
          similarity: result.similarity,
        });
      }
    } catch (err) {
      console.error("[OpsPilot] Memory store remember error:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // GET /memories/recall
  router.get("/recall", async (req: Request, res: Response): Promise<void> => {
    const parsed = RecallMemoriesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation_error",
        issues: parsed.error.issues,
      });
      return;
    }

    const { userId, q, limit } = parsed.data;
    try {
      const matches = await memoryStore.recall(userId, q, limit);
      res.status(200).json(matches);
    } catch (err) {
      console.error("[OpsPilot] Memory recall error:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // GET /memories
  router.get("/", async (req: Request, res: Response): Promise<void> => {
    const parsed = ListMemoriesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation_error",
        issues: parsed.error.issues,
      });
      return;
    }

    const { userId } = parsed.data;
    try {
      const memories = await memoryStore.list(userId);
      res.status(200).json(memories);
    } catch (err) {
      console.error("[OpsPilot] Memory list error:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // DELETE /memories/:id
  router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
    const parsedParams = DeleteMemoryParamsSchema.safeParse(req.params);
    const parsedQuery = DeleteMemoryQuerySchema.safeParse(req.query);

    if (!parsedParams.success) {
      res.status(400).json({
        error: "validation_error",
        issues: parsedParams.error.issues,
      });
      return;
    }

    if (!parsedQuery.success) {
      res.status(400).json({
        error: "validation_error",
        issues: parsedQuery.error.issues,
      });
      return;
    }

    const { id } = parsedParams.data;
    const { userId } = parsedQuery.data;

    try {
      const deleted = await memoryStore.forget(userId, id);
      if (!deleted) {
        res.status(404).json({ error: "memory_not_found" });
        return;
      }
      res.status(200).json({ deleted: true, id, userId });
    } catch (err) {
      console.error("[OpsPilot] Memory forget error:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
