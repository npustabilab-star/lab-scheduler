import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const signIn = () =>
    void supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-bold">研究室排班系統</h1>
      <button type="button" onClick={signIn} className="rounded bg-blue-600 px-5 py-3 text-white">
        使用 Google 帳號登入
      </button>
    </div>
  )
}
