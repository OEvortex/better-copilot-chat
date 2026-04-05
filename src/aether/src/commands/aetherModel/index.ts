import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'aetherModel',
  description: 'Select AI model and provider for Aether (hot-swappable, ReVibe-style)',
  argumentHint: '[model-alias or provider-name]',
  immediate: false,
  load: () => import('./aetherModel.js'),
} satisfies Command