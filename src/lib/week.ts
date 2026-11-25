const DAY_MS = 86_400_000
const DOW = ['日', '一', '二', '三', '四', '五', '六']

const parse = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fmt = (t: number): string => new Date(t).toISOString().slice(0, 10)

/** 'YYYY-MM-DD' + n days (UTC date math, no timezone drift). */
export function addDaysStr(date: string, n: number): string {
  return fmt(parse(date) + n * DAY_MS)
}

/** Monday of the week containing `date` and the five dates Mon-Fri (a Sat/Sun belongs to the week that just ended). */
export function weekOf(date: string): { monday: string; days: string[] } {
  const t = parse(date)
  const isodow = new Date(t).getUTCDay() || 7
  const mondayT = t - (isodow - 1) * DAY_MS
  return { monday: fmt(mondayT), days: [0, 1, 2, 3, 4].map((i) => fmt(mondayT + i * DAY_MS)) }
}

/** The Monday "this week" should show: on Sat/Sun that is the coming Monday (no class days left). */
export function thisWeekMonday(today: string): string {
  const { monday } = weekOf(today)
  const isodow = new Date(parse(today)).getUTCDay() || 7
  return isodow >= 6 ? addDaysStr(monday, 7) : monday
}

export const shiftWeek = (monday: string, delta: number): string => addDaysStr(monday, delta * 7)

/** '2026-11-23' -> '2026/11/23（一）～ 11/27（五）' (year repeated on the Friday only when it differs). */
export function weekRangeLabel(monday: string): string {
  const [y, m, d] = monday.split('-').map(Number)
  const fri = addDaysStr(monday, 4)
  const [fy, fm, fd] = fri.split('-').map(Number)
  const end = fy === y ? `${fm}/${fd}` : `${fy}/${fm}/${fd}`
  return `${y}/${m}/${d}（${DOW[new Date(parse(monday)).getUTCDay()]}）～ ${end}（${DOW[new Date(parse(fri)).getUTCDay()]}）`
}

/** '2026-11-23' -> '11/23' */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}`
}

/** Today's date in Asia/Taipei as 'YYYY-MM-DD'. */
export function taipeiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** '08:10:00' -> '08:10' */
export const formatHM = (t: string): string => t.slice(0, 5)
