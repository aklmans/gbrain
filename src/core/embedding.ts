/**
 * Embedding Service — v0.14+ thin delegation to src/core/ai/gateway.ts.
 *
 * The gateway handles provider resolution, retry, error normalization, and
 * dimension-parameter passthrough (preserving existing 1536-dim brains).
 */

import OpenAI from 'openai';
import { getEmbeddingConfig } from './provider-config.ts';
import {
  embed as gatewayEmbed,
  embedOne as gatewayEmbedOne,
  getEmbeddingModel as gatewayGetModel,
  getEmbeddingDimensions as gatewayGetDims,
  isAvailable as gatewayIsAvailable,
} from './ai/gateway.ts';

const MAX_CHARS = 8000;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 4000;
const MAX_DELAY_MS = 120000;
let client: OpenAI | null = null;
let clientCacheKey: string | null = null;

/** Embed one text. */
export async function embed(text: string): Promise<Float32Array> {
  if (gatewayIsAvailable('embedding')) {
    return gatewayEmbedOne(text);
  }
  const [result] = await embedBatch([text]);
  return result;
}

export interface EmbedBatchOptions {
  /**
   * Optional callback fired after each sub-batch completes. CLI wrappers
   * tick a reporter; Minion handlers can call job.updateProgress here.
   */
  onBatchComplete?: (done: number, total: number) => void;
}

/**
 * Embed a batch of texts via the gateway. Sub-batches of 100 so upstream
 * progress callbacks fire incrementally on large imports. The gateway owns
 * adaptive batch splitting and per-recipe token-budget logic; this paginator
 * is purely about progress-callback granularity.
 */
const BATCH_SIZE = 100;
export async function embedBatch(
  texts: string[],
  options: EmbedBatchOptions = {},
): Promise<Float32Array[]> {
  if (!texts || texts.length === 0) return [];
  const legacyConfig = getEmbeddingRuntimeConfig();
  const batchSize = legacyConfig.batchSize > 0 ? legacyConfig.batchSize : BATCH_SIZE;
  if (!gatewayIsAvailable('embedding') && getEmbeddingClientOptions().apiKey) {
    return embedBatchLegacy(texts, options, batchSize);
  }
  // Fast path: small batch, no progress callback — single gateway call.
  if (texts.length <= batchSize && !options.onBatchComplete) {
    return gatewayEmbed(texts);
  }
  const results: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const slice = texts.slice(i, i + batchSize);
    const out = await gatewayEmbed(slice);
    results.push(...out);
    options.onBatchComplete?.(results.length, texts.length);
  }
  return results;
}

/** Currently-configured embedding model (short form without provider prefix). */
export function getEmbeddingModelName(): string {
  return gatewayGetModel().split(':').slice(1).join(':') || 'text-embedding-3-large';
}

/** Currently-configured embedding dimensions. */
export function getEmbeddingDimensions(): number {
  return gatewayGetDims();
}

export function getEmbeddingClientOptions(): { apiKey?: string; baseURL?: string } {
  const config = getEmbeddingConfig();
  return {
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  };
}

export function getEmbeddingRuntimeConfig(): { model: string; dimensions: number; batchSize: number } {
  const config = getEmbeddingConfig();
  return {
    model: config.model,
    dimensions: config.dimensions,
    batchSize: config.batchSize,
  };
}

export function resetEmbeddingClientForTests(): void {
  client = null;
  clientCacheKey = null;
}

function getClient(): OpenAI {
  const options = getEmbeddingClientOptions();
  const cacheKey = JSON.stringify({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  });

  if (!client || clientCacheKey !== cacheKey) {
    client = new OpenAI(options);
    clientCacheKey = cacheKey;
  }

  return client;
}

async function embedBatchLegacy(
  texts: string[],
  options: EmbedBatchOptions,
  batchSize: number,
): Promise<Float32Array[]> {
  const truncated = texts.map(t => (t ?? '').slice(0, MAX_CHARS));
  const results: Float32Array[] = [];
  for (let i = 0; i < truncated.length; i += batchSize) {
    const batch = truncated.slice(i, i + batchSize);
    const batchResults = await embedBatchWithRetry(batch);
    results.push(...batchResults);
    options.onBatchComplete?.(results.length, truncated.length);
  }
  return results;
}

async function embedBatchWithRetry(texts: string[]): Promise<Float32Array[]> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const runtime = getEmbeddingRuntimeConfig();
      const response = await getClient().embeddings.create({
        model: runtime.model,
        input: texts,
        dimensions: runtime.dimensions,
      });

      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map(d => new Float32Array(d.embedding));
    } catch (e: unknown) {
      if (attempt === MAX_RETRIES - 1) throw e;
      let delay = exponentialDelay(attempt);

      if (e instanceof OpenAI.APIError && e.status === 429) {
        const retryAfter = e.headers?.['retry-after'];
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!Number.isNaN(parsed)) delay = parsed * 1000;
        }
      }

      await sleep(delay);
    }
  }
  throw new Error('Embedding failed after all retries');
}

function exponentialDelay(attempt: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Back-compat exports for tests that imported these from v0.13.
export const EMBEDDING_MODEL = 'text-embedding-3-large';
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * USD cost per 1k tokens for text-embedding-3-large. Used by
 * `gbrain sync --all` cost preview and `reindex-code` to surface
 * expected spend before accepting expensive operations.
 */
export const EMBEDDING_COST_PER_1K_TOKENS = 0.00013;

/** Compute USD cost estimate for embedding `tokens` at current model rate. */
export function estimateEmbeddingCostUsd(tokens: number): number {
  return (tokens / 1000) * EMBEDDING_COST_PER_1K_TOKENS;
}
