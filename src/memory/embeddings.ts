// ---------------------------------------------------------------------------
// Lazy singleton embedding service via @huggingface/transformers
// ---------------------------------------------------------------------------

export type FeatureExtractor = (
  text: string,
  options?: { pooling?: "mean" | "cls"; normalize?: boolean }
) => Promise<{
  data: Float32Array | number[];
  dims: number[];
}>;

let pipelinePromise: Promise<FeatureExtractor> | null = null;

/**
 * Pure dot product of two float vectors.
 * For unit-normalized vectors (normalize: true), this is identical to cosine similarity.
 */
export function dotProduct(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Returns the lazily initialized feature-extraction pipeline singleton.
 */
export async function getEmbeddingPipeline(): Promise<FeatureExtractor> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      return extractor as unknown as FeatureExtractor;
    })();
  }
  return pipelinePromise;
}

/**
 * Computes a normalized 384-dimensional dense vector for the given text.
 */
export async function embed(text: string): Promise<Float32Array> {
  const extractor = await getEmbeddingPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  if (output.data instanceof Float32Array) {
    return output.data;
  }
  return new Float32Array(output.data);
}
