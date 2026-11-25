import { describe, expect, it } from 'vitest'
import { buildWeekCells, cellKey } from './calendar'

const base = {
  roster: [] as { date: string; user_id: string; period: number }[],
  names: new Map<string, string>(),
  bookings: [] as { id: string; date: string; period: number; status: string; undergrad_name: string }[],
}

describe('buildWeekCells', () => {
  it('groups grads per date and period, sorted, skipping unknown ids', () => {
    const cells = buildWeekCells({
      ...base,
      names: new Map([
        ['a', '阿文'],
        ['b', '小華'],
      ]),
      roster: [
        { date: '2026-11-23', user_id: 'a', period: 3 },
        { date: '2026-11-23', user_id: 'b', period: 3 },
        { date: '2026-11-23', user_id: 'x', period: 3 },
        { date: '2026-11-24', user_id: 'a', period: 5 },
      ],
    })
    expect(cells.get(cellKey('2026-11-23', 3))?.names).toEqual(['小華', '阿文'])
    expect(cells.get(cellKey('2026-11-24', 5))?.names).toEqual(['阿文'])
    expect(cells.has(cellKey('2026-11-24', 3))).toBe(false)
  })

  it('labels meetings and marks pending; ignores other statuses', () => {
    const cells = buildWeekCells({
      ...base,
      bookings: [
        { id: '1', date: '2026-11-25', period: 3, status: 'pending', undergrad_name: '王小美' },
        { id: '2', date: '2026-11-25', period: 3, status: 'confirmed', undergrad_name: '李大華' },
        { id: '3', date: '2026-11-25', period: 3, status: 'cancelled', undergrad_name: '張三' },
      ],
    })
    expect(cells.get(cellKey('2026-11-25', 3))?.meetings).toEqual(['會議：王小美（待確認）', '會議：李大華'])
  })
})

describe('buildWeekCells 主值', () => {
  it('stars the lead for that weekday and period and lists them first', () => {
    const cells = buildWeekCells({
      roster: [
        { date: '2026-03-02', user_id: 'a', period: 3 },
        { date: '2026-03-02', user_id: 'b', period: 3 },
      ],
      names: new Map([['a', '甲'], ['b', '乙']]),
      bookings: [],
      leads: new Map([['1|3', 'b']]),
    })
    expect(cells.get(cellKey('2026-03-02', 3))?.names).toEqual(['★乙', '甲'])
  })
})
