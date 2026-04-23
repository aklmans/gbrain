import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const ENV_KEYS = [
  'GBRAIN_QUERY_EXPANSION_API_KEY',
  'GBRAIN_QUERY_EXPANSION_BASE_URL',
  'GBRAIN_QUERY_EXPANSION_MODEL',
  'GBRAIN_ANTHROPIC_API_KEY',
  'GBRAIN_ANTHROPIC_BASE_URL',
  'GBRAIN_ANTHROPIC_MODEL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
] as const;

let envSnapshot = new Map<string, string | undefined>();
const constructorCalls: Array<Record<string, string>> = [];
const requestCalls: Array<Record<string, unknown>> = [];

mock.module('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      create: async (params: Record<string, unknown>) => {
        requestCalls.push(params);
        return {
          content: [
            {
              type: 'tool_use',
              name: 'expand_query',
              input: {
                alternative_queries: ['alt one', 'alt two'],
              },
            },
          ],
        };
      },
    };

    constructor(options: Record<string, string> = {}) {
      constructorCalls.push(options);
    }
  }

  return { default: FakeAnthropic };
});

const expansionModulePromise = import('../src/core/search/expansion.ts');

beforeEach(async () => {
  const { resetQueryExpansionClientForTests } = await expansionModulePromise;
  resetQueryExpansionClientForTests();

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

describe('query expansion provider config wiring', () => {
  test('helper exports preserve default query expansion behavior when env vars are absent', async () => {
    const {
      getQueryExpansionClientOptions,
      getQueryExpansionModel,
    } = await expansionModulePromise;

    expect(getQueryExpansionClientOptions()).toEqual({});
    expect(getQueryExpansionModel()).toBe('claude-haiku-4-5-20251001');
  });

  test('helper exports and expandQuery honor custom query expansion provider config', async () => {
    const {
      expandQuery,
      getQueryExpansionClientOptions,
      getQueryExpansionModel,
    } = await expansionModulePromise;

    process.env.GBRAIN_QUERY_EXPANSION_API_KEY = 'qe-key';
    process.env.GBRAIN_QUERY_EXPANSION_BASE_URL = 'https://qe.example';
    process.env.GBRAIN_QUERY_EXPANSION_MODEL = 'qe-model';

    expect(getQueryExpansionClientOptions()).toEqual({
      apiKey: 'qe-key',
      baseURL: 'https://qe.example',
    });
    expect(getQueryExpansionModel()).toBe('qe-model');

    const result = await expandQuery('how to raise venture funding');

    expect(result).toEqual([
      'how to raise venture funding',
      'alt one',
      'alt two',
    ]);
    expect(constructorCalls).toEqual([
      { apiKey: 'qe-key', baseURL: 'https://qe.example' },
    ]);
    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]).toMatchObject({
      model: 'qe-model',
      max_tokens: 300,
      tool_choice: { type: 'tool', name: 'expand_query' },
      messages: [
        {
          role: 'user',
          content: '<user_query>\nhow to raise venture funding\n</user_query>',
        },
      ],
    });
  });

  test('expandQuery recreates the cached client when env-based client options change', async () => {
    const { expandQuery } = await expansionModulePromise;

    process.env.GBRAIN_QUERY_EXPANSION_API_KEY = 'qe-key-1';
    process.env.GBRAIN_QUERY_EXPANSION_BASE_URL = 'https://qe-one.example';
    process.env.GBRAIN_QUERY_EXPANSION_MODEL = 'qe-model-1';

    await expandQuery('how to raise venture funding');

    process.env.GBRAIN_QUERY_EXPANSION_API_KEY = 'qe-key-2';
    process.env.GBRAIN_QUERY_EXPANSION_BASE_URL = 'https://qe-two.example';
    process.env.GBRAIN_QUERY_EXPANSION_MODEL = 'qe-model-2';

    await expandQuery('how to raise venture funding');

    expect(constructorCalls).toEqual([
      { apiKey: 'qe-key-1', baseURL: 'https://qe-one.example' },
      { apiKey: 'qe-key-2', baseURL: 'https://qe-two.example' },
    ]);
    expect(requestCalls).toHaveLength(2);
    expect(requestCalls[0]).toMatchObject({ model: 'qe-model-1' });
    expect(requestCalls[1]).toMatchObject({ model: 'qe-model-2' });
  });
});
