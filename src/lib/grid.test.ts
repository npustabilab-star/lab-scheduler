import { describe, expect, it } from 'vitest'
import { formatSlotLabel, slotKey } from './grid'

describe('grid helpers', () => {
  it('slotKey', () => expect(slotKey(1, 3)).toBe('1-3'))
  it('formatSlotLabel', () => {
    expect(formatSlotLabel('2026-03-09', 3)).toBe('3/9（一）第3節')
    expect(formatSlotLabel('2026-03-15', 8)).toBe('3/15（日）第8節')
  })
})
