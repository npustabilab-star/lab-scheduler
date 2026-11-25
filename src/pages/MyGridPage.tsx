import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import ImpactDialog from '../components/ImpactDialog'
import WeekGrid from '../components/WeekGrid'
import WeekNav from '../components/WeekNav'
import { useTableChanges } from '../hooks/useTableChanges'
import { clearDaySlot, setDaySlot, setWeeklySlot } from '../lib/api'
import { runWithImpact } from '../lib/changes'
import { formatSlotLabel, slotKey } from '../lib/grid'
import type { PeriodInfo } from '../lib/grid'
import { createLatestOnly } from '../lib/latestOnly'
import { loadSemesterAndPeriods } from '../lib/semester'
import { supabase } from '../lib/supabase'
import type { AffectedBooking, ChangeResult } from '../lib/supabase'
import { shiftWeek, taipeiToday, thisWeekMonday, weekOf } from '../lib/week'

type Pending = { affected: AffectedBooking[]; resolve: (ok: boolean) => void }
type Exc = { date: string; period: number | null; kind: string }
type Picked = { w: number; p: number; date: string }
type Semester = { start_date: string; end_date: string }

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const btn = 'block w-full rounded border px-3 py-2'

export default function MyGridPage() {
  const { profile } = useAuth()
  const [monday, setMonday] = useState(() => thisWeekMonday(taipeiToday()))
  const [loaded, setLoaded] = useState(false)
  const [semester, setSemester] = useState<Semester | null>(null)
  const [template, setTemplate] = useState<Set<string>>(new Set())
  const [leadSlots, setLeadSlots] = useState<Set<string>>(new Set())
  const [exceptions, setExceptions] = useState<Exc[]>([])
  const [noClass, setNoClass] = useState<Map<string, string>>(new Map())
  const [periods, setPeriods] = useState<PeriodInfo[]>([])
  const [labels, setLabels] = useState<Record<number, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const busy = useRef(false)
  const beginLoad = useRef(createLatestOnly()).current
  const { days } = weekOf(monday)
  const today = taipeiToday()

  const load = useCallback(async () => {
    if (!profile) return
    const isCurrent = beginLoad()
    try {
      const { semesterId, semester: sem, periods, labels } = await loadSemesterAndPeriods()
      if (!isCurrent()) return
      if (!semesterId || !sem) {
        setSemester(null)
        setLoadError(null)
        return
      }
      const wk = weekOf(monday).days
      const [from, to] = [wk[0], wk[4]]
      const [slots, exc, nc, leads] = await Promise.all([
        supabase.from('weekly_slots').select().eq('user_id', profile.id).eq('semester_id', semesterId),
        supabase.from('slot_exceptions').select().eq('user_id', profile.id).gte('date', from).lte('date', to),
        supabase.from('no_class_days').select().gte('date', from).lte('date', to),
        supabase.from('duty_leads').select().eq('user_id', profile.id).eq('semester_id', semesterId),
      ])
      if (!isCurrent()) return
      for (const r of [slots, exc, nc, leads]) if (r.error) throw new Error(r.error.message)
      setSemester(sem)
      setTemplate(new Set((slots.data ?? []).map((s) => slotKey(s.weekday, s.period))))
      setLeadSlots(new Set((leads.data ?? []).map((l) => slotKey(l.weekday, l.period))))
      setExceptions((exc.data ?? []).map((x) => ({ date: x.date, period: x.period, kind: x.kind })))
      setNoClass(new Map((nc.data ?? []).map((n) => [n.date, n.note])))
      setPeriods(periods)
      setLabels(labels)
      setLoadError(null)
    } catch (e) {
      if (isCurrent()) setLoadError(errMsg(e))
    } finally {
      if (isCurrent()) setLoaded(true)
    }
  }, [profile, beginLoad, monday])

  useEffect(() => {
    void load()
  }, [load])
  useTableChanges(['duty_leads', 'weekly_slots', 'slot_exceptions', 'no_class_days'], () => void load())

  const ask = (affected: AffectedBooking[]) => new Promise<boolean>((resolve) => setPending({ affected, resolve }))
  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  const cell = (w: number, p: number) => {
    const date = days[w - 1]
    const inTemplate = template.has(slotKey(w, p))
    const inSemester = !!semester && date >= semester.start_date && date <= semester.end_date
    const wholeDayOff = exceptions.some((x) => x.date === date && x.period === null)
    const ex = exceptions.find((x) => x.date === date && x.period === p)
    let effective = inSemester && inTemplate
    if (ex?.kind === 'off') effective = false
    if (ex?.kind === 'extra' && inSemester) effective = true
    if (wholeDayOff || noClass.has(date)) effective = false
    const editable = inSemester && date >= today && !noClass.has(date)
    return { date, effective, adjusted: inSemester && !noClass.has(date) && effective !== inTemplate, wholeDayOff, editable }
  }

  const act = async (fn: () => Promise<ChangeResult | null>) => {
    if (busy.current) return
    busy.current = true
    setActionError(null)
    setPicked(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setActionError(errMsg(e))
    } finally {
      busy.current = false
    }
  }

  const title = profile?.role === 'teacher' ? '我的可約時段' : '我的值班'
  const dayNotes = Object.fromEntries(days.flatMap((d, i) => (noClass.has(d) ? [[i + 1, noClass.get(d) || '停課']] : [])))
  const greyDays = days.flatMap((d, i) => (noClass.has(d) ? [i + 1] : []))
  const sel = picked ? cell(picked.w, picked.p) : null

  if (!loaded) return <p className="p-4">載入中…</p>
  return (
    <div className="p-2">
      <h1 className="mb-2 text-xl font-bold">{title}</h1>
      {loadError && (
        <p role="alert" className="mb-2 rounded bg-red-100 p-2 text-sm text-red-700">
          {loadError}
        </p>
      )}
      {actionError && (
        <p role="alert" className="mb-2 rounded bg-red-100 p-2 text-sm text-red-700">
          {actionError}
        </p>
      )}
      <WeekNav
        monday={monday}
        onPrev={() => setMonday((m) => shiftWeek(m, -1))}
        onToday={() => setMonday(thisWeekMonday(taipeiToday()))}
        onNext={() => setMonday((m) => shiftWeek(m, 1))}
      />
      {!semester ? (
        <p>管理者尚未設定學期</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
            <WeekGrid
              periods={periods.length ? periods : undefined}
              days={days}
              dayNotes={dayNotes}
              greyWeekdays={greyDays}
              isOn={(w, p) => cell(w, p).effective}
              isDisabled={(w, p) => !cell(w, p).editable}
              onToggle={(w, p) => setPicked({ w, p, date: days[w - 1] })}
              cells={(w, p) => {
                const c = cell(w, p)
                return (
                  <>
                    {c.effective ? (leadSlots.has(slotKey(w, p)) ? '★ 主值' : '✓') : null}
                    {c.adjusted && (
                      <span className="block text-[10px] leading-tight text-orange-700">本週調整</span>
                    )}
                  </>
                )
              }}
            />
          </div>
        </div>
      )}
      {picked && sel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="slot-title"
            className="w-full max-w-sm rounded bg-white p-4 shadow"
          >
            <h2 id="slot-title" className="mb-1 text-lg font-bold">
              {formatSlotLabel(picked.date, picked.p, labels)}
            </h2>
            <p className="mb-3 text-sm text-gray-600">
              目前：{sel.effective ? '可以上班' : '不行'}
              {sel.adjusted ? '（本週調整）' : ''}
            </p>
            <div className="mb-3 space-y-2">
              {sel.effective ? (
                <>
                  <button
                    type="button"
                    className={`${btn} bg-blue-600 text-white`}
                    onClick={() =>
                      void act(() => runWithImpact((c) => setDaySlot(picked.date, picked.p, false, c), ask))
                    }
                  >
                    只有這週不行
                  </button>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => void act(() => runWithImpact((c) => setWeeklySlot(picked.w, picked.p, false, c, picked.date), ask))}
                  >
                    每週這節都不行
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`${btn} bg-blue-600 text-white`}
                    onClick={() =>
                      void act(() => runWithImpact((c) => setDaySlot(picked.date, picked.p, true, c), ask))
                    }
                  >
                    只有這週可以
                  </button>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => void act(() => runWithImpact((c) => setWeeklySlot(picked.w, picked.p, true, c, picked.date), ask))}
                  >
                    每週這節都可以
                  </button>
                </>
              )}
              {sel.adjusted && !sel.wholeDayOff && (
                <button
                  type="button"
                  className={btn}
                  onClick={() => void act(() => runWithImpact((c) => clearDaySlot(picked.date, picked.p, c), ask))}
                >
                  恢復成每週固定
                </button>
              )}
            </div>
            <div className="flex justify-end">
              <button type="button" className="rounded border px-3 py-1" onClick={() => setPicked(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {pending && (
        <ImpactDialog affected={pending.affected} labels={labels} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
      )}
    </div>
  )
}
