import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import ReasonDialog from '../components/ReasonDialog'
import WeekGrid from '../components/WeekGrid'
import { useTableChanges } from '../hooks/useTableChanges'
import { AppError, availableSlots, cancelBooking, createBooking } from '../lib/api'
import { BOOKING_SELECT, STATUS_LABEL, activeBooking, addDays, groupSlotsByWeek } from '../lib/booking'
import type { BookingRow } from '../lib/booking'
import { formatSlotLabel, slotKey } from '../lib/grid'
import type { PeriodInfo } from '../lib/grid'
import { createLatestOnly } from '../lib/latestOnly'
import { loadSemesterAndPeriods } from '../lib/semester'
import type { PeriodTimes } from '../lib/semester'
import { supabase } from '../lib/supabase'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function BookingPage() {
  const { profile } = useAuth()
  const [slots, setSlots] = useState<{ date: string; period: number }[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [times, setTimes] = useState<PeriodTimes>({})
  const [periods, setPeriods] = useState<PeriodInfo[]>([])
  const [labels, setLabels] = useState<Record<number, string>>({})
  const [weekIdx, setWeekIdx] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [picked, setPicked] = useState<{ date: string; period: number } | null>(null)
  const [cancelling, setCancelling] = useState<BookingRow | null>(null)
  const busy = useRef(false)
  const beginLoad = useRef(createLatestOnly()).current

  const load = useCallback(async () => {
    if (!profile) return
    const isCurrent = beginLoad()
    try {
      const [sp, sl, bk] = await Promise.all([
        loadSemesterAndPeriods(),
        availableSlots(),
        supabase
          .from('bookings')
          .select(BOOKING_SELECT)
          .eq('undergrad_id', profile.id)
          .order('date', { ascending: false })
          .order('period', { ascending: false }),
      ])
      if (!isCurrent()) return
      if (bk.error) throw new Error(bk.error.message)
      setTimes(sp.times)
      setPeriods(sp.periods)
      setLabels(sp.labels)
      setSlots(sl)
      setBookings((bk.data ?? []) as unknown as BookingRow[])
      setLoadError(null)
    } catch (e) {
      if (isCurrent()) setLoadError(errMsg(e))
    }
  }, [profile, beginLoad])

  useEffect(() => {
    void load()
  }, [load])
  useTableChanges(['bookings'], () => void load())

  const periodEnd = useMemo(
    () => Object.fromEntries(Object.entries(times).map(([p, t]) => [Number(p), t.end])) as Record<number, string>,
    [times],
  )
  const active = activeBooking(bookings, new Date(), periodEnd)
  const history = bookings.filter((b) => b !== active)
  const weeks = useMemo(() => groupSlotsByWeek(slots), [slots])
  const week = weeks[Math.min(weekIdx, Math.max(weeks.length - 1, 0))]

  const act = async (fn: () => Promise<unknown>) => {
    if (busy.current) return
    busy.current = true
    setActionError(null)
    try {
      await fn()
      setPicked(null)
      setCancelling(null)
      await load()
    } catch (e) {
      setActionError(errMsg(e))
      if (e instanceof AppError && e.code === 'SLOT_UNAVAILABLE') {
        setPicked(null)
        await load()
      }
    } finally {
      busy.current = false
    }
  }

  return (
    <div className="p-2">
      <h1 className="mb-2 text-xl font-bold">預約</h1>
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
      {active ? (
        <section aria-label="進行中的預約" className="mb-4 rounded border p-3">
          <p className="font-medium">
            {formatSlotLabel(active.date, active.period, labels)}（{STATUS_LABEL[active.status]}）
          </p>
          <p className="text-sm">老師 {active.teacher_ok ? '✓' : '⏳'}</p>
          <p className="text-sm">研究生 {active.grad_ok ? '✓' : '⏳'}</p>
          {active.note && <p className="mt-1 break-words text-sm text-gray-700">{active.note}</p>}
          <button type="button" className="mt-2 rounded border px-3 py-1" onClick={() => setCancelling(active)}>
            取消
          </button>
        </section>
      ) : (
        <section aria-label="選擇時段" className="mb-4">
          {weeks.length === 0 ? (
            <p className="text-sm text-gray-600">目前沒有可預約的時段</p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  className="rounded border px-3 py-1 disabled:opacity-40"
                  disabled={weekIdx <= 0}
                  onClick={() => setWeekIdx((i) => i - 1)}
                >
                  上一週
                </button>
                <span className="text-sm">{week.weekStart} 起的一週</span>
                <button
                  type="button"
                  className="rounded border px-3 py-1 disabled:opacity-40"
                  disabled={weekIdx >= weeks.length - 1}
                  onClick={() => setWeekIdx((i) => i + 1)}
                >
                  下一週
                </button>
              </div>
              <WeekGrid
                periods={periods.length ? periods : undefined}
                isOn={(w, p) => week.cells.has(slotKey(w, p))}
                onToggle={(w, p) => {
                  if (week.cells.has(slotKey(w, p))) setPicked({ date: addDays(week.weekStart, w - 1), period: p })
                }}
                cells={(w, p) => (week.cells.has(slotKey(w, p)) ? '○' : '')}
              />
            </>
          )}
        </section>
      )}
      <h2 className="mb-1 font-bold">歷史預約</h2>
      {history.length === 0 ? (
        <p className="text-sm text-gray-600">沒有紀錄</p>
      ) : (
        <ul className="space-y-1">
          {history.map((b) => (
            <li key={b.id} className="break-words rounded border p-2 text-sm">
              {formatSlotLabel(b.date, b.period, labels)}　{STATUS_LABEL[b.status] ?? b.status}
              {b.reason && <span className="block text-gray-600">原因：{b.reason}</span>}
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <ReasonDialog
          title={`預約 ${formatSlotLabel(picked.date, picked.period, labels)}`}
          label="說明（想討論的內容）"
          confirmText="送出預約"
          onCancel={() => setPicked(null)}
          onConfirm={(note) => void act(() => createBooking(picked.date, picked.period, note))}
        />
      )}
      {cancelling && (
        <ReasonDialog
          title="取消預約"
          label="取消原因（選填）"
          confirmText="確認取消"
          onCancel={() => setCancelling(null)}
          onConfirm={(r) => void act(() => cancelBooking(cancelling.id, r || undefined))}
        />
      )}
    </div>
  )
}
