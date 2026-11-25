import { describe, expect, it } from 'vitest'
import { shiftWeek, taipeiToday, weekOf, weekRangeLabel } from './week'

describe('week helpers', () => {
  it('weekOf a Wednesday', () => {
    expect(weekOf('2026-11-25')).toEqual({
      monday: '2026-11-23',
      days: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'],
    })
  })
  it('weekOf a Sunday belongs to the week that just ended', () => {
    const w = weekOf('2026-11-29')
    expect(w.monday).toBe('2026-11-23')
    expect(w.days[4]).toBe('2026-11-27')
  })
  it('shiftWeek crosses month boundaries both ways', () => {
    expect(shiftWeek('2026-11-23', 1)).toBe('2026-11-30')
    expect(shiftWeek('2026-11-30', 1)).toBe('2026-12-07')
    expect(shiftWeek('2026-12-07', -2)).toBe('2026-11-23')
    expect(shiftWeek('2026-03-02', -1)).toBe('2026-02-23')
  })
  it('weekRangeLabel', () => {
    expect(weekRangeLabel('2026-11-23')).toBe('2026/11/23（一）～ 11/27（五）')
    expect(weekRangeLabel('2026-12-28')).toBe('2026/12/28（一）～ 2027/1/1（五）')
  })
  it('taipeiToday uses Asia/Taipei', () => {
    expect(taipeiToday(new Date('2026-11-25T17:00:00Z'))).toBe('2026-11-26')
    expect(taipeiToday(new Date('2026-11-25T15:59:00Z'))).toBe('2026-11-25')
  })
})
