import { slotKey } from './grid'

const DAY_MS = 86_400_000

/** Monday of the ISO week containing 'YYYY-MM-DD' (UTC math, no timezone drift) and its ISO weekday (1-7). */
function weekInfo(date: string): { weekStart: string; isodow: number } {
  const [y, m, d] = date.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  const isodow = new Date(t).getUTCDay() || 7
  return { weekStart: new Date(t - (isodow - 1) * DAY_MS).toISOString().slice(0, 10), isodow }
}

/** Group slots by the Monday of their week; cells hold slotKey(isodow, period). Ascending by week. */
export function groupSlotsByWeek(
  slots: { date: string; period: number }[],
): { weekStart: string; cells: Set<string> }[] {
  const weeks = new Map<string, Set<string>>()
  for (const s of slots) {
    const { weekStart, isodow } = weekInfo(s.date)
    const cells = weeks.get(weekStart) ?? new Set<string>()
    cells.add(slotKey(isodow, s.period))
    weeks.set(weekStart, cells)
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, cells]) => ({ weekStart, cells }))
}

/** Taipei wall clock of `now` as 'YYYY-MM-DD HH:MM'. */
function taipeiNow(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  return `${p('year')}-${p('month')}-${p('day')} ${p('hour')}:${p('minute')}`
}

/** The pending/confirmed booking that has not ended yet (display-only mirror of SQL booking_is_upcoming). */
export function activeBooking<B extends { date: string; period: number; status: string }>(
  bookings: B[],
  now: Date,
  periodEnd: Record<number, string>,
): B | null {
  const cur = taipeiNow(now)
  return (
    bookings.find(
      (b) =>
        (b.status === 'pending' || b.status === 'confirmed') &&
        periodEnd[b.period] !== undefined &&
        `${b.date} ${periodEnd[b.period]}` > cur,
    ) ?? null
  )
}

/** 'YYYY-MM-DD' plus n days (UTC math). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export const STATUS_LABEL: Record<string, string> = {
  pending: '待確認',
  confirmed: '已成立',
  rejected: '已婉拒',
  cancelled: '已取消',
  expired: '已逾期',
}

export type BookingRow = {
  id: string
  date: string
  period: number
  note: string
  status: string
  teacher_ok: boolean
  grad_ok: boolean
  reason: string | null
  teacher_id: string
  grad_id: string
  undergrad_id: string
  undergrad: { display_name: string } | null
  teacher: { display_name: string } | null
  grad: { display_name: string } | null
}

export const BOOKING_SELECT =
  '*, undergrad:profiles!bookings_undergrad_id_fkey(display_name), teacher:profiles!bookings_teacher_id_fkey(display_name), grad:profiles!bookings_grad_id_fkey(display_name)'
