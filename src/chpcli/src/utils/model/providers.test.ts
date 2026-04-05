import { afterEach, expect, test } from 'bun:test'

import {
  getAPIProvider,
  usesAnthropicAccountFlow,
} from './providers.js'

const originalEnv = {
  CLAUDE_CODE_USE_GEMINI: process.env.CLAUDE_CODE_USE_GEMINI,
  CLAUDE_CODE_USE_GITHUB: process.env.CLAUDE_CODE_USE_GITHUB,
  CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
  CLAUDE_CODE_USE_BEDROCK: process.env.CLAUDE_CODE_USE_BEDROCK,
  CLAUDE_CODE_USE_VERTEX: process.env.CLAUDE_CODE_USE_VERTEX,
  CLAUDE_CODE_USE_FOUNDRY: process.env.CLAUDE_CODE_USE_FOUNDRY,
}

afterEach(() => {
  process.env.CLAUDE_CODE_USE_GEMINI = originalEnv.CLAUDE_CODE_USE_GEMINI
  process.env.CLAUDE_CODE_USE_GITHUB = originalEnv.CLAUDE_CODE_USE_GITHUB
  process.env.CLAUDE_CODE_USE_OPENAI = originalEnv.CLAUDE_CODE_USE_OPENAI
  process.env.CLAUDE_CODE_USE_BEDROCK = originalEnv.CLAUDE_CODE_USE_BEDROCK
  process.env.CLAUDE_CODE_USE_VERTEX = originalEnv.CLAUDE_CODE_USE_VERTEX
  process.env.CLAUDE_CODE_USE_FOUNDRY = originalEnv.CLAUDE_CODE_USE_FOUNDRY
})

function clearProviderEnv(): void {
  delete process.env.CLAUDE_CODE_USE_GEMINI
  delete process.env.CLAUDE_CODE_USE_GITHUB
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_BEDROCK
  delete process.env.CLAUDE_CODE_USE_VERTEX
  delete process.env.CLAUDE_CODE_USE_FOUNDRY
}

test('first-party provider keeps Anthropic account setup flow enabled', () => {
  clearProviderEnv()

  expect(getAPIProvider()).toBe('firstParty')
  expect(usesAnthropicAccountFlow()).toBe(true)
})

test.each([
  ['CLAUDE_CODE_USE_OPENAI', 'openai'],
  ['CLAUDE_CODE_USE_GITHUB', 'github'],
  ['CLAUDE_CODE_USE_GEMINI', 'gemini'],
  ['CLAUDE_CODE_USE_BEDROCK', 'bedrock'],
  ['CLAUDE_CODE_USE_VERTEX', 'vertex'],
  ['CLAUDE_CODE_USE_FOUNDRY', 'foundry'],
] as const)(
  '%s disables Anthropic account setup flow',
  (envKey, provider) => {
    clearProviderEnv()
    process.env[envKey] = '1'

    expect(getAPIProvider()).toBe(provider)
    expect(usesAnthropicAccountFlow()).toBe(false)
  },
)

test('GEMINI takes precedence over GitHub when both are set', () => {
  clearProviderEnv()
  process.env.CLAUDE_CODE_USE_GEMINI = '1'
  process.env.CLAUDE_CODE_USE_GITHUB = '1'

  expect(getAPIProvider()).toBe('gemini')
})
