import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import ReasonDialog from '../components/ReasonDialog'
import { useTableChanges } from '../hooks/useTableChanges'
import { cancelBooking, respondBooking } from '../lib/api'
import { BOOKING_SELECT, activeBooking } from '../lib/booking'
import type { BookingRow } from '../lib/booking'
import { formatSlotLabel } from '../lib/grid'
import { createLatestOnly } from '../lib/latestOnly'
import { loadSemesterAndPeriods } from '../lib/semester'
import type { PeriodTimes } from '../lib/semester'
import { supabase } from '../lib/supabase'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
type Action = { kind: 'reject' | 'cancel'; booking: BookingRow }

export default function RequestsPage() {
  const { profile } = useAuth()
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [times, setTimes] = useState<PeriodTimes>({})
  const [labels, setLabels] = useState<Record<number, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const busy = useRef(false)
  const beginLoad = useRef(createLatestOnly()).current

  const load = useCallback(async () => {
    if (!profile) return
    const isCurrent = beginLoad()
    try {
      const [sp, bk] = await Promise.all([
        loadSemesterAndPeriods(),
        supabase
          .from('bookings')
          .select(BOOKING_SELECT)
          .in('status', ['pending', 'confirmed'])
          .or(`teacher_id.eq.${profile.id},grad_id.eq.${profile.id}`)
          .order('date')
          .order('period'),
      ])
      if (!isCurrent()) return
      if (bk.error) throw new Error(bk.error.message)
      setTimes(sp.times)
      setLabels(sp.labels)
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
  const now = new Date()
  const upcoming = bookings.filter((b) => activeBooking([b], now, periodEnd) !== null)
  const mine = (b: BookingRow) => (b.teacher_id === profile?.id && !b.teacher_ok) || (b.grad_id === profile?.id && !b.grad_ok)
  const toConfirm = upcoming.filter((b) => b.status === 'pending' && mine(b))
  // confirmed meetings, plus pending ones I already accepted (waiting for the other side)
  const meetings = upcoming.filter((b) => b.status === 'confirmed' || (b.status === 'pending' && !mine(b)))

  const act = async (fn: () => Promise<unknown>) => {
    if (busy.current) return
    busy.current = true
    setActionError(null)
    try {
      await fn()
      setAction(null)
      await load()
    } catch (e) {
      setActionError(errMsg(e))
      setAction(null)
      await load()
    } finally {
      busy.current = false
    }
  }

  const who = (b: BookingRow) => `${b.undergrad?.display_name ?? ''}`

  return (
    <div className="p-2">
      <h1 className="mb-2 text-xl font-bold">預約申請</h1>
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
      <h2 className="mb-1 font-bold">待我確認</h2>
      {toConfirm.length === 0 ? (
        <p className="mb-4 text-sm text-gray-600">沒有待確認的預約</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {toConfirm.map((b) => (
            <li key={b.id} className="break-words rounded border p-2 text-sm">
              <p className="font-medium">
                {who(b)}　{formatSlotLabel(b.date, b.period, labels)}
              </p>
              {b.note && <p className="text-gray-700">{b.note}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded bg-green-600 px-3 py-1 text-white"
                  onClick={() => void act(() => respondBooking(b.id, true))}
                >
                  同意
                </button>
                <button type="button" className="rounded border px-3 py-1" onClick={() => setAction({ kind: 'reject', booking: b })}>
                  拒絕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mb-1 font-bold">即將到來的會議</h2>
      {meetings.length === 0 ? (
        <p className="text-sm text-gray-600">沒有即將到來的會議</p>
      ) : (
        <ul className="space-y-2">
          {meetings.map((b) => (
            <li key={b.id} className="break-words rounded border p-2 text-sm">
              <p className="font-medium">
                {who(b)}　{formatSlotLabel(b.date, b.period, labels)}
              </p>
              {b.note && <p className="text-gray-700">{b.note}</p>}
              {b.status === 'pending' && <p className="text-amber-700">等待另一位確認</p>}
              <button type="button" className="mt-2 rounded border px-3 py-1" onClick={() => setAction({ kind: 'cancel', booking: b })}>
                取消
              </button>
            </li>
          ))}
        </ul>
      )}
      {action && (
        <ReasonDialog
          title={action.kind === 'reject' ? '拒絕預約' : '取消會議'}
          label={action.kind === 'reject' ? '拒絕原因（選填）' : '取消原因（選填）'}
          confirmText={action.kind === 'reject' ? '確認拒絕' : '確認取消'}
          onCancel={() => setAction(null)}
          onConfirm={(r) =>
            void act(() =>
              action.kind === 'reject'
                ? respondBooking(action.booking.id, false, r || undefined)
                : cancelBooking(action.booking.id, r || undefined),
            )
          }
        />
      )}
    </div>
  )
}
