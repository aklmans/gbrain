import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { BrainEngine } from '../src/core/engine.ts';
import type { Operation, OperationContext } from '../src/core/operations.ts';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import type { SearchResult } from '../src/core/types.ts';

const ENV_KEYS = [
  'GBRAIN_EMBED_API_KEY',
  'OPENAI_API_KEY',
] as const;

let envSnapshot = new Map<string, string | undefined>();
const embedCalls: string[] = [];
const embedBatchCalls: string[][] = [];

mock.module('../src/core/embedding.ts', () => ({
  embed: async (text: string) => {
    embedCalls.push(text);
    return new Float32Array([0.25]);
  },
  embedBatch: async (texts: string[]) => {
    embedBatchCalls.push([...texts]);
    return texts.map(() => new Float32Array(1536).fill(0.25));
  },
}));

const hybridModulePromise = import('../src/core/search/hybrid.ts');
const operationsModulePromise = import('../src/core/operations.ts');

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    slug: 'test-page',
    page_id: 1,
    title: 'Test',
    type: 'concept',
    chunk_text: 'test chunk text',
    chunk_source: 'timeline',
    chunk_id: undefined as any,
    chunk_index: 0,
    score: 1,
    stale: false,
    ...overrides,
  };
}

beforeEach(() => {
  envSnapshot = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    envSnapshot.set(key, process.env[key]);
    delete process.env[key];
  }
  embedCalls.length = 0;
  embedBatchCalls.length = 0;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = envSnapshot.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function withPGLiteEngine<T>(fn: (engine: PGLiteEngine) => Promise<T>): Promise<T> {
  const dbDir = mkdtempSync(join(tmpdir(), 'gbrain-provider-gate-'));
  const engine = new PGLiteEngine();
  try {
    await engine.connect({ engine: 'pglite', database_path: dbDir });
    await engine.initSchema();
    return await fn(engine);
  } finally {
    await engine.disconnect();
    rmSync(dbDir, { recursive: true, force: true });
  }
}

describe('provider gate regression coverage', () => {
  test('hybridSearch honors GBRAIN_EMBED_API_KEY when OPENAI_API_KEY is unset', async () => {
    process.env.GBRAIN_EMBED_API_KEY = 'embed-key';

    const vectorCalls: number[] = [];
    const engine = {
      searchKeyword: async () => [
        makeResult({ slug: 'keyword-hit', chunk_text: 'keyword chunk' }),
      ],
      searchVector: async (embedding: Float32Array) => {
        vectorCalls.push(embedding.length);
        return [makeResult({ slug: 'vector-hit', chunk_text: 'vector chunk' })];
      },
      getBacklinkCounts: async () => new Map<string, number>(),
      getEmbeddingsByChunkIds: async () => new Map<number, Float32Array>(),
    } as unknown as BrainEngine;

    const { hybridSearch } = await hybridModulePromise;
    const results = await hybridSearch(engine, 'third-party embedding gate');

    expect(embedCalls).toEqual(['third-party embedding gate']);
    expect(vectorCalls).toEqual([1]);
    expect(results.map(r => r.slug)).toContain('vector-hit');
  });

  test('put_page keeps embedding enabled when only GBRAIN_EMBED_API_KEY is set', async () => {
    process.env.GBRAIN_EMBED_API_KEY = 'embed-key';

    const { operations } = await operationsModulePromise;
    const putPage = operations.find(o => o.name === 'put_page') as Operation;

    await withPGLiteEngine(async (engine) => {
      const ctx: OperationContext = {
        engine,
        config: { engine: 'pglite' } as any,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
        dryRun: false,
        remote: true,
      };

      const result = await putPage.handler(ctx, { slug: 'notes/provider-gate', content: 'stub content' });

      expect(embedBatchCalls).toEqual([['stub content']]);
      expect(result).toMatchObject({
        slug: 'notes/provider-gate',
        status: 'created_or_updated',
        auto_links: { skipped: 'remote' },
        auto_timeline: { skipped: 'remote' },
      });
    });
  });

  test('put_page still disables embedding when no provider key is configured', async () => {
    const { operations } = await operationsModulePromise;
    const putPage = operations.find(o => o.name === 'put_page') as Operation;

    await withPGLiteEngine(async (engine) => {
      const ctx: OperationContext = {
        engine,
        config: { engine: 'pglite' } as any,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
        dryRun: false,
        remote: true,
      };

      await putPage.handler(ctx, { slug: 'notes/no-provider-key', content: 'stub content' });

      expect(embedBatchCalls).toEqual([]);
    });
  });
});
