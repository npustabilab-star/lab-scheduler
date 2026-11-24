export const WEEKDAYS = [1, 2, 3, 4, 5] as const
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const
export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五']

export const slotKey = (weekday: number, period: number): string => `${weekday}-${period}`

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

/** '2026-03-09', 3 -> '3/9（一）第3節' (no timezone drift: parsed from parts). */
export function formatSlotLabel(date: string, period: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${m}/${d}（${DAY_NAMES[dow]}）第${period}節`
}

/** slotKey -> grad names (sorted). Only user ids present in `names` are counted. */
export function buildMasterGrid(
  slots: { user_id: string; weekday: number; period: number }[],
  names: Map<string, string>,
): Map<string, string[]> {
  const grid = new Map<string, string[]>()
  for (const s of slots) {
    const name = names.get(s.user_id)
    if (name === undefined) continue
    const key = slotKey(s.weekday, s.period)
    const list = grid.get(key) ?? []
    list.push(name)
    grid.set(key, list)
  }
  for (const list of grid.values()) list.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return grid
}

/** Weekdays (1-5) on which no grad in `gradIds` has any slot. */
export function uncoveredWeekdays(slots: { user_id: string; weekday: number }[], gradIds: Set<string>): number[] {
  const covered = new Set(slots.filter((s) => gradIds.has(s.user_id)).map((s) => s.weekday))
  return WEEKDAYS.filter((w) => !covered.has(w))
}

/** '週一 第3節：小華、阿文' (or '…：沒有人'). */
export function formatMasterSelection(weekday: number, period: number, names: string[]): string {
  return `週${WEEKDAY_LABELS[weekday - 1]} 第${period}節：${names.length ? names.join('、') : '沒有人'}`
}
