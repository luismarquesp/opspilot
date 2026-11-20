import { z } from "zod";

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export const STATUS_URLS = {
  github: "https://www.githubstatus.com/api/v2/status.json",
  cloudflare: "https://www.cloudflarestatus.com/api/v2/status.json",
} as const;

export type Provider = keyof typeof STATUS_URLS;

// ---------------------------------------------------------------------------
// Response schema (statuspage.io v2)
// ---------------------------------------------------------------------------

export const StatusApiResponseSchema = z.object({
  status: z.object({
    indicator: z.string(),
    description: z.string(),
  }),
});

export type StatusApiResponse = z.infer<typeof StatusApiResponseSchema>;

// ---------------------------------------------------------------------------
// Fetcher type — injectable for tests
// ---------------------------------------------------------------------------

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Core function — never throws, always returns a string
// ---------------------------------------------------------------------------

export async function checkProviderStatus(
  provider: Provider,
  doFetch: Fetcher = globalThis.fetch
): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await doFetch(STATUS_URLS[provider], {
        signal: AbortSignal.timeout(5000),
      });

      // 5xx — retriable
      if (response.status >= 500) {
        throw new Error(`upstream ${response.status}`);
      }

      // 4xx — non-retriable: return immediately without retry
      if (!response.ok) {
        return `status page de ${provider} respondeu HTTP ${response.status}`;
      }

      // Parse and validate
      const parsed = StatusApiResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        return `Não consegui interpretar a resposta do status de ${provider}. Responda com base nos alertas internos e avise o plantonista da limitação.`;
      }

      const { indicator, description } = parsed.data.status;
      return `${provider} está ${indicator} — ${description}`;
    } catch (error) {
      if (attempt === 2) {
        return (
          `Não consegui consultar o status de ${provider} (${(error as Error).message}). ` +
          `Responda com base nos alertas internos e avise o plantonista da limitação.`
        );
      }
      // attempt === 1: loop continues to attempt 2
    }
  }

  // Unreachable — TypeScript requires a return
  return `Não consegui consultar o status de ${provider}.`;
}
