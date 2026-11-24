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
