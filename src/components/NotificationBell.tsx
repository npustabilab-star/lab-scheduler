import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useTableChanges } from '../hooks/useTableChanges'
import { markNotificationsRead } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { NotificationRow } from '../lib/supabase'

const LABELS: Record<NotificationRow['type'], string> = {
  booking_requested: '有新的預約申請',
  booking_confirmed: '預約已確認',
  booking_rejected: '預約被婉拒',
  booking_cancelled: '預約已取消',
  booking_expired: '預約已逾期失效',
  booking_reminder: '提醒：有預約尚未確認，明天到期',
  duty_lead_reminder: '提醒：明天有時段尚未設定主值',
}

const TIME_FMT = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
/** 24h Taipei time, e.g. '2026/03/09 14:05' (never 上午/下午). */
export const formatNotificationTime = (iso: string): string => TIME_FMT.format(new Date(iso))

export default function NotificationBell() {
  const { profile } = useAuth()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    setItems(data ?? [])
  }, [])

  useEffect(() => {
    if (profile) void load()
  }, [profile, load])
  useTableChanges(['notifications'], () => void load())

  const unread = items.filter((n) => !n.read_at).length

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      try {
        await markNotificationsRead()
      } finally {
        await load()
      }
    }
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => void toggle()} aria-label="通知" className="relative p-2 text-xl">
        🔔
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <ul className="absolute right-0 z-20 mt-1 max-h-80 w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded border bg-white shadow-lg">
          {items.length === 0 && <li className="p-3 text-sm text-gray-500">沒有通知</li>}
          {items.map((n) => (
            <li key={n.id} className="border-b p-3 text-sm last:border-b-0">
              <div>{LABELS[n.type]}</div>
              {n.detail && <div className="text-xs text-gray-700">{n.ref_date} {n.detail}</div>}
              <div className="text-xs text-gray-500">{formatNotificationTime(n.created_at)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
