export interface EmbeddingConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
  dimensions: number;
  batchSize: number;
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

export interface LegacyGatewayEnvConfig {
  embedding_model?: string;
  embedding_dimensions?: number;
  expansion_model?: string;
  chat_model?: string;
  provider_base_urls?: Record<string, string>;
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

function hasAnyEnv(...keys: string[]): boolean {
  return keys.some(key => firstNonEmpty(process.env[key]) !== undefined);
}

function withProviderPrefix(model: string, provider: string): string {
  return model.includes(':') ? model : `${provider}:${model}`;
}

function providerFromModel(model: string, fallback: string): string {
  const colon = model.indexOf(':');
  return colon === -1 ? fallback : model.slice(0, colon).trim().toLowerCase();
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
    batchSize: parseIntOr(process.env.GBRAIN_EMBED_BATCH_SIZE, 100),
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

export function getLegacyGatewayEnvConfig(): LegacyGatewayEnvConfig {
  const provider_base_urls: Record<string, string> = {};
  const out: LegacyGatewayEnvConfig = {};

  if (hasAnyEnv(
    'GBRAIN_EMBED_API_KEY',
    'GBRAIN_EMBED_BASE_URL',
    'GBRAIN_EMBED_MODEL',
    'GBRAIN_EMBED_DIMENSIONS',
    'GBRAIN_OPENAI_API_KEY',
    'GBRAIN_OPENAI_BASE_URL',
    'GBRAIN_OPENAI_MODEL',
  )) {
    const cfg = getEmbeddingConfig();
    const model = withProviderPrefix(cfg.model, 'gbrain_embed');
    out.embedding_model = model;
    out.embedding_dimensions = cfg.dimensions;
    if (cfg.baseURL) provider_base_urls[providerFromModel(model, 'gbrain_embed')] = cfg.baseURL;
  }

  if (hasAnyEnv(
    'GBRAIN_QUERY_EXPANSION_API_KEY',
    'GBRAIN_QUERY_EXPANSION_BASE_URL',
    'GBRAIN_QUERY_EXPANSION_MODEL',
    'GBRAIN_ANTHROPIC_API_KEY',
    'GBRAIN_ANTHROPIC_BASE_URL',
    'GBRAIN_ANTHROPIC_MODEL',
  )) {
    const cfg = getQueryExpansionConfig();
    const model = withProviderPrefix(cfg.model, 'gbrain_expansion');
    out.expansion_model = model;
    if (cfg.baseURL) provider_base_urls[providerFromModel(model, 'gbrain_expansion')] = cfg.baseURL;
  }

  if (hasAnyEnv(
    'GBRAIN_SUBAGENT_API_KEY',
    'GBRAIN_SUBAGENT_BASE_URL',
    'GBRAIN_SUBAGENT_MODEL',
    'GBRAIN_ANTHROPIC_API_KEY',
    'GBRAIN_ANTHROPIC_BASE_URL',
    'GBRAIN_ANTHROPIC_MODEL',
  )) {
    const cfg = getSubagentConfig();
    const model = withProviderPrefix(cfg.model, 'gbrain_subagent');
    out.chat_model = model;
    if (cfg.baseURL) provider_base_urls[providerFromModel(model, 'gbrain_subagent')] = cfg.baseURL;
  }

  if (Object.keys(provider_base_urls).length > 0) {
    out.provider_base_urls = provider_base_urls;
  }

  return out;
}
