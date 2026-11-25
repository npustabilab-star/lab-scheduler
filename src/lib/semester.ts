import type { PeriodInfo } from './grid'
import { supabase } from './supabase'

export type PeriodTimes = Record<number, { start: string; end: string }>

type Loaded = {
  semesterId: number | null
  semester: { start_date: string; end_date: string } | null
  times: PeriodTimes
  /** Rows ordered by start time (e.g. 1,2,3,4,8,5,6,7), each with its display label. */
  periods: (PeriodInfo & { start: string; end: string })[]
  labels: Record<number, string>
}

/** Current semester (null when none is set) and the periods ordered by start time. Throws on query errors. */
export async function loadSemesterAndPeriods(): Promise<Loaded> {
  const [sem, per] = await Promise.all([
    supabase.from('semesters').select().eq('is_current', true).maybeSingle(),
    supabase.from('periods').select().order('start_time'),
  ])
  if (sem.error) throw new Error(sem.error.message)
  if (per.error) throw new Error(per.error.message)
  const periods: (PeriodInfo & { start: string; end: string })[] = (per.data ?? [])
    .map((p) => ({
      period: p.period,
      label: p.label,
      start: p.start_time.slice(0, 5),
      end: p.end_time.slice(0, 5),
    }))
    .sort((a, b) => a.start.localeCompare(b.start))
  const times: PeriodTimes = Object.fromEntries(periods.map((p) => [p.period, { start: p.start, end: p.end }]))
  const labels = Object.fromEntries(periods.map((p) => [p.period, p.label]))
  const semester = sem.data ? { start_date: sem.data.start_date, end_date: sem.data.end_date } : null
  return { semesterId: sem.data?.id ?? null, semester, times, periods, labels }
}
