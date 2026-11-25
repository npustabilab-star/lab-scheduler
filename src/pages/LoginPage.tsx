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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-bold">研究室排班系統</h1>
      <form onSubmit={(e) => void submit(e)} className="flex w-full max-w-xs flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">學號
          <input className="rounded border px-3 py-2" value={studentId} required autoComplete="username"
            onChange={(e) => setStudentId(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">密碼
          <input type="password" className="rounded border px-3 py-2" value={password} required
            autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="rounded bg-blue-600 px-5 py-3 text-white disabled:opacity-50">
          登入
        </button>
      </form>
    </div>
  )
}
