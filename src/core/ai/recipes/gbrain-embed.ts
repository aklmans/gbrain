import type { Recipe } from '../types.ts';

export const gbrainEmbed: Recipe = {
  id: 'gbrain_embed',
  name: 'GBrain legacy embedding adapter',
  tier: 'openai-compat',
  implementation: 'openai-compatible',
  auth_env: {
    required: ['GBRAIN_EMBED_API_KEY'],
    optional: ['GBRAIN_EMBED_BASE_URL'],
  },
  touchpoints: {
    embedding: {
      models: [],
      default_dims: 1536,
      price_last_verified: '2026-05-07',
    },
  },
  setup_hint: 'Set GBRAIN_EMBED_API_KEY, GBRAIN_EMBED_BASE_URL, GBRAIN_EMBED_MODEL, and GBRAIN_EMBED_DIMENSIONS.',
};
