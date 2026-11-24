import { describe, expect, it } from 'vitest'
import { buildMasterGrid, formatSlotLabel, slotKey, uncoveredWeekdays } from './grid'

describe('grid helpers', () => {
  it('slotKey', () => expect(slotKey(1, 3)).toBe('1-3'))
  it('formatSlotLabel', () => {
    expect(formatSlotLabel('2026-03-09', 3)).toBe('3/9（一）第3節')
    expect(formatSlotLabel('2026-03-15', 8)).toBe('3/15（日）第8節')
  })
})

describe('master grid', () => {
  const slots = [
    { user_id: 'A', weekday: 1, period: 3 },
    { user_id: 'B', weekday: 1, period: 3 },
    { user_id: 'B', weekday: 2, period: 5 },
    { user_id: 'T', weekday: 4, period: 1 },
  ]
  const names = new Map([
    ['A', '阿文'],
    ['B', '小華'],
  ])
  it('buildMasterGrid groups names, sorted, excluding non-grads', () => {
    const g = buildMasterGrid(slots, names)
    expect(g.get('1-3')).toEqual(['小華', '阿文'])
    expect(g.get('2-5')).toEqual(['小華'])
    expect(g.has('4-1')).toBe(false)
  })
  it('uncoveredWeekdays ignores non-grads', () => {
    expect(uncoveredWeekdays(slots, new Set(['A', 'B']))).toEqual([3, 4, 5])
  })
})
