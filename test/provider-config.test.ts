import { afterEach, describe, expect, test } from 'bun:test';
import {
  getEmbeddingConfig,
  getQueryExpansionConfig,
  getSubagentConfig,
  getTranscriptionConfig,
} from '../src/core/provider-config.ts';

const ENV_KEYS = [
  'GBRAIN_EMBED_API_KEY',
  'GBRAIN_EMBED_BASE_URL',
  'GBRAIN_EMBED_MODEL',
  'GBRAIN_EMBED_DIMENSIONS',
  'GBRAIN_OPENAI_API_KEY',
  'GBRAIN_OPENAI_BASE_URL',
  'GBRAIN_OPENAI_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'GBRAIN_QUERY_EXPANSION_API_KEY',
  'GBRAIN_QUERY_EXPANSION_BASE_URL',
  'GBRAIN_QUERY_EXPANSION_MODEL',
  'GBRAIN_ANTHROPIC_API_KEY',
  'GBRAIN_ANTHROPIC_BASE_URL',
  'GBRAIN_ANTHROPIC_MODEL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'GBRAIN_SUBAGENT_API_KEY',
  'GBRAIN_SUBAGENT_BASE_URL',
  'GBRAIN_SUBAGENT_MODEL',
  'GBRAIN_TRANSCRIPTION_PROVIDER',
  'GBRAIN_TRANSCRIPTION_API_KEY',
  'GBRAIN_TRANSCRIPTION_BASE_URL',
  'GBRAIN_TRANSCRIPTION_MODEL',
  'GROQ_API_KEY',
  'DEEPGRAM_API_KEY',
] as const;

const envSnapshot = new Map<string, string | undefined>();
for (const key of ENV_KEYS) envSnapshot.set(key, process.env[key]);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = envSnapshot.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('provider-config', () => {
  test('embedding prefers GBRAIN_EMBED_* over shared OpenAI envs', () => {
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_BASE_URL = 'https://openai.example/v1';
    process.env.GBRAIN_OPENAI_API_KEY = 'gbrain-openai-key';
    process.env.GBRAIN_OPENAI_BASE_URL = 'https://gbrain-openai.example/v1';
    process.env.GBRAIN_OPENAI_MODEL = 'gbrain-openai-model';
    process.env.GBRAIN_EMBED_API_KEY = 'embed-key';
    process.env.GBRAIN_EMBED_BASE_URL = 'https://embed.example/v1';
    process.env.GBRAIN_EMBED_MODEL = 'embed-model';
    process.env.GBRAIN_EMBED_DIMENSIONS = '2048';

    expect(getEmbeddingConfig()).toEqual({
      apiKey: 'embed-key',
      baseURL: 'https://embed.example/v1',
      model: 'embed-model',
      dimensions: 2048,
    });
  });

  test('embedding preserves current defaults when unset', () => {
    expect(getEmbeddingConfig()).toEqual({
      apiKey: undefined,
      baseURL: undefined,
      model: 'text-embedding-3-large',
      dimensions: 1536,
    });
  });

  test('query expansion prefers scoped envs over shared Anthropic envs', () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.ANTHROPIC_BASE_URL = 'https://anthropic.example';
    process.env.GBRAIN_ANTHROPIC_API_KEY = 'gbrain-anthropic-key';
    process.env.GBRAIN_ANTHROPIC_BASE_URL = 'https://gbrain-anthropic.example';
    process.env.GBRAIN_ANTHROPIC_MODEL = 'gbrain-anthropic-model';
    process.env.GBRAIN_QUERY_EXPANSION_API_KEY = 'qe-key';
    process.env.GBRAIN_QUERY_EXPANSION_BASE_URL = 'https://qe.example';
    process.env.GBRAIN_QUERY_EXPANSION_MODEL = 'qe-model';

    expect(getQueryExpansionConfig()).toEqual({
      apiKey: 'qe-key',
      baseURL: 'https://qe.example',
      model: 'qe-model',
    });
  });

  test('query expansion preserves current default model when unset', () => {
    expect(getQueryExpansionConfig()).toEqual({
      apiKey: undefined,
      baseURL: undefined,
      model: 'claude-haiku-4-5-20251001',
    });
  });

  test('subagent prefers scoped envs over shared Anthropic envs', () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.ANTHROPIC_BASE_URL = 'https://anthropic.example';
    process.env.GBRAIN_ANTHROPIC_API_KEY = 'gbrain-anthropic-key';
    process.env.GBRAIN_ANTHROPIC_BASE_URL = 'https://gbrain-anthropic.example';
    process.env.GBRAIN_ANTHROPIC_MODEL = 'gbrain-anthropic-model';
    process.env.GBRAIN_SUBAGENT_API_KEY = 'subagent-key';
    process.env.GBRAIN_SUBAGENT_BASE_URL = 'https://subagent.example';
    process.env.GBRAIN_SUBAGENT_MODEL = 'subagent-model';

    expect(getSubagentConfig()).toEqual({
      apiKey: 'subagent-key',
      baseURL: 'https://subagent.example',
      model: 'subagent-model',
    });
  });

  test('subagent preserves current default model when unset', () => {
    expect(getSubagentConfig()).toEqual({
      apiKey: undefined,
      baseURL: undefined,
      model: 'claude-sonnet-4-6',
    });
  });

  test('transcription only resolves GBRAIN_TRANSCRIPTION_* values', () => {
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.DEEPGRAM_API_KEY = 'deepgram-key';
    process.env.GBRAIN_TRANSCRIPTION_PROVIDER = 'openai';
    process.env.GBRAIN_TRANSCRIPTION_API_KEY = 'transcription-key';
    process.env.GBRAIN_TRANSCRIPTION_BASE_URL = 'https://transcription.example/v1';
    process.env.GBRAIN_TRANSCRIPTION_MODEL = 'whisper-compatible';

    expect(getTranscriptionConfig()).toEqual({
      provider: 'openai',
      apiKey: 'transcription-key',
      baseURL: 'https://transcription.example/v1',
      model: 'whisper-compatible',
    });
  });
});
