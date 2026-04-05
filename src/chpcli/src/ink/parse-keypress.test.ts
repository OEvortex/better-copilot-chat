import { expect, test } from 'bun:test'

import {
  INITIAL_STATE,
  parseMultipleKeypresses,
  type ParsedKey,
} from './parse-keypress.ts'
import { InputEvent } from './events/input-event.ts'

function parseInputEvent(sequence: string): InputEvent {
  const [items] = parseMultipleKeypresses(INITIAL_STATE, sequence)

  expect(items).toHaveLength(1)

  const item = items[0]
  expect(item?.kind).toBe('key')

  return new InputEvent(item as ParsedKey)
}

test('treats CSI-u modifier 0 as unmodified printable input', () => {
  const event = parseInputEvent('\x1b[47;0u')

  expect(event.input).toBe('/')
  expect(event.key.ctrl).toBe(false)
  expect(event.key.meta).toBe(false)
  expect(event.key.shift).toBe(false)
  expect(event.key.super).toBe(false)
})

test('preserves printable Unicode CSI-u input', () => {
  const event = parseInputEvent('\x1b[231u')

  expect(event.input).toBe('ç')
  expect(event.key.ctrl).toBe(false)
  expect(event.key.meta).toBe(false)
  expect(event.key.shift).toBe(false)
  expect(event.key.super).toBe(false)
})

test('preserves printable Unicode CSI-u input with explicit modifier 0', () => {
  const event = parseInputEvent('\x1b[231;0u')

  expect(event.input).toBe('ç')
  expect(event.key.ctrl).toBe(false)
  expect(event.key.meta).toBe(false)
  expect(event.key.shift).toBe(false)
  expect(event.key.super).toBe(false)
})
