export type CalendarInput = {
  roster: { date: string; user_id: string; period: number }[]
  names: Map<string, string>
  /** weekday|period -> user id of the 主值 (shown with ★). */
  leads?: Map<string, string>
  bookings: { id: string; date: string; period: number; status: string; undergrad_name: string }[]
}

export type CellContent = { names: string[]; meetings: string[] }

export const cellKey = (date: string, period: number): string => `${date}|${period}`

/** (date, period) -> grads present (sorted, only ids in `names`) and meeting labels ('會議：姓名', pending marked). */
export function buildWeekCells(input: CalendarInput): Map<string, CellContent> {
  const cells = new Map<string, CellContent>()
  const get = (k: string) => {
    let c = cells.get(k)
    if (!c) cells.set(k, (c = { names: [], meetings: [] }))
    return c
  }
  for (const r of input.roster) {
    const name = input.names.get(r.user_id)
    if (name === undefined) continue
    const [y, m, d] = r.date.split('-').map(Number)
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    const isLead = input.leads?.get(`${weekday}|${r.period}`) === r.user_id
    get(cellKey(r.date, r.period)).names.push(isLead ? `★${name}` : name)
  }
  for (const b of input.bookings) {
    if (b.status !== 'pending' && b.status !== 'confirmed') continue
    get(cellKey(b.date, b.period)).meetings.push(`會議：${b.undergrad_name}${b.status === 'pending' ? '（待確認）' : ''}`)
  }
  const plain = (n: string) => n.replace(/^★/, '')
  for (const c of cells.values())
    c.names.sort((a, b) => Number(b.startsWith('★')) - Number(a.startsWith('★')) || plain(a).localeCompare(plain(b), 'zh-Hant'))
  return cells
}
