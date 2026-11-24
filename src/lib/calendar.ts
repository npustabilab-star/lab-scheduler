import type { EventInput } from '@fullcalendar/core'

export type CalendarInput = {
  roster: { date: string; user_id: string; period: number }[]
  names: Map<string, string>
  bookings: { id: string; date: string; period: number; status: string; undergrad_name: string }[]
  periodTimes: Record<number, { start: string; end: string }>
  uncovered: string[]
  noClassDays: { date: string; note: string }[]
}

/** [1,3,4] -> '1,3-4' */
export function formatPeriods(periods: number[]): string {
  const sorted = [...new Set(periods)].sort((a, b) => a - b)
  const runs: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    runs.push(j > i ? `${sorted[i]}-${sorted[j]}` : `${sorted[i]}`)
    i = j + 1
  }
  return runs.join(',')
}

export function toEvents(input: CalendarInput): EventInput[] {
  const events: EventInput[] = []

  const byGradDay = new Map<string, { date: string; user_id: string; periods: number[] }>()
  for (const r of input.roster) {
    const name = input.names.get(r.user_id)
    if (name === undefined) continue
    const key = `${r.date}|${r.user_id}`
    const e = byGradDay.get(key) ?? { date: r.date, user_id: r.user_id, periods: [] }
    e.periods.push(r.period)
    byGradDay.set(key, e)
  }
  for (const e of byGradDay.values()) {
    events.push({
      id: `duty-${e.date}-${e.user_id}`,
      title: `${input.names.get(e.user_id)} ${formatPeriods(e.periods)}節`,
      start: e.date,
      allDay: true,
      className: 'duty',
    })
  }

  for (const b of input.bookings) {
    if (b.status !== 'pending' && b.status !== 'confirmed') continue
    const t = input.periodTimes[b.period]
    if (!t) continue
    events.push({
      id: `booking-${b.id}`,
      title: `會議：${b.undergrad_name}${b.status === 'pending' ? '（待確認）' : ''}`,
      start: `${b.date}T${t.start}`,
      end: `${b.date}T${t.end}`,
      className: b.status === 'pending' ? 'meeting pending' : 'meeting',
    })
  }

  for (const d of input.uncovered) {
    events.push({ id: `uncovered-${d}`, start: d, allDay: true, display: 'background', className: 'uncovered' })
  }
  for (const n of input.noClassDays) {
    events.push({
      id: `noclass-${n.date}`,
      title: n.note,
      start: n.date,
      allDay: true,
      display: 'background',
      className: 'no-class',
    })
  }
  return events
}
