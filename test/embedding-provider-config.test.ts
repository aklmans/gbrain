import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const ENV_KEYS = [
  'GBRAIN_EMBED_API_KEY',
  'GBRAIN_EMBED_BASE_URL',
  'GBRAIN_EMBED_MODEL',
  'GBRAIN_EMBED_DIMENSIONS',
  'GBRAIN_EMBED_BATCH_SIZE',
  'GBRAIN_OPENAI_API_KEY',
  'GBRAIN_OPENAI_BASE_URL',
  'GBRAIN_OPENAI_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
] as const;

let envSnapshot = new Map<string, string | undefined>();
const constructorCalls: Array<Record<string, string>> = [];
const requestCalls: Array<Record<string, unknown>> = [];

mock.module('openai', () => {
  class FakeOpenAI {
    static APIError = class APIError extends Error {
      status?: number;
      headers?: Record<string, string>;
    };

    embeddings = {
      create: async (params: Record<string, unknown>) => {
        requestCalls.push(params);
        const input = Array.isArray(params.input) ? params.input : [];
        return {
          data: input.map((_, index) => ({
            index,
            embedding: [index + 0.5],
          })),
        };
      },
    };

    constructor(options: Record<string, string> = {}) {
      constructorCalls.push(options);
    }
  }

  return { default: FakeOpenAI };
});

const embeddingModulePromise = import('../src/core/embedding.ts');

beforeEach(async () => {
  const { resetEmbeddingClientForTests } = await embeddingModulePromise;
  resetEmbeddingClientForTests();

  envSnapshot = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    envSnapshot.set(key, process.env[key]);
    delete process.env[key];
  }
  constructorCalls.length = 0;
  requestCalls.length = 0;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = envSnapshot.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('embedding provider config wiring', () => {
  test('helper exports preserve default embedding behavior when env vars are absent', async () => {
    const {
      EMBEDDING_DIMENSIONS,
      EMBEDDING_MODEL,
      getEmbeddingClientOptions,
      getEmbeddingRuntimeConfig,
    } = await embeddingModulePromise;

    expect(EMBEDDING_MODEL).toBe('text-embedding-3-large');
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
    expect(getEmbeddingClientOptions()).toEqual({});
    expect(getEmbeddingRuntimeConfig()).toEqual({
      model: 'text-embedding-3-large',
      dimensions: 1536,
      batchSize: 100,
    });
  });

  test('helper exports and embedBatch honor custom embedding provider config', async () => {
    const {
      embedBatch,
      getEmbeddingClientOptions,
      getEmbeddingRuntimeConfig,
    } = await embeddingModulePromise;

    process.env.GBRAIN_EMBED_API_KEY = 'embed-key';
    process.env.GBRAIN_EMBED_BASE_URL = 'https://embed.example/v1';
    process.env.GBRAIN_EMBED_MODEL = 'kimi-embedding-v1';
    process.env.GBRAIN_EMBED_DIMENSIONS = '1024';
    process.env.GBRAIN_EMBED_BATCH_SIZE = '10';

    expect(getEmbeddingClientOptions()).toEqual({
      apiKey: 'embed-key',
      baseURL: 'https://embed.example/v1',
    });
    expect(getEmbeddingRuntimeConfig()).toEqual({
      model: 'kimi-embedding-v1',
      dimensions: 1024,
      batchSize: 10,
    });

    const result = await embedBatch(['alpha', 'beta']);

    expect(result).toHaveLength(2);
    expect(Array.from(result[0])).toEqual([0.5]);
    expect(Array.from(result[1])).toEqual([1.5]);
    expect(constructorCalls).toEqual([
      { apiKey: 'embed-key', baseURL: 'https://embed.example/v1' },
    ]);
    expect(requestCalls).toEqual([
      {
        model: 'kimi-embedding-v1',
        input: ['alpha', 'beta'],
        dimensions: 1024,
      },
    ]);
  });

  test('embedBatch reuses the cached client when resolved client options stay the same', async () => {
    const { embedBatch, resetEmbeddingClientForTests } = await embeddingModulePromise;

    resetEmbeddingClientForTests();
    process.env.GBRAIN_EMBED_API_KEY = 'embed-key';
    process.env.GBRAIN_EMBED_BASE_URL = 'https://embed.example/v1';
    process.env.GBRAIN_EMBED_MODEL = 'model-one';
    process.env.GBRAIN_EMBED_DIMENSIONS = '1024';
    process.env.GBRAIN_EMBED_BATCH_SIZE = '10';

    await embedBatch(['first']);

    process.env.GBRAIN_EMBED_MODEL = 'model-two';
    process.env.GBRAIN_EMBED_DIMENSIONS = '2048';

    await embedBatch(['second']);

    expect(constructorCalls).toEqual([
      { apiKey: 'embed-key', baseURL: 'https://embed.example/v1' },
    ]);
    expect(requestCalls).toEqual([
      {
        model: 'model-one',
        input: ['first'],
        dimensions: 1024,
      },
      {
        model: 'model-two',
        input: ['second'],
        dimensions: 2048,
      },
    ]);
  });

  test('embedBatch recreates the cached client when env-based client options change', async () => {
    const { embedBatch } = await embeddingModulePromise;

    process.env.GBRAIN_EMBED_API_KEY = 'embed-key-1';
    process.env.GBRAIN_EMBED_BASE_URL = 'https://embed-one.example/v1';
    process.env.GBRAIN_EMBED_MODEL = 'model-one';
    process.env.GBRAIN_EMBED_DIMENSIONS = '1024';
    process.env.GBRAIN_EMBED_BATCH_SIZE = '10';

    await embedBatch(['first']);

    process.env.GBRAIN_EMBED_API_KEY = 'embed-key-2';
    process.env.GBRAIN_EMBED_BASE_URL = 'https://embed-two.example/v1';
    process.env.GBRAIN_EMBED_MODEL = 'model-two';
    process.env.GBRAIN_EMBED_DIMENSIONS = '2048';
    process.env.GBRAIN_EMBED_BATCH_SIZE = '20';

    await embedBatch(['second']);

    expect(constructorCalls).toEqual([
      { apiKey: 'embed-key-1', baseURL: 'https://embed-one.example/v1' },
      { apiKey: 'embed-key-2', baseURL: 'https://embed-two.example/v1' },
    ]);
    expect(requestCalls).toEqual([
      {
        model: 'model-one',
        input: ['first'],
        dimensions: 1024,
      },
      {
        model: 'model-two',
        input: ['second'],
        dimensions: 2048,
      },
    ]);
  });

  test('embedBatch splits requests according to the configured batch size', async () => {
    const {
      embedBatch,
      getEmbeddingRuntimeConfig,
      resetEmbeddingClientForTests,
    } = await embeddingModulePromise;

    resetEmbeddingClientForTests();
    process.env.GBRAIN_EMBED_API_KEY = 'embed-key';
    process.env.GBRAIN_EMBED_BASE_URL = 'https://embed.example/v1';
    process.env.GBRAIN_EMBED_MODEL = 'ali-embed';
    process.env.GBRAIN_EMBED_DIMENSIONS = '1536';
    process.env.GBRAIN_EMBED_BATCH_SIZE = '10';

    const inputs = Array.from({ length: 12 }, (_, index) => `chunk-${index}`);
    const result = await embedBatch(inputs);

    expect(result).toHaveLength(12);
    expect(getEmbeddingRuntimeConfig()).toEqual({
      model: 'ali-embed',
      dimensions: 1536,
      batchSize: 10,
    });
    expect(requestCalls).toEqual([
      {
        model: 'ali-embed',
        input: inputs.slice(0, 10),
        dimensions: 1536,
      },
      {
        model: 'ali-embed',
        input: inputs.slice(10),
        dimensions: 1536,
      },
    ]);
  });
});
