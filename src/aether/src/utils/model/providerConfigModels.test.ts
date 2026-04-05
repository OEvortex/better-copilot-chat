import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { getConfiguredProviderModelOptions } from './providerConfigModels.ts'
import { validateModel } from './validateModel.ts'

test('loads provider-backed models from config files', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'aether-provider-config-'))
  const filePath = join(configDir, 'apertis.json')
  const originalEnv = {
    AETHER_PROVIDER_CONFIG_DIR: process.env.AETHER_PROVIDER_CONFIG_DIR,
    CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  }

  writeFileSync(
    filePath,
    JSON.stringify(
      {
        displayName: 'Apertis AI',
        baseUrl: 'https://api.apertis.ai/v1',
        models: [
          {
            id: 'gpt-4o',
            name: 'GPT-4o',
            tooltip: 'GPT-4o - OpenAI compatible',
          },
        ],
      },
      null,
      2,
    ),
  )

  process.env.AETHER_PROVIDER_CONFIG_DIR = configDir
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  process.env.OPENAI_BASE_URL = 'https://api.apertis.ai/v1'

  try {
    const modelOptions = getConfiguredProviderModelOptions()
    assert.deepEqual(modelOptions.map(option => option.value), ['gpt-4o'])
    assert.equal(modelOptions[0]?.label, 'GPT-4o')

    const validation = await validateModel('gpt-4o')
    assert.deepEqual(validation, { valid: true })
  } finally {
    if (originalEnv.AETHER_PROVIDER_CONFIG_DIR === undefined) {
      delete process.env.AETHER_PROVIDER_CONFIG_DIR
    } else {
      process.env.AETHER_PROVIDER_CONFIG_DIR = originalEnv.AETHER_PROVIDER_CONFIG_DIR
    }

    if (originalEnv.CLAUDE_CODE_USE_OPENAI === undefined) {
      delete process.env.CLAUDE_CODE_USE_OPENAI
    } else {
      process.env.CLAUDE_CODE_USE_OPENAI = originalEnv.CLAUDE_CODE_USE_OPENAI
    }

    if (originalEnv.OPENAI_BASE_URL === undefined) {
      delete process.env.OPENAI_BASE_URL
    } else {
      process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL
    }

    rmSync(configDir, { recursive: true, force: true })
  }
})
