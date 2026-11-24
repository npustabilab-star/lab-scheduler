import { describe, expect, it } from 'vitest'
import { toEvents } from './calendar'

const base = {
  roster: [] as { date: string; user_id: string; period: number }[],
  names: new Map<string, string>(),
  bookings: [] as { id: string; date: string; period: number; status: string; undergrad_name: string }[],
  periodTimes: { 3: { start: '10:10', end: '11:00' } } as Record<number, { start: string; end: string }>,
  uncovered: [] as string[],
  noClassDays: [] as { date: string; note: string }[],
}

describe('toEvents', () => {
  it('merges consecutive periods per grad per day into an all-day event', () => {
    const ev = toEvents({
      ...base,
      names: new Map([['u1', '阿文']]),
      roster: [1, 3, 4].map((period) => ({ date: '2026-03-02', user_id: 'u1', period })),
    })
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ title: '阿文 1,3-4節', allDay: true, start: '2026-03-02' })
  })

  it('makes a timed meeting event, marking pending', () => {
    const ev = toEvents({
      ...base,
      bookings: [{ id: 'b1', date: '2026-03-09', period: 3, status: 'pending', undergrad_name: '王小美' }],
    })
    expect(ev[0]).toMatchObject({
      title: '會議：王小美（待確認）',
      start: '2026-03-09T10:10',
      end: '2026-03-09T11:00',
    })
  })

  it('does not mark confirmed meetings', () => {
    const ev = toEvents({
      ...base,
      bookings: [{ id: 'b1', date: '2026-03-09', period: 3, status: 'confirmed', undergrad_name: '王小美' }],
    })
    expect(ev[0].title).toBe('會議：王小美')
  })

  it('makes background events for uncovered and no-class days', () => {
    const ev = toEvents({ ...base, uncovered: ['2026-03-03'], noClassDays: [{ date: '2026-03-04', note: '校慶' }] })
    expect(ev[0]).toMatchObject({ display: 'background', className: 'uncovered', start: '2026-03-03' })
    expect(ev[1]).toMatchObject({ display: 'background', className: 'no-class', title: '校慶', start: '2026-03-04' })
  })
})
