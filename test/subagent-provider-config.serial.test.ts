import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { MinionQueue } from '../src/core/minions/queue.ts';
import type { MinionJobContext } from '../src/core/minions/types.ts';

const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'GBRAIN_ANTHROPIC_API_KEY',
  'GBRAIN_ANTHROPIC_BASE_URL',
  'GBRAIN_ANTHROPIC_MODEL',
  'GBRAIN_SUBAGENT_API_KEY',
  'GBRAIN_SUBAGENT_BASE_URL',
  'GBRAIN_SUBAGENT_MODEL',
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
          id: `msg_${requestCalls.length}`,
          type: 'message',
          role: 'assistant',
          model: params.model,
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          content: [{ type: 'text', text: 'configured' }],
        };
      },
    };

    constructor(options: Record<string, string> = {}) {
      constructorCalls.push(options);
    }
  }

  return { default: FakeAnthropic };
});

const subagentModulePromise = import('../src/core/minions/handlers/subagent.ts');

let engine: PGLiteEngine;
let queue: MinionQueue;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({ database_url: '' });
  await engine.initSchema();
  queue = new MinionQueue(engine);
}, 60_000);

afterAll(async () => {
  await engine.disconnect();
});

beforeEach(async () => {
  envSnapshot = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    envSnapshot.set(key, process.env[key]);
    delete process.env[key];
  }

  constructorCalls.length = 0;
  requestCalls.length = 0;

  await engine.executeRaw('DELETE FROM subagent_tool_executions');
  await engine.executeRaw('DELETE FROM subagent_messages');
  await engine.executeRaw('DELETE FROM subagent_rate_leases');
  await engine.executeRaw('DELETE FROM minion_jobs');
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = envSnapshot.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function makeCtx(input: unknown): Promise<MinionJobContext> {
  const job = await queue.add(
    'subagent',
    input as Record<string, unknown>,
    {},
    { allowProtectedSubmit: true },
  );
  const ac = new AbortController();
  const shutdown = new AbortController();
  return {
    id: job.id,
    name: job.name,
    data: (input as Record<string, unknown>) ?? {},
    attempts_made: 0,
    signal: ac.signal,
    shutdownSignal: shutdown.signal,
    async updateProgress() {},
    async updateTokens() {},
    async log() {},
    async isActive() { return true; },
    async readInbox() { return []; },
  };
}

describe('subagent provider config wiring', () => {
  test('default Anthropic client and default model honor scoped subagent config', async () => {
    const { makeSubagentHandler } = await subagentModulePromise;

    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.ANTHROPIC_BASE_URL = 'https://anthropic.example';
    process.env.GBRAIN_ANTHROPIC_API_KEY = 'shared-key';
    process.env.GBRAIN_ANTHROPIC_BASE_URL = 'https://shared.example';
    process.env.GBRAIN_ANTHROPIC_MODEL = 'shared-model';
    process.env.GBRAIN_SUBAGENT_API_KEY = 'subagent-key';
    process.env.GBRAIN_SUBAGENT_BASE_URL = 'https://subagent.example';
    process.env.GBRAIN_SUBAGENT_MODEL = 'subagent-model';

    const handler = makeSubagentHandler({
      engine,
      config: { engine: 'postgres' } as any,
      toolRegistry: [],
    });
    const ctx = await makeCtx({ prompt: 'hello' });

    const result = await handler(ctx);

    expect(result.result).toBe('configured');
    expect(constructorCalls).toEqual([
      { apiKey: 'subagent-key', baseURL: 'https://subagent.example' },
    ]);
    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]).toMatchObject({
      model: 'subagent-model',
    });
  });

  test('job data model override still beats provider-config default model', async () => {
    const { makeSubagentHandler } = await subagentModulePromise;

    process.env.GBRAIN_SUBAGENT_MODEL = 'env-model';

    const handler = makeSubagentHandler({
      engine,
      config: { engine: 'postgres' } as any,
      toolRegistry: [],
    });
    const ctx = await makeCtx({ prompt: 'hello', model: 'job-model' });

    await handler(ctx);

    expect(constructorCalls).toEqual([{}]);
    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]).toMatchObject({
      model: 'job-model',
    });
  });
});
