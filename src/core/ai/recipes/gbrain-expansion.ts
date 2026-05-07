import type { Recipe } from '../types.ts';

export const gbrainExpansion: Recipe = {
  id: 'gbrain_expansion',
  name: 'GBrain legacy expansion adapter',
  tier: 'native',
  implementation: 'native-anthropic',
  auth_env: {
    required: ['GBRAIN_QUERY_EXPANSION_API_KEY'],
    optional: ['GBRAIN_QUERY_EXPANSION_BASE_URL'],
  },
  touchpoints: {
    expansion: {
      models: [],
      price_last_verified: '2026-05-07',
    },
  },
  setup_hint: 'Set GBRAIN_QUERY_EXPANSION_API_KEY, GBRAIN_QUERY_EXPANSION_BASE_URL, and GBRAIN_QUERY_EXPANSION_MODEL.',
};
