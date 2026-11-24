import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import ImpactDialog from '../components/ImpactDialog'
import WeekGrid from '../components/WeekGrid'
import { setWeeklySlot } from '../lib/api'
import { runWithImpact } from '../lib/changes'
import { slotKey } from '../lib/grid'
import type { PeriodTimes } from '../lib/semester'
import { loadSemesterAndPeriods } from '../lib/semester'
import { supabase } from '../lib/supabase'
import type { AffectedBooking } from '../lib/supabase'
import { useTableChanges } from '../hooks/useTableChanges'

type Pending = { affected: AffectedBooking[]; resolve: (ok: boolean) => void }

export default function MyGridPage() {
  const { profile } = useAuth()
  const [loaded, setLoaded] = useState(false)
  const [hasSemester, setHasSemester] = useState(true)
  const [on, setOn] = useState<Set<string>>(new Set())
  const [times, setTimes] = useState<PeriodTimes>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const busy = useRef(false)

  const load = useCallback(async () => {
    if (!profile) return
    try {
      const { semesterId, times } = await loadSemesterAndPeriods()
      if (!semesterId) {
        setHasSemester(false)
        return
      }
      setHasSemester(true)
      const slots = await supabase.from('weekly_slots').select().eq('user_id', profile.id).eq('semester_id', semesterId)
      if (slots.error) throw new Error(slots.error.message)
      setOn(new Set((slots.data ?? []).map((s) => slotKey(s.weekday, s.period))))
      setTimes(times)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoaded(true)
    }
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])
  useTableChanges(['weekly_slots'], () => void load())

  const ask = (affected: AffectedBooking[]) => new Promise<boolean>((resolve) => setPending({ affected, resolve }))
  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  const toggle = async (w: number, p: number) => {
    if (busy.current) return
    busy.current = true
    setError(null)
    try {
      const turnOn = !on.has(slotKey(w, p))
      await runWithImpact((c) => setWeeklySlot(w, p, turnOn, c), ask)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      busy.current = false
    }
  }

  const title = profile?.role === 'teacher' ? '我的可約時段' : '我的值班時段'

  if (!loaded) return <p className="p-4">載入中…</p>
  return (
    <div className="p-2">
      <h1 className="mb-2 text-xl font-bold">{title}</h1>
      {error && (
        <p role="alert" className="mb-2 rounded bg-red-100 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!hasSemester ? (
        <p>管理者尚未設定學期</p>
      ) : (
        <WeekGrid
          cells={(w, p) => (on.has(slotKey(w, p)) ? '✓' : null)}
          isOn={(w, p) => on.has(slotKey(w, p))}
          onToggle={(w, p) => void toggle(w, p)}
          periodTimes={times}
        />
      )}
      {pending && (
        <ImpactDialog affected={pending.affected} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
      )}
    </div>
  )
}
