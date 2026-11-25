export const WEEKDAYS = [1, 2, 3, 4, 5] as const
export type PeriodInfo = { period: number; label: string; start?: string; end?: string }

/** Period 8 is the (bookable) lunch slot 午休; periods 1-7 are 第N節. */
export const LUNCH_PERIOD = 8
export const periodLabel = (period: number): string => (period === LUNCH_PERIOD ? '午休' : `第${period}節`)

/** Fallback row order (by start time) before the periods table has loaded. */
export const DEFAULT_PERIODS: PeriodInfo[] = [1, 2, 3, 4, 8, 5, 6, 7].map((p) => ({ period: p, label: periodLabel(p) }))
export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五']

export const slotKey = (weekday: number, period: number): string => `${weekday}-${period}`

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

/** '2026-03-09', 3 -> '3/9（一）第3節'; with labels {8:'午休'} -> '3/9（一）午休' (no timezone drift: parsed from parts). */
export function formatSlotLabel(date: string, period: number, labels?: Record<number, string>): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${m}/${d}（${DAY_NAMES[dow]}）${labels?.[period] ?? periodLabel(period)}`
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
export function formatMasterSelection(weekday: number, period: number, names: string[], label = periodLabel(period)): string {
  return `週${WEEKDAY_LABELS[weekday - 1]} ${label}：${names.length ? names.join('、') : '沒有人'}`
}
