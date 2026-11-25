import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import WeekGrid from '../components/WeekGrid'
import { useTableChanges } from '../hooks/useTableChanges'
import { setDutyLead } from '../lib/api'
import type { PeriodInfo } from '../lib/grid'
import { WEEKDAY_LABELS, periodLabel, slotKey, uncoveredWeekdays } from '../lib/grid'
import { createLatestOnly } from '../lib/latestOnly'
import { loadSemesterAndPeriods } from '../lib/semester'
import { supabase } from '../lib/supabase'

type Slot = { user_id: string; weekday: number; period: number }
type Person = { id: string; name: string; teacher: boolean }

export default function MasterPage() {
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  const [loaded, setLoaded] = useState(false)
  const [hasSemester, setHasSemester] = useState(true)
  const [slots, setSlots] = useState<Slot[]>([])
  const [people, setPeople] = useState<Map<string, Person>>(new Map())
  const [leads, setLeads] = useState<Map<string, string>>(new Map())
  const [periods, setPeriods] = useState<PeriodInfo[]>([])
  const [labels, setLabels] = useState<Record<number, string>>({})
  const [semesterName, setSemesterName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ w: number; p: number } | null>(null)

  const beginLoad = useRef(createLatestOnly()).current

  const load = useCallback(async () => {
    const isCurrent = beginLoad()
    try {
      const { semesterId, semesterName, periods, labels } = await loadSemesterAndPeriods()
      setSemesterName(semesterName ?? '')
      if (!isCurrent()) return
      if (!semesterId) {
        setHasSemester(false)
        return
      }
      const [slotRes, peopleRes, leadRes] = await Promise.all([
        supabase.from('weekly_slots').select().eq('semester_id', semesterId),
        supabase.from('profiles').select().in('role', ['grad', 'teacher']).eq('status', 'active'),
        supabase.from('duty_leads').select().eq('semester_id', semesterId),
      ])
      if (!isCurrent()) return
      setHasSemester(true)
      for (const r of [slotRes, peopleRes, leadRes]) if (r.error) throw new Error(r.error.message)
      setSlots(slotRes.data ?? [])
      setPeople(
        new Map((peopleRes.data ?? []).map((g) => [g.id, { id: g.id, name: g.display_name, teacher: g.role === 'teacher' }])),
      )
      setLeads(new Map((leadRes.data ?? []).map((l) => [slotKey(l.weekday, l.period), l.user_id])))
      setPeriods(periods)
      setLabels(labels)
      setError(null)
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (isCurrent()) setLoaded(true)
    }
  }, [beginLoad])

  useEffect(() => {
    void load()
  }, [load])
  useTableChanges(['weekly_slots', 'profiles', 'duty_leads'], () => void load())

  /** slotKey -> people on duty (teacher first, then grads by name). */
  const grid = useMemo(() => {
    const m = new Map<string, Person[]>()
    for (const s of slots) {
      const person = people.get(s.user_id)
      if (!person) continue
      const k = slotKey(s.weekday, s.period)
      m.set(k, [...(m.get(k) ?? []), person])
    }
    for (const list of m.values())
      list.sort((a, b) => Number(b.teacher) - Number(a.teacher) || a.name.localeCompare(b.name, 'zh-Hant'))
    return m
  }, [slots, people])
  const gradIds = useMemo(() => new Set([...people.values()].filter((p) => !p.teacher).map((p) => p.id)), [people])
  const uncovered = useMemo(() => uncoveredWeekdays(slots, gradIds), [slots, gradIds])

  const gradsAt = (w: number, p: number) => (grid.get(slotKey(w, p)) ?? []).filter((x) => !x.teacher)
  const leadAt = (w: number, p: number) => {
    const id = leads.get(slotKey(w, p))
    return id && gradsAt(w, p).some((g) => g.id === id) ? id : null
  }
  const needsLead = (w: number, p: number) => gradsAt(w, p).length > 1 && !leadAt(w, p)

  const pickLead = async (w: number, p: number, userId: string | null) => {
    try {
      await setDutyLead(w, p, userId)
      setError(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!loaded) return <p className="p-4">載入中…</p>
  const sel = selected
  const selPeople = sel ? (grid.get(slotKey(sel.w, sel.p)) ?? []) : []
  const selGrads = sel ? gradsAt(sel.w, sel.p) : []
  const selLead = sel ? leadAt(sel.w, sel.p) : null
  const missing = periods.length
    ? [1, 2, 3, 4, 5].flatMap((w) => periods.filter((p) => needsLead(w, p.period)).map((p) => ({ w, p: p.period })))
    : []
  return (
    <div className="p-2">
      <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{semesterName ? `${semesterName}學期研究室班表` : '研究室班表'}</h1>
      {error && (
        <p role="alert" className="mb-2 rounded bg-red-100 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!hasSemester ? (
        <p>管理者尚未設定學期</p>
      ) : (
        <>
          {uncovered.map((w) => (
            <p key={w} className="mb-1 rounded bg-red-50 p-2 text-sm text-red-700">
              週{WEEKDAY_LABELS[w - 1]} 整天沒有人
            </p>
          ))}
          {missing.length > 0 && (
            <p className="mb-1 rounded bg-orange-50 p-2 text-sm text-orange-800">
              有 {missing.length} 個時段有兩位以上研究生，{isTeacher ? '請點格子設定主值' : '等老師設定主值'}（橘色框）
            </p>
          )}
          <p className="mb-1 text-sm text-gray-500">★ 主值　<span className="rounded bg-amber-100 px-1 text-amber-800">黃色</span> 老師在校</p>
          <WeekGrid
            highlightWeekdays={uncovered}
            periods={periods.length ? periods : undefined}
            onToggle={(w, p) => setSelected({ w, p })}
            cells={(w, p) => {
              const list = grid.get(slotKey(w, p)) ?? []
              if (list.length === 0) return null
              const lead = leadAt(w, p)
              const grads = list.filter((x) => !x.teacher)
              return (
                <div className={`space-y-1 py-1 text-sm leading-snug sm:text-base ${needsLead(w, p) ? 'rounded ring-2 ring-orange-400' : ''}`}>
                  {list
                    .filter((x) => x.teacher)
                    .map((t) => (
                      <div key={t.id} className="rounded bg-amber-100 px-1 text-amber-800">
                        <span className="sm:hidden">師</span>
                        <span className="hidden sm:inline">{t.name}老師</span>
                      </div>
                    ))}
                  {grads.length > 0 && (
                    <>
                      <span className="sm:hidden">{grads.length}</span>
                      <span className="hidden sm:block">
                        {grads.map((g) => (g.id === lead ? `★${g.name}` : g.name)).join('、')}
                      </span>
                    </>
                  )}
                </div>
              )
            }}
          />
          {sel && (
            <div className="mt-2 rounded border p-2 text-sm" data-testid="selected-names">
              <p>
                週{WEEKDAY_LABELS[sel.w - 1]} {labels[sel.p] ?? periodLabel(sel.p)}：
                {selPeople.length
                  ? selPeople.map((x) => (x.teacher ? `${x.name}老師` : x.id === selLead ? `★${x.name}` : x.name)).join('、')
                  : '沒有人'}
              </p>
              {isTeacher && selGrads.length > 1 && (
                <label className="mt-2 flex flex-wrap items-center gap-2">
                  主值
                  <select
                    aria-label="主值"
                    className="rounded border px-2 py-1"
                    value={selLead ?? ''}
                    onChange={(e) => void pickLead(sel.w, sel.p, e.target.value || null)}
                  >
                    <option value="">未設定</option>
                    {selGrads.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
