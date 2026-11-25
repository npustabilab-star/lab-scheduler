import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WeekGrid from '../components/WeekGrid'
import { useTableChanges } from '../hooks/useTableChanges'
import type { PeriodInfo } from '../lib/grid'
import { WEEKDAY_LABELS, buildMasterGrid, formatMasterSelection, slotKey, uncoveredWeekdays } from '../lib/grid'
import { createLatestOnly } from '../lib/latestOnly'
import { loadSemesterAndPeriods } from '../lib/semester'
import { supabase } from '../lib/supabase'

type Slot = { user_id: string; weekday: number; period: number }

export default function MasterPage() {
  const [loaded, setLoaded] = useState(false)
  const [hasSemester, setHasSemester] = useState(true)
  const [slots, setSlots] = useState<Slot[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [periods, setPeriods] = useState<PeriodInfo[]>([])
  const [labels, setLabels] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ w: number; p: number } | null>(null)

  const beginLoad = useRef(createLatestOnly()).current

  const load = useCallback(async () => {
    const isCurrent = beginLoad()
    try {
      const { semesterId, periods, labels } = await loadSemesterAndPeriods()
      if (!isCurrent()) return
      if (!semesterId) {
        setHasSemester(false)
        return
      }
      const [slotRes, gradRes] = await Promise.all([
        supabase.from('weekly_slots').select().eq('semester_id', semesterId),
        supabase.from('profiles').select().eq('role', 'grad').eq('status', 'active'),
      ])
      if (!isCurrent()) return
      setHasSemester(true)
      if (slotRes.error) throw new Error(slotRes.error.message)
      if (gradRes.error) throw new Error(gradRes.error.message)
      setSlots(slotRes.data ?? [])
      setNames(new Map((gradRes.data ?? []).map((g) => [g.id, g.display_name])))
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
  useTableChanges(['weekly_slots', 'profiles'], () => void load())

  const grid = useMemo(() => buildMasterGrid(slots, names), [slots, names])
  const uncovered = useMemo(() => uncoveredWeekdays(slots, new Set(names.keys())), [slots, names])

  if (!loaded) return <p className="p-4">載入中…</p>
  const selectedNames = selected ? (grid.get(slotKey(selected.w, selected.p)) ?? []) : []
  return (
    <div className="p-2">
      <h1 className="mb-2 text-xl font-bold">總表</h1>
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
          <WeekGrid
            highlightWeekdays={uncovered}
            periods={periods.length ? periods : undefined}
            onToggle={(w, p) => setSelected({ w, p })}
            cells={(w, p) => {
              const list = grid.get(slotKey(w, p)) ?? []
              if (list.length === 0) return null
              return (
                <>
                  <span className="sm:hidden">{list.length}</span>
                  <span className="hidden text-xs leading-tight sm:block">{list.join('、')}</span>
                </>
              )
            }}
          />
          {selected && (
            <p className="mt-2 text-sm sm:hidden" data-testid="selected-names">
              {formatMasterSelection(selected.w, selected.p, selectedNames, labels[selected.p])}
            </p>
          )}
        </>
      )}
    </div>
  )
}
