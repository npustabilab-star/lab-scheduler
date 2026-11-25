import { HeroArt, LAB_NAME, LabLogo } from '../components/Brand'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { loginEmail, toAuthPassword } from '../lib/credentials'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: loginEmail(studentId),
        password: toAuthPassword(password),
      })
      if (err) setError('學號或密碼錯誤')
    } catch {
      setError('學號或密碼錯誤')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card grid w-full max-w-3xl overflow-hidden md:grid-cols-2">
      <div className="brand-gradient flex flex-col items-center justify-center gap-3 p-6 text-white">
        <LabLogo className="h-14 w-14 rounded-2xl ring-4 ring-white/30" />
        <p className="text-center text-lg leading-snug font-bold">{LAB_NAME}</p>
        <p className="text-indigo-100">排班系統</p>
        <div className="rounded-2xl bg-white/90 p-2">
          <HeroArt className="h-28 w-auto" />
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-center text-2xl font-bold">登入</h1>
      <form onSubmit={(e) => void submit(e)} className="flex w-full max-w-xs flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">學號
          <input className="rounded-xl border border-indigo-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={studentId} required autoComplete="username"
            onChange={(e) => setStudentId(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">密碼
          <input type="password" className="rounded-xl border border-indigo-200 px-3 py-2 focus:border-indigo-500 focus:outline-none" value={password} required
            autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
        </label>
        <p className="text-xs text-gray-600">第一次登入的密碼為學號後四碼（英文字母請用小寫）</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="brand-gradient rounded-xl px-5 py-3 font-bold text-white shadow-md disabled:opacity-50">
          登入
        </button>
      </form>
      <a href="/" className="text-sm text-indigo-600 underline">← 回到總表</a>
      </div>
      </div>
    </div>
  )
}
