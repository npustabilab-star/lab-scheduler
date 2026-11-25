import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { HeroArt, LAB_NAME, LabLogo } from '../components/Brand'
import WeekGrid from '../components/WeekGrid'
import WeekNav from '../components/WeekNav'
import { publicBoard, publicPeriods, publicSemester } from '../lib/api'
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
  const [semesterName, setSemesterName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const beginLoad = useRef(createLatestOnly()).current
  const days = useMemo(() => weekOf(monday).days, [monday])

  const load = useCallback(async () => {
    const isCurrent = beginLoad()
    try {
      const [rows, per, sem] = await Promise.all([publicBoard(days[0], days[4]), publicPeriods(), publicSemester(days[0])])
      if (!isCurrent()) return
      const m = new Map<string, { grads: string[]; teacher: string[] }>()
      for (const r of rows ?? []) {
        const k = key(r.date, r.period)
        const c = m.get(k) ?? { grads: [], teacher: [] }
        ;(r.is_teacher ? c.teacher : c.grads).push(r.is_lead && !r.is_teacher ? `★${r.display_name}` : r.display_name)
        m.set(k, c)
      }
      setNames(m)
      setSemesterName(sem ?? null)
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
      <header className="brand-gradient flex items-center justify-between gap-2 px-3 py-2 text-sky-950 shadow-md">
        <span className="flex min-w-0 items-center gap-2">
          <LabLogo className="h-9 w-9 shrink-0 rounded-xl ring-2 ring-white/70" />
          <span className="min-w-0 text-sm leading-tight font-bold sm:text-base">
            {LAB_NAME}
            <span className="block text-xs font-normal text-sky-800">排班系統</span>
          </span>
        </span>
        {session && profile ? (
          <Link to={homeFor(profile)} className="shrink-0 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-sky-700 shadow">
            進入系統
          </Link>
        ) : (
          <Link to="/login" className="shrink-0 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-sky-700 shadow">
            登入
          </Link>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl space-y-3 p-3">
        <section className="card flex items-center justify-between gap-4 overflow-hidden p-4">
          <div>
            <p className="text-sm font-medium text-cyan-700">誰在研究室？</p>
            <p className="text-2xl font-bold text-sky-900">本週值班總表</p>
            <p className="mt-1 text-sm text-slate-600">找人前先看看這裡，每一節都有標示在研究室的研究生。</p>
          </div>
          <HeroArt className="hidden h-28 w-auto shrink-0 sm:block" />
        </section>
        <div className="card p-2 sm:p-4">
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{semesterName ? `${semesterName}學期ABI Lab班表` : 'ABI Lab班表'}</h1>
        <p className="mb-2 text-base text-gray-600">
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
                  <div className="space-y-1 py-1 text-sm leading-snug sm:text-base">
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
        </div>
      </main>
    </div>
  )
}
