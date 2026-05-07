import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { transcribe } from '../src/core/transcription.ts';

const TMP_MP3 = join(tmpdir(), `gbrain-transcription-provider-config-${process.pid}.mp3`);
writeFileSync(TMP_MP3, 'fake mp3 data');

const ENV_KEYS = [
  'GBRAIN_TRANSCRIPTION_PROVIDER',
  'GBRAIN_TRANSCRIPTION_API_KEY',
  'GBRAIN_TRANSCRIPTION_BASE_URL',
  'GBRAIN_TRANSCRIPTION_MODEL',
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'DEEPGRAM_API_KEY',
] as const;

interface FetchCall {
  url: string;
  authorization?: string;
  model?: string;
}

let envSnapshot = new Map<string, string | undefined>();
let fetchCalls: FetchCall[] = [];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  envSnapshot = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    envSnapshot.set(key, process.env[key]);
    delete process.env[key];
  }

  fetchCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const formData = init?.body as FormData | undefined;
    fetchCalls.push({
      url: String(input),
      authorization: headers.get('Authorization') ?? undefined,
      model: typeof formData?.get === 'function' ? String(formData.get('model') ?? '') : undefined,
    });

    return new Response(JSON.stringify({
      text: 'hello world',
      segments: [{ start: 0, end: 1, text: 'hello world' }],
      language: 'en',
      duration: 1,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = envSnapshot.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  try {
    unlinkSync(TMP_MP3);
  } catch {}
});

describe('transcription provider config wiring', () => {
  test('GBRAIN_TRANSCRIPTION_* overrides flow into provider, apiKey, baseURL, and model', async () => {
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.GBRAIN_TRANSCRIPTION_PROVIDER = 'openai';
    process.env.GBRAIN_TRANSCRIPTION_API_KEY = 'transcription-key';
    process.env.GBRAIN_TRANSCRIPTION_BASE_URL = 'https://transcription.example/v1';
    process.env.GBRAIN_TRANSCRIPTION_MODEL = 'whisper-compatible';

    const result = await transcribe(TMP_MP3, {});

    expect(result.provider).toBe('openai');
    expect(fetchCalls).toEqual([
      {
        url: 'https://transcription.example/v1/audio/transcriptions',
        authorization: 'Bearer transcription-key',
        model: 'whisper-compatible',
      },
    ]);
  });

  test('legacy provider detection and defaults stay unchanged when GBRAIN_TRANSCRIPTION_* vars are absent', async () => {
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.OPENAI_API_KEY = 'openai-key';

    const result = await transcribe(TMP_MP3, {});

    expect(result.provider).toBe('groq');
    expect(fetchCalls).toEqual([
      {
        url: 'https://api.groq.com/openai/v1/audio/transcriptions',
        authorization: 'Bearer groq-key',
        model: 'whisper-large-v3',
      },
    ]);
  });

  test('scoped provider override still falls back to legacy provider-specific apiKey and defaults', async () => {
    process.env.GBRAIN_TRANSCRIPTION_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'openai-key';

    const result = await transcribe(TMP_MP3, {});

    expect(result.provider).toBe('openai');
    expect(fetchCalls).toEqual([
      {
        url: 'https://api.openai.com/v1/audio/transcriptions',
        authorization: 'Bearer openai-key',
        model: 'whisper-1',
      },
    ]);
  });
});
