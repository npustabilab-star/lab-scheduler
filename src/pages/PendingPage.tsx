import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'

export default function PendingPage() {
  const { profile } = useAuth()
  const disabled = profile?.status === 'disabled'
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-lg">{disabled ? '帳號已停用' : '帳號審核中，請等候管理者核准'}</p>
      <button type="button" onClick={() => void supabase.auth.signOut()} className="rounded border px-4 py-2">
        登出
      </button>
    </div>
  )
}
