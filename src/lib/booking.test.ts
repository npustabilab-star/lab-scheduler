import { describe, expect, it } from 'vitest'
import { activeBooking, groupSlotsByWeek } from './booking'

const periodEnd = { 3: '11:00', 5: '15:30' }

describe('groupSlotsByWeek', () => {
  it('groups by Monday of the ISO week', () => {
    const g = groupSlotsByWeek([
      { date: '2026-03-09', period: 3 },
      { date: '2026-03-11', period: 5 },
      { date: '2026-03-16', period: 3 },
    ])
    expect(g).toHaveLength(2)
    expect(g[0].weekStart).toBe('2026-03-09')
    expect(g[0].cells).toEqual(new Set(['1-3', '3-5']))
    expect(g[1].weekStart).toBe('2026-03-16')
  })
  it('sorts weeks ascending and handles Sunday-ish edges', () => {
    const g = groupSlotsByWeek([
      { date: '2026-03-16', period: 1 },
      { date: '2026-03-13', period: 2 },
    ])
    expect(g.map((x) => x.weekStart)).toEqual(['2026-03-09', '2026-03-16'])
  })
})

describe('activeBooking', () => {
  const now = new Date('2026-03-02T00:00:00Z')
  it('ignores bookings that already ended', () => {
    expect(activeBooking([{ date: '2026-02-23', period: 3, status: 'confirmed' }], now, periodEnd)).toBeNull()
  })
  it('returns a pending future booking', () => {
    const b = { date: '2026-03-09', period: 3, status: 'pending' }
    expect(activeBooking([b], now, periodEnd)).toBe(b)
  })
  it('ignores closed statuses', () => {
    expect(activeBooking([{ date: '2026-03-09', period: 3, status: 'cancelled' }], now, periodEnd)).toBeNull()
  })
  it('compares in Asia/Taipei wall clock', () => {
    const b = { date: '2026-03-09', period: 3, status: 'confirmed' }
    // 02:59Z = 10:59 Taipei -> still active; 03:01Z = 11:01 Taipei -> over
    expect(activeBooking([b], new Date('2026-03-09T02:59:00Z'), periodEnd)).toBe(b)
    expect(activeBooking([b], new Date('2026-03-09T03:01:00Z'), periodEnd)).toBeNull()
  })
})
