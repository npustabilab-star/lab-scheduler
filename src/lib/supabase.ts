import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type Profile = Database['public']['Tables']['profiles']['Row']
export type NotificationRow = Database['public']['Tables']['notifications']['Row']
export type AffectedBooking = {
  id: string
  date: string
  period: number
  undergrad_name: string
  status: 'pending' | 'confirmed'
}
export type ChangeResult = { applied: boolean; affected: AffectedBooking[] }

type Env = { PROD?: boolean; VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }

/** Production builds must be configured explicitly; the local dev defaults apply only outside PROD. */
export function resolveSupabaseConfig(env: Env): { url: string; key: string } {
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY
  if (env.PROD && (!url || !key)) throw new Error('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY 設定')
  return { url: url || 'http://127.0.0.1:55321', key: key || 'missing-anon-key' }
}

const cfg = resolveSupabaseConfig(import.meta.env)
export const supabase = createClient<Database>(cfg.url, cfg.key)
