import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'

export default function PendingPage() {
  const { profile } = useAuth()
  const message =
    profile?.status === 'disabled' ? '帳號已停用' : '尚未指派身分，請聯絡管理者'
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-lg">{message}</p>
      <button type="button" onClick={() => void supabase.auth.signOut()} className="rounded border px-4 py-2">
        登出
      </button>
    </div>
  )
}
