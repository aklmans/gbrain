import type { Recipe } from '../types.ts';

export const gbrainSubagent: Recipe = {
  id: 'gbrain_subagent',
  name: 'GBrain legacy subagent adapter',
  tier: 'native',
  implementation: 'native-anthropic',
  auth_env: {
    required: ['GBRAIN_SUBAGENT_API_KEY'],
    optional: ['GBRAIN_SUBAGENT_BASE_URL'],
  },
  touchpoints: {
    chat: {
      models: [],
      supports_tools: true,
      supports_subagent_loop: true,
      supports_prompt_cache: false,
      price_last_verified: '2026-05-07',
    },
  },
  setup_hint: 'Set GBRAIN_SUBAGENT_API_KEY, GBRAIN_SUBAGENT_BASE_URL, and GBRAIN_SUBAGENT_MODEL.',
};
