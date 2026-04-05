import { expect, test } from 'bun:test'

import { isLocalProviderUrl } from './providerConfig.js'

test('treats localhost endpoints as local', () => {
  expect(isLocalProviderUrl('http://localhost:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://127.0.0.1:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://0.0.0.0:11434/v1')).toBe(true)
  // Full 127.0.0.0/8 loopback range should be treated as local
  expect(isLocalProviderUrl('http://127.0.0.2:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://127.1.2.3:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://127.255.255.255:11434/v1')).toBe(true)
})

test('treats private IPv4 endpoints as local', () => {
  expect(isLocalProviderUrl('http://10.0.0.1:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://172.16.0.1:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://192.168.0.1:11434/v1')).toBe(true)
})

test('treats .local hostnames as local', () => {
  expect(isLocalProviderUrl('http://ollama.local:11434/v1')).toBe(true)
})

test('treats private IPv6 endpoints as local', () => {
  expect(isLocalProviderUrl('http://[fd00::1]:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://[fe80::1]:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://[::1]:11434/v1')).toBe(true)
})

test('treats public hosts as remote', () => {
  expect(isLocalProviderUrl('http://203.0.113.1:11434/v1')).toBe(false)
  expect(isLocalProviderUrl('https://example.com/v1')).toBe(false)
  expect(isLocalProviderUrl('http://[2001:4860:4860::8888]:11434/v1')).toBe(false)
})
