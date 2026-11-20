/**
 * Domain error raised when the primary model and all fallback models fail to respond,
 * or when model invocation is unrecoverable.
 */
export class ModelUnavailableError extends Error {
  readonly code = "model_unavailable";
  readonly attemptedModels: string[];
  readonly lastError?: unknown;

  constructor(
    message: string = "All configured models (primary and fallbacks) failed to respond",
    attemptedModels: string[] = [],
    lastError?: unknown
  ) {
    super(message);
    this.name = "ModelUnavailableError";
    this.attemptedModels = attemptedModels;
    this.lastError = lastError;
  }
}
