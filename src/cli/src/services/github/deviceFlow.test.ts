import { afterEach, describe, expect, mock, test } from 'bun:test'

import {
  GitHubDeviceFlowError,
  pollAccessToken,
  requestDeviceCode,
} from './deviceFlow.js'

describe('requestDeviceCode', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('parses successful device code response', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            device_code: 'abc',
            user_code: 'ABCD-1234',
            verification_uri: 'https://github.com/login/device',
            expires_in: 600,
            interval: 5,
          }),
          { status: 200 },
        ),
      ),
    )

    const r = await requestDeviceCode({
      clientId: 'test-client',
      fetchImpl: globalThis.fetch,
    })
    expect(r.device_code).toBe('abc')
    expect(r.user_code).toBe('ABCD-1234')
    expect(r.verification_uri).toBe('https://github.com/login/device')
    expect(r.expires_in).toBe(600)
    expect(r.interval).toBe(5)
  })

  test('throws on HTTP error', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('bad', { status: 500 })),
    )
    await expect(
      requestDeviceCode({ clientId: 'x', fetchImpl: globalThis.fetch }),
    ).rejects.toThrow(GitHubDeviceFlowError)
  })
})

describe('pollAccessToken', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('returns token when GitHub responds with access_token immediately', async () => {
    let calls = 0
    globalThis.fetch = mock(() => {
      calls++
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: 'tok-xyz' }), {
          status: 200,
        }),
      )
    })

    const token = await pollAccessToken('dev-code', {
      clientId: 'cid',
      fetchImpl: globalThis.fetch,
    })
    expect(token).toBe('tok-xyz')
    expect(calls).toBe(1)
  })

  test('throws on access_denied', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'access_denied' }), {
          status: 200,
        }),
      ),
    )
    await expect(
      pollAccessToken('dc', {
        clientId: 'c',
        fetchImpl: globalThis.fetch,
      }),
    ).rejects.toThrow(/denied/)
  })
})
