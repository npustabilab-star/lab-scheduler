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

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'missing-anon-key',
)
