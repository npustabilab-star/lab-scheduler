import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WeekGrid from '../components/WeekGrid'
import WeekNav from '../components/WeekNav'
import { useTableChanges } from '../hooks/useTableChanges'
import { roster, uncoveredDays } from '../lib/api'
import { buildWeekCells, cellKey } from '../lib/calendar'
import type { CellContent } from '../lib/calendar'
import { createLatestOnly } from '../lib/latestOnly'
import type { PeriodInfo } from '../lib/grid'
import { loadSemesterAndPeriods } from '../lib/semester'
import { supabase } from '../lib/supabase'
import { shiftWeek, taipeiToday, weekOf } from '../lib/week'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function CalendarPage() {
  const [monday, setMonday] = useState(() => weekOf(taipeiToday()).monday)
  const [cells, setCells] = useState<Map<string, CellContent>>(new Map())
  const [periods, setPeriods] = useState<PeriodInfo[]>([])
  const [uncovered, setUncovered] = useState<string[]>([])
  const [noClass, setNoClass] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const beginLoad = useRef(createLatestOnly()).current
  const days = useMemo(() => weekOf(monday).days, [monday])

  const load = useCallback(async () => {
    const isCurrent = beginLoad()
    const [from, to] = [days[0], days[4]]
    try {
      const [{ periods }, rows, unc, gradRes, bookRes, ncRes] = await Promise.all([
        loadSemesterAndPeriods(),
        roster(from, to),
        uncoveredDays(from, to),
        supabase.from('profiles').select().eq('role', 'grad').eq('status', 'active'),
        supabase
          .from('bookings')
          .select('id,date,period,status, undergrad:profiles!bookings_undergrad_id_fkey(display_name)')
          .gte('date', from)
          .lte('date', to)
          .in('status', ['pending', 'confirmed']),
        supabase.from('no_class_days').select().gte('date', from).lte('date', to),
      ])
      if (!isCurrent()) return
      for (const r of [gradRes, bookRes, ncRes]) if (r.error) throw new Error(r.error.message)
      const names = new Map((gradRes.data ?? []).map((g) => [g.id, g.display_name]))
      const bookings = (bookRes.data ?? []).map((b) => ({
        id: b.id,
        date: b.date,
        period: b.period,
        status: b.status,
        undergrad_name: (b.undergrad as { display_name: string } | null)?.display_name ?? '',
      }))
      setCells(buildWeekCells({ roster: rows, names, bookings }))
      setPeriods(periods)
      setUncovered(unc)
      setNoClass(new Map((ncRes.data ?? []).map((n) => [n.date, n.note])))
      setError(null)
    } catch (e) {
      if (isCurrent()) setError(errMsg(e))
    }
  }, [days, beginLoad])

  useEffect(() => {
    void load()
  }, [load])
  useTableChanges(['weekly_slots', 'slot_exceptions', 'bookings', 'no_class_days'], () => void load())

  const weekdayOf = (dates: string[]) => days.flatMap((d, i) => (dates.includes(d) ? [i + 1] : []))
  const greyWeekdays = weekdayOf([...noClass.keys()])
  const redWeekdays = weekdayOf(uncovered).filter((w) => !greyWeekdays.includes(w))
  const dayNotes = Object.fromEntries(greyWeekdays.map((w) => [w, noClass.get(days[w - 1]) || '停課']))

  return (
    <div className="p-2">
      <h1 className="mb-2 text-xl font-bold">行事曆</h1>
      {error && (
        <p role="alert" className="mb-2 rounded bg-red-100 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <WeekNav
        monday={monday}
        onPrev={() => setMonday((m) => shiftWeek(m, -1))}
        onToday={() => setMonday(weekOf(taipeiToday()).monday)}
        onNext={() => setMonday((m) => shiftWeek(m, 1))}
      />
      <div className="overflow-x-auto" data-testid="calendar-scroll">
        <div className="min-w-[640px]">
          <WeekGrid
            days={days}
            periods={periods.length ? periods : undefined}
            greyWeekdays={greyWeekdays}
            highlightWeekdays={redWeekdays}
            dayNotes={dayNotes}
            cells={(w, p) => {
              const c = cells.get(cellKey(days[w - 1], p))
              if (!c) return null
              return (
                <div className="space-y-0.5 py-0.5 text-xs leading-tight">
                  {c.names.length > 0 && <div>{c.names.join('、')}</div>}
                  {c.meetings.map((m) => (
                    <div key={m} className="rounded bg-blue-100 px-1 text-blue-800">
                      {m}
                    </div>
                  ))}
                </div>
              )
            }}
          />
        </div>
      </div>
    </div>
  )
}
