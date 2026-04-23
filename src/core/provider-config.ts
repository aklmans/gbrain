export interface EmbeddingConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
  dimensions: number;
}

export interface AnthropicConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
}

export interface TranscriptionProviderConfig {
  provider?: string;
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized.length > 0) return normalized;
  }
  return undefined;
}

function parseIntOr(raw: string | undefined, fallback: number): number {
  const normalized = raw?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) return fallback;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getEmbeddingConfig(): EmbeddingConfig {
  return {
    apiKey: firstNonEmpty(
      process.env.GBRAIN_EMBED_API_KEY,
      process.env.GBRAIN_OPENAI_API_KEY,
      process.env.OPENAI_API_KEY,
    ),
    baseURL: firstNonEmpty(
      process.env.GBRAIN_EMBED_BASE_URL,
      process.env.GBRAIN_OPENAI_BASE_URL,
      process.env.OPENAI_BASE_URL,
    ),
    model: firstNonEmpty(
      process.env.GBRAIN_EMBED_MODEL,
      process.env.GBRAIN_OPENAI_MODEL,
    ) ?? 'text-embedding-3-large',
    dimensions: parseIntOr(process.env.GBRAIN_EMBED_DIMENSIONS, 1536),
  };
}

export function getQueryExpansionConfig(): AnthropicConfig {
  return {
    apiKey: firstNonEmpty(
      process.env.GBRAIN_QUERY_EXPANSION_API_KEY,
      process.env.GBRAIN_ANTHROPIC_API_KEY,
      process.env.ANTHROPIC_API_KEY,
    ),
    baseURL: firstNonEmpty(
      process.env.GBRAIN_QUERY_EXPANSION_BASE_URL,
      process.env.GBRAIN_ANTHROPIC_BASE_URL,
      process.env.ANTHROPIC_BASE_URL,
    ),
    model: firstNonEmpty(
      process.env.GBRAIN_QUERY_EXPANSION_MODEL,
      process.env.GBRAIN_ANTHROPIC_MODEL,
    ) ?? 'claude-haiku-4-5-20251001',
  };
}

export function getSubagentConfig(): AnthropicConfig {
  return {
    apiKey: firstNonEmpty(
      process.env.GBRAIN_SUBAGENT_API_KEY,
      process.env.GBRAIN_ANTHROPIC_API_KEY,
      process.env.ANTHROPIC_API_KEY,
    ),
    baseURL: firstNonEmpty(
      process.env.GBRAIN_SUBAGENT_BASE_URL,
      process.env.GBRAIN_ANTHROPIC_BASE_URL,
      process.env.ANTHROPIC_BASE_URL,
    ),
    model: firstNonEmpty(
      process.env.GBRAIN_SUBAGENT_MODEL,
      process.env.GBRAIN_ANTHROPIC_MODEL,
    ) ?? 'claude-sonnet-4-6',
  };
}

export function getTranscriptionConfig(): TranscriptionProviderConfig {
  return {
    provider: firstNonEmpty(process.env.GBRAIN_TRANSCRIPTION_PROVIDER),
    apiKey: firstNonEmpty(process.env.GBRAIN_TRANSCRIPTION_API_KEY),
    baseURL: firstNonEmpty(process.env.GBRAIN_TRANSCRIPTION_BASE_URL),
    model: firstNonEmpty(process.env.GBRAIN_TRANSCRIPTION_MODEL),
  };
}
