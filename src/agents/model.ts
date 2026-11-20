import { ChatOpenAI } from "@langchain/openai";
import { Runnable } from "@langchain/core/runnables";
import { getEnv, parseFallbackModels } from "../config/env.js";
import { ModelUnavailableError } from "./errors.js";
import type { FallbackTraceEvent } from "./types.js";

export interface ModelOptions {
  modelName?: string;
  fallbackModels?: string[];
  apiKey?: string;
  temperature?: number;
  stopAfterAttempt?: number;
  timeoutMs?: number;
  node?: string;
  onFallback?: (event: FallbackTraceEvent) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customModel?: any;
}

export interface ResilientModelSharedState {
  lastModelUsed: string;
  fallbackEvents: FallbackTraceEvent[];
}

export interface ResilientModelConfig {
  primaryModelName: string;
  fallbackModelNames?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  primaryModel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  backupModels?: any[];
  stopAfterAttempt?: number;
  node?: string;
  onFallback?: (event: FallbackTraceEvent) => void;
  sharedState?: ResilientModelSharedState;
}

/**
 * Creates a base ChatOpenAI instance for a given model identifier.
 */
export function baseModel(modelName: string, options: ModelOptions = {}): ChatOpenAI {
  const env = getEnv();
  const rawKey =
    options.apiKey ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    env.OPENROUTER_API_KEY ||
    "";
  const apiKey = rawKey.replace(/^["']|["']$/g, "").trim();

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY não está configurada ou está vazia no arquivo .env. Por favor, adicione sua chave do OpenRouter no arquivo .env (ex: OPENROUTER_API_KEY=sk-or-v1-...)."
    );
  }

  const cleanModelName = modelName.replace(/^["']|["']$/g, "").trim();
  const temperature = options.temperature ?? 0;
  const timeoutMs = options.timeoutMs ?? (process.env.NODE_ENV === "test" ? 3000 : 15000);

  return new ChatOpenAI({
    modelName: cleanModelName,
    apiKey,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      timeout: timeoutMs,
    },
    temperature,
    maxRetries: 0,
    timeout: timeoutMs,
  });
}

/**
 * ResilientChatModel orchestrates transient retries on the primary model
 * and automatic failover cascading through backup models, recording
 * "fallback" trace events and tracking `lastModelUsed`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ResilientChatModel extends Runnable<any, any> {
  lc_namespace = ["opspilot", "agents", "resilient_model"];
  readonly primaryModelName: string;
  readonly fallbackModelNames: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly primaryModel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly backupModels: any[];
  readonly stopAfterAttempt: number;
  readonly node: string;
  private readonly _state: ResilientModelSharedState;
  onFallback?: (event: FallbackTraceEvent) => void;

  constructor(config: ResilientModelConfig) {
    super();
    this.primaryModelName = config.primaryModelName;
    this.fallbackModelNames = config.fallbackModelNames ?? [];
    this.primaryModel = config.primaryModel;
    this.backupModels = config.backupModels ?? [];
    this.stopAfterAttempt = config.stopAfterAttempt ?? 2;
    this.node = config.node ?? "model";
    this._state = config.sharedState ?? {
      lastModelUsed: config.primaryModelName,
      fallbackEvents: [],
    };
    this.onFallback = config.onFallback;
  }

  get fallbackEvents(): FallbackTraceEvent[] {
    return this._state.fallbackEvents;
  }

  get lastModelUsed(): string {
    return this._state.lastModelUsed;
  }

  set lastModelUsed(value: string) {
    this._state.lastModelUsed = value;
  }

  get modelName(): string {
    return this.primaryModelName;
  }

  get model(): string {
    return this.primaryModelName;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async invoke(input: any, options?: any): Promise<any> {
    const attemptedModels: string[] = [this.primaryModelName];
    let lastError: unknown;

    // 1. Try primary with retry
    for (let attempt = 1; attempt <= this.stopAfterAttempt; attempt++) {
      try {
        const result = await this.primaryModel.invoke(input, options);
        this.lastModelUsed = this.primaryModelName;
        return result;
      } catch (err) {
        lastError = err;
        if (attempt >= this.stopAfterAttempt) {
          break;
        }
      }
    }

    // 2. Cascade through backup models
    let currentModel = this.primaryModelName;
    for (let i = 0; i < this.backupModels.length; i++) {
      const backup = this.backupModels[i];
      const backupName = this.fallbackModelNames[i] || `fallback-${i + 1}`;
      attemptedModels.push(backupName);

      const fallbackEvent: FallbackTraceEvent = {
        type: "fallback",
        node: this.node,
        fromModel: currentModel,
        toModel: backupName,
        reason: lastError instanceof Error ? lastError.message : String(lastError),
        content: `Switching model from ${currentModel} to ${backupName}`,
        timestamp: Date.now(),
      };
      this.fallbackEvents.push(fallbackEvent);
      this.onFallback?.(fallbackEvent);

      for (let attempt = 1; attempt <= this.stopAfterAttempt; attempt++) {
        try {
          const result = await backup.invoke(input, options);
          this.lastModelUsed = backupName;
          return result;
        } catch (err) {
          lastError = err;
          currentModel = backupName;
          if (attempt >= this.stopAfterAttempt) {
            break;
          }
        }
      }
    }

    // 3. All models exhausted
    throw new ModelUnavailableError(
      `All configured models (${attemptedModels.join(", ")}) failed to respond`,
      attemptedModels,
      lastError
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withStructuredOutput(schema: any, options?: any): { invoke: (input: any, opts?: any) => Promise<any> } {
    const resilientSelf = this;
    const primaryStructured = this.primaryModel.withStructuredOutput
      ? this.primaryModel.withStructuredOutput(schema, options)
      : this.primaryModel;

    const backupStructured = this.backupModels.map((b) =>
      b.withStructuredOutput ? b.withStructuredOutput(schema, options) : b
    );

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async invoke(input: any, invokeOpts?: any): Promise<any> {
        const attemptedModels: string[] = [resilientSelf.primaryModelName];
        let lastError: unknown;

        for (let attempt = 1; attempt <= resilientSelf.stopAfterAttempt; attempt++) {
          try {
            const result = await primaryStructured.invoke(input, invokeOpts);
            resilientSelf.lastModelUsed = resilientSelf.primaryModelName;
            return result;
          } catch (err) {
            lastError = err;
            if (attempt >= resilientSelf.stopAfterAttempt) {
              break;
            }
          }
        }

        let currentModel = resilientSelf.primaryModelName;
        for (let i = 0; i < backupStructured.length; i++) {
          const backup = backupStructured[i];
          const backupName = resilientSelf.fallbackModelNames[i] || `fallback-${i + 1}`;
          attemptedModels.push(backupName);

          const fallbackEvent: FallbackTraceEvent = {
            type: "fallback",
            node: resilientSelf.node,
            fromModel: currentModel,
            toModel: backupName,
            reason: lastError instanceof Error ? lastError.message : String(lastError),
            content: `Switching structured output from ${currentModel} to ${backupName}`,
            timestamp: Date.now(),
          };
          resilientSelf.fallbackEvents.push(fallbackEvent);
          resilientSelf.onFallback?.(fallbackEvent);

          for (let attempt = 1; attempt <= resilientSelf.stopAfterAttempt; attempt++) {
            try {
              const result = await backup.invoke(input, invokeOpts);
              resilientSelf.lastModelUsed = backupName;
              return result;
            } catch (err) {
              lastError = err;
              currentModel = backupName;
              if (attempt >= resilientSelf.stopAfterAttempt) {
                break;
              }
            }
          }
        }

        throw new ModelUnavailableError(
          `All configured models (${attemptedModels.join(", ")}) failed structured output`,
          attemptedModels,
          lastError
        );
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bindTools(tools: any, kwargs?: any): ResilientChatModel {
    const boundPrimary = typeof this.primaryModel.bindTools === "function"
      ? this.primaryModel.bindTools(tools, kwargs)
      : this.primaryModel;

    const boundBackups = this.backupModels.map((b) =>
      typeof b.bindTools === "function" ? b.bindTools(tools, kwargs) : b
    );

    return new ResilientChatModel({
      primaryModelName: this.primaryModelName,
      fallbackModelNames: this.fallbackModelNames,
      primaryModel: boundPrimary,
      backupModels: boundBackups,
      stopAfterAttempt: this.stopAfterAttempt,
      node: this.node,
      onFallback: this.onFallback,
      sharedState: this._state,
    });
  }

  _modelType(): string {
    return "base_chat_model";
  }

  _llmType(): string {
    return "resilient_chat_model";
  }

  _getType(): string {
    return "chat_model";
  }
}

/**
 * Creates a resilient model configured with transient retries on the primary model
 * and automatic fallbacks to backup models in OPENROUTER_MODEL_FALLBACK.
 */
export function createModel(options: ModelOptions = {}): ResilientChatModel {
  const env = getEnv();

  const rawModel =
    options.modelName ||
    process.env.OPENROUTER_MODEL ||
    process.env.OPEN_ROUTER_MODEL ||
    env.OPENROUTER_MODEL ||
    "anthropic/claude-3.5-sonnet";
  const primaryModelName = rawModel.replace(/^["']|["']$/g, "").trim();

  const fallbackModels =
    options.fallbackModels ??
    parseFallbackModels(
      process.env.OPENROUTER_MODEL_FALLBACK || env.OPENROUTER_MODEL_FALLBACK,
      primaryModelName
    );

  const stopAfterAttempt = options.stopAfterAttempt ?? 2;

  // Build primary and fallback models
  const primary = options.customModel ?? baseModel(primaryModelName, options);
  const backups = fallbackModels.map((m) => baseModel(m, options));

  return new ResilientChatModel({
    primaryModelName,
    fallbackModelNames: fallbackModels,
    primaryModel: primary,
    backupModels: backups,
    stopAfterAttempt,
    node: options.node ?? "model",
    onFallback: options.onFallback,
  });
}
