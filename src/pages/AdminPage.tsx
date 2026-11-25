import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import ImpactDialog from '../components/ImpactDialog'
import { useTableChanges } from '../hooks/useTableChanges'
import * as api from '../lib/api'
import { runWithImpact } from '../lib/changes'
import { periodLabel } from '../lib/grid'
import { createLatestOnly } from '../lib/latestOnly'
import { supabase } from '../lib/supabase'
import type { AffectedBooking, Profile } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type Role = Database['public']['Enums']['user_role']
type Semester = Database['public']['Tables']['semesters']['Row']
type Period = Database['public']['Tables']['periods']['Row']
const labelFor = (p: Period): string => p.label
type NoClassDay = Database['public']['Tables']['no_class_days']['Row']
type Pending = { affected: AffectedBooking[]; resolve: (ok: boolean) => void }

const TABS = ['成員', '學期', '節次時間', '停課日'] as const
type Tab = (typeof TABS)[number]
const ROLE_LABEL: Record<Role, string> = { teacher: '老師', grad: '研究生', undergrad: '專題生' }
const input = 'rounded border px-2 py-1'
const btn = 'rounded border px-3 py-1 disabled:opacity-50'
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return (data ?? []) as T
}

export default function AdminPage() {
  const { profile: me } = useAuth()
  const isTeacher = me?.role === 'teacher'
  const [tab, setTab] = useState<Tab>('成員')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [days, setDays] = useState<NoClassDay[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const labelOf = Object.fromEntries(periods.map((p) => [p.period, labelFor(p)]))
  const busy = useRef(false)
  const latest = useRef(createLatestOnly()).current

  const load = useCallback(async () => {
    const isLatest = latest()
    try {
      const [p, s, pe, d] = await Promise.all([
        must<Profile[]>(supabase.from('profiles').select().order('created_at')),
        must<Semester[]>(supabase.from('semesters').select().order('start_date', { ascending: false })),
        must<Period[]>(supabase.from('periods').select().order('start_time')),
        must<NoClassDay[]>(supabase.from('no_class_days').select().order('date')),
      ])
      if (!isLatest()) return
      setProfiles(p)
      setSemesters(s)
      setPeriods(pe)
      setDays(d)
      setLoadError(null)
    } catch (e) {
      if (isLatest()) setLoadError(msg(e))
    } finally {
      if (isLatest()) setLoaded(true)
    }
  }, [latest])

  useEffect(() => {
    void load()
  }, [load])
  useTableChanges(['profiles', 'semesters', 'periods', 'no_class_days'], () => void load())

  const ask = (affected: AffectedBooking[]) => new Promise<boolean>((resolve) => setPending({ affected, resolve }))
  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  /** Runs a mutation; errors go to actionError, which a reload never clears. */
  const act = async (fn: () => Promise<unknown>) => {
    if (busy.current) return
    busy.current = true
    setActionError(null)
    try {
      await fn()
    } catch (e) {
      setActionError(msg(e))
    } finally {
      busy.current = false
    }
    await load()
  }

  const grads = useMemo(() => profiles.filter((p) => p.role === 'grad' && p.status === 'active'), [profiles])
  const members = profiles.filter((p) => p.status !== 'pending')

  const createMember = async (input: api.CreateInput) => {
    let ok = false
    await act(async () => {
      await api.createMember(input)
      ok = true
    })
    return ok
  }

  if (!loaded) return <p className="p-4">載入中…</p>
  return (
    <div className="p-2">
      <h1 className="mb-2 text-xl font-bold">管理</h1>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button"
            className={`rounded px-3 py-1 ${tab === t ? 'bg-blue-600 text-white' : 'border'}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {loadError && <p className="mb-2 rounded bg-red-100 p-2 text-sm text-red-700">載入失敗：{loadError}</p>}
      {actionError && (
        <p role="alert" className="mb-2 rounded bg-red-100 p-2 text-sm text-red-700">{actionError}</p>
      )}

      {tab === '成員' && (
        <div className="space-y-4">
          <AddMemberForm grads={grads} onError={setActionError} onCreate={createMember} />
          <section>
            <h2 className="mb-1 font-bold">成員</h2>
            <ul className="space-y-2">
              {members.map((p) => (
                <li key={p.id} className="rounded border p-2 text-sm">
                  <div className="font-medium">
                    {p.display_name}
                    <span className="ml-2 text-gray-500">{p.role ? ROLE_LABEL[p.role] : '未指定'}</span>
                    {p.is_admin && <span className="ml-2 rounded bg-yellow-100 px-1">管理者</span>}
                    {p.status === 'disabled' && <span className="ml-2 rounded bg-gray-200 px-1">已停用</span>}
                  </div>
                  <div className="text-gray-500">學號：{p.student_id ?? '—'}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {p.role === 'undergrad' && (
                      <select aria-label={`${p.display_name}的指導研究生`} className={input} value={p.mentor_id ?? ''}
                        onChange={(e) => {
                          const g = e.target.value
                          if (g && g !== p.mentor_id)
                            void act(() => runWithImpact((c) => api.setMentor(p.id, g, c), ask))
                        }}>
                        <option value="" disabled>未指定</option>
                        {grads.map((g) => <option key={g.id} value={g.id}>{g.display_name}</option>)}
                      </select>
                    )}
                    {(isTeacher || (p.role !== 'teacher' && !p.is_admin)) && (
                      <button type="button" className={btn}
                        onClick={() =>
                          void act(() =>
                            runWithImpact((c) => api.setAccountStatus(p.id, p.status === 'active' ? 'disabled' : 'active', c), ask),
                          )
                        }>
                        {p.status === 'active' ? '停用' : '啟用'}
                      </button>
                    )}
                    {isTeacher && (
                      <button type="button" className={btn} onClick={() => void act(() => api.setAdmin(p.id, !p.is_admin))}>
                        {p.is_admin ? '取消管理者' : '設為管理者'}
                      </button>
                    )}
                    <button type="button" className={btn}
                      onClick={() => {
                        if (window.confirm(`確定要把 ${p.display_name} 的密碼重設為學號後四碼？`))
                          void act(() => api.resetMemberPassword(p.id))
                      }}>
                      重設密碼
                    </button>
                  </div>
                  {(isTeacher || p.role !== 'teacher') && (
                    <RenameMember key={`name-${p.display_name}`} profile={p} onSave={(name) => void act(() => api.setDisplayName(p.id, name))} />
                  )}
                  <NotifyEmail key={p.notify_email ?? ''} profile={p} onSave={(email) => void act(() => api.setNotifyEmail(p.id, email))} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {tab === '學期' && (
        <SemesterTab semesters={semesters}
          onAdd={(name, start, end) =>
            void act(async () => {
              try {
                await must(supabase.from('semesters').insert({ name, start_date: start, end_date: end }))
              } catch (e) {
                if ((e as { code?: string }).code === '23P01') throw new Error('學期日期與現有學期重疊，請調整起訖日期')
                throw e
              }
            })}
          onSetCurrent={(id) =>
            void act(async () => {
              // only one current semester is allowed: unset the old one first
              await must(supabase.from('semesters').update({ is_current: false }).eq('is_current', true))
              await must(supabase.from('semesters').update({ is_current: true }).eq('id', id))
            })} />
      )}

      {tab === '節次時間' && (
        <PeriodsTab periods={periods} onError={setActionError}
          onSave={(rows) =>
            void act(async () => {
              for (const [i, r] of rows.entries()) {
                try {
                  await must(supabase.from('periods').update({ start_time: r.start, end_time: r.end }).eq('period', r.period))
                } catch (e) {
                  throw new Error(`${labelOf[r.period] ?? `第${r.period}節`}儲存失敗：${msg(e)}${i > 0 ? '（前面的節次已儲存）' : ''}`)
                }
              }
            })} />
      )}

      {tab === '停課日' && (
        <DaysTab days={days} onError={setActionError}
          onAdd={(date, note) => void act(() => runWithImpact((c) => api.addNoClassDay(date, note, c), ask))}
          onRemove={(date) => void act(() => api.removeNoClassDay(date))} />
      )}

      {pending && (
        <ImpactDialog affected={pending.affected} labels={labelOf} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
      )}
    </div>
  )
}

function AddMemberForm({ grads, onCreate, onError }: {
  grads: Profile[]
  onCreate: (input: api.CreateInput) => Promise<boolean>
  onError: (m: string | null) => void
}) {
  const [studentId, setStudentId] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('undergrad')
  const [mentor, setMentor] = useState('')
  const [email, setEmail] = useState('')
  const submit = async () => {
    if (role === 'undergrad' && !mentor) return onError('請選擇指導研究生')
    if (role === 'teacher' && !email.trim()) return onError('老師必須填寫 Email')
    onError(null)
    const ok = await onCreate({
      student_id: studentId.trim(),
      display_name: name.trim(),
      role,
      mentor_id: role === 'undergrad' ? mentor : null,
      notify_email: email.trim() || null,
    })
    if (ok) {
      setStudentId(''); setName(''); setMentor(''); setEmail('')
    }
  }
  return (
    <section>
      <h2 className="mb-1 font-bold">新增成員</h2>
      <form className="flex flex-wrap items-end gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}>
        <label>學號<input className={`${input} block`} value={studentId} required onChange={(e) => setStudentId(e.target.value)} /></label>
        <label>姓名<input className={`${input} block`} value={name} required onChange={(e) => setName(e.target.value)} /></label>
        <label>身分
          <select className={`${input} block`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="grad">研究生</option>
            <option value="undergrad">專題生</option>
            <option value="teacher">老師</option>
          </select>
        </label>
        {role === 'undergrad' && (
          <label>指導研究生
            <select className={`${input} block`} value={mentor} onChange={(e) => setMentor(e.target.value)}>
              <option value="">請選擇</option>
              {grads.map((g) => <option key={g.id} value={g.id}>{g.display_name}</option>)}
            </select>
          </label>
        )}
        <label>Email{role === 'teacher' ? '' : '（選填）'}
          <input type="email" className={`${input} block`} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" className={`${btn} bg-blue-600 text-white`}>新增成員</button>
      </form>
      <p className="mt-1 text-xs text-gray-500">初始密碼為學號後四碼，第一次登入需更改密碼。</p>
    </section>
  )
}

function RenameMember({ profile, onSave }: { profile: Profile; onSave: (name: string) => void }) {
  const [name, setName] = useState(profile.display_name)
  return (
    <form className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && name.trim() !== profile.display_name) onSave(name.trim())
      }}>
      <input aria-label={`${profile.display_name}的姓名`} className={input} value={name} maxLength={30}
        placeholder="姓名" onChange={(e) => setName(e.target.value)} />
      <button type="submit" className={btn}>更改名稱</button>
    </form>
  )
}

function NotifyEmail({ profile, onSave }: { profile: Profile; onSave: (email: string) => void }) {
  const [email, setEmail] = useState(profile.notify_email ?? '')
  return (
    <form className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(email.trim())
      }}>
      <input type="email" aria-label={`${profile.display_name}的通知 Email`} className={input} value={email}
        placeholder="通知 Email" onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" className={btn}>儲存 Email</button>
    </form>
  )
}

function SemesterTab({ semesters, onAdd, onSetCurrent }: {
  semesters: Semester[]
  onAdd: (name: string, start: string, end: string) => void
  onSetCurrent: (id: number) => void
}) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          onAdd(name.trim(), start, end)
          setName(''); setStart(''); setEnd('')
        }}>
        <label>學期名稱<input className={`${input} block`} value={name} required onChange={(e) => setName(e.target.value)} /></label>
        <label>開始日<input type="date" className={`${input} block`} value={start} required onChange={(e) => setStart(e.target.value)} /></label>
        <label>結束日<input type="date" className={`${input} block`} value={end} required onChange={(e) => setEnd(e.target.value)} /></label>
        <button type="submit" className={btn}>新增學期</button>
      </form>
      <ul className="space-y-2">
        {semesters.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
            <span>{s.name}（{s.start_date} ~ {s.end_date}）{s.is_current && <b className="ml-1 text-green-700">目前學期</b>}</span>
            {!s.is_current && <button type="button" className={btn} onClick={() => onSetCurrent(s.id)}>設為目前學期</button>}
          </li>
        ))}
      </ul>
    </div>
  )
}

const HM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const HM_MESSAGE = '請用 24 小時制 HH:MM'

function PeriodsTab({ periods, onSave, onError }: {
  periods: Period[]
  onError: (m: string | null) => void
  onSave: (rows: { period: number; start: string; end: string }[]) => void
}) {
  const [draft, setDraft] = useState<Record<number, { start: string; end: string }>>(() =>
    Object.fromEntries(periods.map((p) => [p.period, { start: p.start_time.slice(0, 5), end: p.end_time.slice(0, 5) }])),
  )
  const label = Object.fromEntries(periods.map((p) => [p.period, labelFor(p)]))
  const set = (n: number, k: 'start' | 'end', v: string) =>
    setDraft((d) => ({ ...d, [n]: { ...d[n], [k]: v } }))
  return (
    <form className="space-y-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        const lbl = (n: number) => label[n] ?? periodLabel(n)
        // validated and saved in start-time order (period numbers do not follow time: 午休 is 8)
        const rows = Object.entries(draft)
          .map(([n, v]) => ({ period: Number(n), ...v }))
          .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.period - b.period)
        for (const r of rows) {
          if (!HM.test(r.start)) return onError(`${lbl(r.period)}開始時間：${HM_MESSAGE}`)
          if (!HM.test(r.end)) return onError(`${lbl(r.period)}結束時間：${HM_MESSAGE}`)
        }
        for (const r of rows) {
          if (r.end <= r.start) return onError(`${lbl(r.period)}結束時間必須晚於開始時間`)
        }
        for (let i = 1; i < rows.length; i++) {
          if (rows[i].start < rows[i - 1].end)
            return onError(`${lbl(rows[i].period)}不能早於${lbl(rows[i - 1].period)}結束`)
        }
        onError(null)
        onSave(rows)
      }}>
      {periods.map((p) => (
        <div key={p.period} className="flex items-center gap-2">
          <span className="w-14">{labelFor(p)}</span>
          <input type="text" inputMode="numeric" maxLength={5} placeholder="HH:MM" aria-label={`${labelFor(p)}開始`} className={`${input} w-20`} value={draft[p.period]?.start ?? ''}
            required onChange={(e) => set(p.period, 'start', e.target.value.trim())} />
          <span>~</span>
          <input type="text" inputMode="numeric" maxLength={5} placeholder="HH:MM" aria-label={`${labelFor(p)}結束`} className={`${input} w-20`} value={draft[p.period]?.end ?? ''}
            required onChange={(e) => set(p.period, 'end', e.target.value.trim())} />
        </div>
      ))}
      <button type="submit" className={btn}>儲存節次時間</button>
    </form>
  )
}

function DaysTab({ days, onAdd, onRemove, onError }: {
  days: NoClassDay[]
  onAdd: (date: string, note: string) => void
  onRemove: (date: string) => void
  onError: (m: string | null) => void
}) {
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          if (!date) return onError('請選擇日期')
          onAdd(date, note.trim())
          setDate(''); setNote('')
        }}>
        <label>日期<input type="date" className={`${input} block`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>備註<input className={`${input} block`} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button type="submit" className={btn}>新增停課日</button>
      </form>
      <ul className="space-y-2">
        {days.map((d) => (
          <li key={d.date} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
            <span>{d.date}　{d.note}</span>
            <button type="button" className={btn} onClick={() => onRemove(d.date)}>刪除</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
