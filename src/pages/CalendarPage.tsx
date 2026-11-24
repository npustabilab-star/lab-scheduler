import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DatesSetArg, EventInput } from '@fullcalendar/core'
import zhTw from '@fullcalendar/core/locales/zh-tw'
import { useAuth } from '../auth/AuthProvider'
import ImpactDialog from '../components/ImpactDialog'
import { useTableChanges } from '../hooks/useTableChanges'
import { addException, removeException, roster, uncoveredDays } from '../lib/api'
import { toEvents } from '../lib/calendar'
import { runWithImpact } from '../lib/changes'
import { createLatestOnly } from '../lib/latestOnly'
import { PERIODS } from '../lib/grid'
import { loadSemesterAndPeriods } from '../lib/semester'
import { supabase } from '../lib/supabase'
import type { AffectedBooking } from '../lib/supabase'

type Range = { from: string; to: string }
type Pending = { affected: AffectedBooking[]; resolve: (ok: boolean) => void }
type Exception = { date: string; period: number | null }

const pad = (n: number) => String(n).padStart(2, '0')
/** Local calendar date -> 'YYYY-MM-DD' (no UTC conversion, so no timezone drift). */
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const lastDay = (endExclusive: Date) => ymd(new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1))
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function CalendarPage() {
  const { profile } = useAuth()
  const canAbsent = profile?.role === 'teacher' || profile?.role === 'grad'
  const [range, setRange] = useState<Range | null>(null)
  const [events, setEvents] = useState<EventInput[]>([])
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [error, setError] = useState<string | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [period, setPeriod] = useState<number>(1)
  const [pending, setPending] = useState<Pending | null>(null)
  const busy = useRef(false)
  const beginLoad = useRef(createLatestOnly()).current
  const narrow = useMemo(() => typeof window !== 'undefined' && window.innerWidth < 640, [])

  const load = useCallback(async () => {
    if (!range || !profile) return
    const isCurrent = beginLoad()
    try {
      const [{ times }, rows, uncovered, gradRes, bookRes, ncRes, exRes] = await Promise.all([
        loadSemesterAndPeriods(),
        roster(range.from, range.to),
        uncoveredDays(range.from, range.to),
        supabase.from('profiles').select().eq('role', 'grad').eq('status', 'active'),
        supabase
          .from('bookings')
          .select('id,date,period,status, undergrad:profiles!bookings_undergrad_id_fkey(display_name)')
          .gte('date', range.from)
          .lte('date', range.to)
          .in('status', ['pending', 'confirmed']),
        supabase.from('no_class_days').select().gte('date', range.from).lte('date', range.to),
        supabase.from('slot_exceptions').select().eq('user_id', profile.id).gte('date', range.from).lte('date', range.to),
      ])
      if (!isCurrent()) return
      for (const r of [gradRes, bookRes, ncRes, exRes]) if (r.error) throw new Error(r.error.message)
      const names = new Map((gradRes.data ?? []).map((g) => [g.id, g.display_name]))
      const bookings = (bookRes.data ?? []).map((b) => ({
        id: b.id,
        date: b.date,
        period: b.period,
        status: b.status,
        undergrad_name: (b.undergrad as { display_name: string } | null)?.display_name ?? '',
      }))
      setEvents(toEvents({ roster: rows, names, bookings, periodTimes: times, uncovered, noClassDays: ncRes.data ?? [] }))
      setExceptions((exRes.data ?? []).map((x) => ({ date: x.date, period: x.period })))
      setError(null)
    } catch (e) {
      if (isCurrent()) setError(errMsg(e))
    }
  }, [range, profile, beginLoad])

  useEffect(() => {
    void load()
  }, [load])
  useTableChanges(['weekly_slots', 'slot_exceptions', 'bookings', 'no_class_days'], () => void load())

  const onDatesSet = (arg: DatesSetArg) => {
    const next = { from: ymd(arg.start), to: lastDay(arg.end) }
    setRange((cur) => (cur && cur.from === next.from && cur.to === next.to ? cur : next))
  }

  const ask = (affected: AffectedBooking[]) => new Promise<boolean>((resolve) => setPending({ affected, resolve }))
  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  const act = async (fn: () => Promise<unknown>) => {
    if (busy.current) return
    busy.current = true
    setError(null)
    try {
      await fn()
      setDay(null)
      await load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      busy.current = false
    }
  }

  const dayExceptions = exceptions.filter((x) => x.date === day)

  return (
    <div className="p-2">
      <h1 className="mb-2 text-xl font-bold">行事曆</h1>
      {error && (
        <p role="alert" className="mb-2 rounded bg-red-100 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={narrow ? 'timeGridWeek' : 'dayGridMonth'}
        locales={[zhTw]}
        locale="zh-tw"
        weekends={false}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
        height="auto"
        events={events}
        datesSet={onDatesSet}
        dateClick={canAbsent ? (a) => setDay(a.dateStr.slice(0, 10)) : undefined}
        slotMinTime="08:00:00"
        slotMaxTime="19:00:00"
        eventDisplay="block"
      />
      {day && canAbsent && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="absence-title" className="w-full max-w-sm rounded bg-white p-4 shadow">
            <h2 id="absence-title" className="mb-2 text-lg font-bold">
              {day} 請假
            </h2>
            <div className="mb-3 space-y-2">
              <button
                type="button"
                className="block w-full rounded bg-blue-600 px-3 py-2 text-white"
                onClick={() => void act(() => runWithImpact((c) => addException(day, null, c), ask))}
              >
                這天我不在：整天
              </button>
              <div className="flex gap-2">
                <select
                  aria-label="節次"
                  className="rounded border px-2"
                  value={period}
                  onChange={(e) => setPeriod(Number(e.target.value))}
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      第 {p} 節
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="flex-1 rounded bg-blue-600 px-3 py-2 text-white"
                  onClick={() => void act(() => runWithImpact((c) => addException(day, period, c), ask))}
                >
                  這節我不在
                </button>
              </div>
              {dayExceptions.map((x) => (
                <button
                  key={x.period ?? 'all'}
                  type="button"
                  className="block w-full rounded border px-3 py-2"
                  onClick={() => void act(() => removeException(day, x.period))}
                >
                  取消請假（{x.period === null ? '整天' : `第 ${x.period} 節`}）
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button type="button" className="rounded border px-3 py-1" onClick={() => setDay(null)}>
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
      {pending && (
        <ImpactDialog affected={pending.affected} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
      )}
    </div>
  )
}
