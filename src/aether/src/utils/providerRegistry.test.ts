import { describe, expect, it } from 'bun:test'

import {
  getProvider,
  getProvidersFromSnapshot,
  parseProviderSnapshot,
} from './providerRegistry.ts'

describe('providerRegistry', () => {
  it('prefers the extension provider snapshot when available', () => {
    const snapshot = parseProviderSnapshot(
      JSON.stringify({
        providers: [
          {
            id: 'openai',
            label: 'OpenAI',
            detail: 'extension snapshot',
            profile: {
              profile: 'openai',
              env: {
                OPENAI_BASE_URL: 'https://api.example.com/v1',
                OPENAI_MODEL: 'gpt-4o',
                OPENAI_API_KEY: 'sk-test',
              },
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    )

    expect(snapshot).not.toBeNull()
    const providers = getProvidersFromSnapshot(snapshot!)
    expect(providers).toHaveLength(1)
    expect(providers[0]?.displayName).toBe('OpenAI')
    expect(providers[0]?.apiKey).toBe('sk-test')
    expect(providers[0]?.defaultModel).toBe('gpt-4o')

    const provider = getProvider('openai', snapshot)
    expect(provider?.profile?.env.OPENAI_BASE_URL).toBe(
      'https://api.example.com/v1',
    )
  })
})
