import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { toAuthPassword } from '../lib/credentials'
import { validateNewPassword } from '../lib/password'
import { supabase } from '../lib/supabase'

const FAILED = '密碼更新失敗，請再試一次'

export default function ChangePasswordPage() {
  const { refresh } = useAuth()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const invalid = validateNewPassword(pw, confirm)
    if (invalid) return setError(invalid)
    setBusy(true)
    setError(null)
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: toAuthPassword(pw) })
      if (updateErr) return setError(FAILED)
      const { error: flagErr } = await supabase.rpc('password_changed')
      if (flagErr) return setError(FAILED)
      await refresh()
    } catch {
      setError(FAILED)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold">請設定新密碼</h1>
      <p className="text-sm text-gray-600">第一次登入需要先更改密碼</p>
      <form onSubmit={(e) => void submit(e)} className="flex w-full max-w-xs flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">新密碼
          <input type="password" className="rounded border px-3 py-2" value={pw} autoComplete="new-password"
            onChange={(e) => setPw(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">確認新密碼
          <input type="password" className="rounded border px-3 py-2" value={confirm} autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="rounded bg-blue-600 px-5 py-3 text-white disabled:opacity-50">
          更改密碼
        </button>
      </form>
      <button type="button" onClick={() => void supabase.auth.signOut()} className="text-sm underline">登出</button>
    </div>
  )
}
