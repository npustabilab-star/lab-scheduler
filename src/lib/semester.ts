import { supabase } from './supabase'

export type PeriodTimes = Record<number, { start: string; end: string }>

/** Current semester id (null when none is set) and the period start/end times. Throws on query errors. */
export async function loadSemesterAndPeriods(): Promise<{ semesterId: number | null; times: PeriodTimes }> {
  const sem = await supabase.from('semesters').select().eq('is_current', true).maybeSingle()
  if (sem.error) throw new Error(sem.error.message)
  if (!sem.data) return { semesterId: null, times: {} }
  const periods = await supabase.from('periods').select()
  if (periods.error) throw new Error(periods.error.message)
  const times: PeriodTimes = Object.fromEntries(
    (periods.data ?? []).map((p) => [p.period, { start: p.start_time.slice(0, 5), end: p.end_time.slice(0, 5) }]),
  )
  return { semesterId: sem.data.id, times }
}
