import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import WeekGrid from '../components/WeekGrid'
import WeekNav from '../components/WeekNav'
import { publicBoard, publicPeriods } from '../lib/api'
import type { PeriodInfo } from '../lib/grid'
import { createLatestOnly } from '../lib/latestOnly'
import { homeFor } from '../lib/routes'
import { shiftWeek, taipeiToday, thisWeekMonday, weekOf } from '../lib/week'

const key = (date: string, period: number) => `${date}|${period}`

/** Home page, visible without login: who is in the lab this week (names only). */
export default function PublicBoardPage() {
  const { session, profile } = useAuth()
  const [monday, setMonday] = useState(() => thisWeekMonday(taipeiToday()))
  const [names, setNames] = useState<Map<string, { grads: string[]; teacher: string[] }>>(new Map())
  const [periods, setPeriods] = useState<PeriodInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const beginLoad = useRef(createLatestOnly()).current
  const days = useMemo(() => weekOf(monday).days, [monday])

  const load = useCallback(async () => {
    const isCurrent = beginLoad()
    try {
      const [rows, per] = await Promise.all([publicBoard(days[0], days[4]), publicPeriods()])
      if (!isCurrent()) return
      const m = new Map<string, { grads: string[]; teacher: string[] }>()
      for (const r of rows ?? []) {
        const k = key(r.date, r.period)
        const c = m.get(k) ?? { grads: [], teacher: [] }
        ;(r.is_teacher ? c.teacher : c.grads).push(r.is_lead && !r.is_teacher ? `★${r.display_name}` : r.display_name)
        m.set(k, c)
      }
      setNames(m)
      setPeriods(
        (per ?? []).map((p) => ({ period: p.period, label: p.label, start: p.start_time.slice(0, 5), end: p.end_time.slice(0, 5) })),
      )
      setError(null)
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : String(e))
    }
  }, [days, beginLoad])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <span className="font-bold">研究室排班</span>
        {session && profile ? (
          <Link to={homeFor(profile)} className="rounded bg-blue-600 px-3 py-1 text-sm text-white">
            進入系統
          </Link>
        ) : (
          <Link to="/login" className="rounded bg-blue-600 px-3 py-1 text-sm text-white">
            登入
          </Link>
        )}
      </header>
      <main className="p-2">
        <h1 className="mb-2 text-xl font-bold">總表</h1>
        <p className="mb-2 text-sm text-gray-600">
          每一節在研究室的研究生，<span className="rounded bg-amber-100 px-1 text-amber-800">黃色</span>為老師在校時間，★ 為主值
        </p>
        {error && (
          <p role="alert" className="mb-2 rounded bg-red-100 p-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <WeekNav
          monday={monday}
          onPrev={() => setMonday((m) => shiftWeek(m, -1))}
          onToday={() => setMonday(thisWeekMonday(taipeiToday()))}
          onNext={() => setMonday((m) => shiftWeek(m, 1))}
        />
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <WeekGrid
              days={days}
              periods={periods.length ? periods : undefined}
              cells={(w, p) => {
                const c = names.get(key(days[w - 1], p))
                if (!c) return null
                return (
                  <div className="space-y-0.5 py-0.5 text-xs leading-tight">
                    {c.teacher.map((t) => (
                      <div key={t} className="rounded bg-amber-100 px-1 text-amber-800">
                        {t}老師
                      </div>
                    ))}
                    {c.grads.length > 0 && <div>{c.grads.join('、')}</div>}
                  </div>
                )
              }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
