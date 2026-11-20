import { z } from "zod";
import path from "node:path";

try {
  process.loadEnvFile?.();
} catch {
  // Ignora se o arquivo .env não existir
}

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-3.5-sonnet"),
  OPEN_ROUTER_MODEL: z.string().optional(),
  OPENROUTER_MODEL_FALLBACK: z.string().optional(),
  OPSPILOT_DB: z.string().default(path.resolve(process.cwd(), "data/opspilot.db")),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Pure parser that converts a comma-separated fallback models string into an array of clean,
 * deduplicated model identifiers, excluding any model identical to the primary model.
 */
export function parseFallbackModels(fallbackInput?: string, primaryModel?: string): string[] {
  if (!fallbackInput || typeof fallbackInput !== "string") {
    return [];
  }
  const normalizedPrimary = primaryModel ? primaryModel.replace(/^["']|["']$/g, "").trim() : "";
  const models = fallbackInput
    .split(",")
    .map((m) => m.replace(/^["']|["']$/g, "").trim())
    .filter((m) => m.length > 0 && m !== normalizedPrimary);

  return Array.from(new Set(models));
}

export function getEnv(envSource: Record<string, string | undefined> = process.env): EnvConfig {
  const parsed = EnvSchema.parse(envSource);
  if (parsed.OPEN_ROUTER_MODEL && parsed.OPENROUTER_MODEL === "anthropic/claude-3.5-sonnet") {
    parsed.OPENROUTER_MODEL = parsed.OPEN_ROUTER_MODEL;
  }
  return parsed;
}

