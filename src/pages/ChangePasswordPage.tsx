import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { toAuthPassword } from '../lib/credentials'
import { rpcErrorMessage } from '../lib/errors'
import { validateNewPassword } from '../lib/password'
import { supabase } from '../lib/supabase'

const FAILED = '密碼更新失敗，請再試一次'
const PARTIAL = '密碼已更新，但尚未完成設定，請再按一次送出'

// Supabase rejects an update to the identical password; that means it is already applied.
const isSamePassword = (e: { code?: string; message?: string }) =>
  e.code === 'same_password' || /same/i.test(e.message ?? '')

export default function ChangePasswordPage() {
  const { refresh } = useAuth()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The password updateUser last applied (null = none yet): only call updateUser again when the input differs.
  const appliedPassword = useRef<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const invalid = validateNewPassword(pw, confirm)
    if (invalid) return setError(invalid)
    setBusy(true)
    setError(null)
    try {
      if (appliedPassword.current !== pw) {
        const { error: updateErr } = await supabase.auth.updateUser({ password: toAuthPassword(pw) })
        if (updateErr && !isSamePassword(updateErr)) return setError(FAILED)
        appliedPassword.current = pw
      }
      const { error: flagErr } = await supabase.rpc('password_changed')
      if (flagErr) {
        if (flagErr.message?.includes('PASSWORD_NOT_CHANGED')) return setError(rpcErrorMessage('PASSWORD_NOT_CHANGED'))
        return setError(PARTIAL)
      }
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
