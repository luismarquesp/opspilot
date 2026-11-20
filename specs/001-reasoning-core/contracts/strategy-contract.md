# Contract: ReasoningStrategy Interface

## TypeScript Interface

```typescript
import { z } from 'zod';

export const TraceEventTypeSchema = z.enum([
  'thought',
  'action',
  'observation',
  'plan',
  'critique',
  'answer',
]);

export const BaseTraceEventSchema = z.object({
  type: TraceEventTypeSchema,
  content: z.string(),
  timestamp: z.number().int().positive(),
});

export const ActionTraceEventSchema = BaseTraceEventSchema.extend({
  type: z.literal('action'),
  tool: z.string().min(1),
  args: z.record(z.unknown()),
});

export const TraceEventSchema = z.discriminatedUnion('type', [
  ActionTraceEventSchema,
  BaseTraceEventSchema.extend({
    type: z.enum(['thought', 'observation', 'plan', 'critique', 'answer']),
  }),
]);

export type TraceEvent = z.infer<typeof TraceEventSchema>;

export const StrategyMetricsSchema = z.object({
  llmCalls: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
});

export type StrategyMetrics = z.infer<typeof StrategyMetricsSchema>;

export const StrategyResultSchema = z.object({
  answer: z.string(),
  trace: z.array(TraceEventSchema),
  metrics: StrategyMetricsSchema,
});

export type StrategyResult = z.infer<typeof StrategyResultSchema>;

export interface StrategyOptions {
  maxIterations?: number;
  verbose?: boolean;
}

export interface ReasoningStrategy {
  readonly name: string;
  run(input: string, options?: StrategyOptions): Promise<StrategyResult>;
}
```
