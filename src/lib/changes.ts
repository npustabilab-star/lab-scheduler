import type { AffectedBooking, ChangeResult } from './supabase'

export async function runWithImpact(
  call: (confirm: boolean) => Promise<ChangeResult>,
  ask: (affected: AffectedBooking[]) => Promise<boolean>,
): Promise<ChangeResult | null> {
  const first = await call(false)
  if (first.applied) return first
  if (!(await ask(first.affected))) return null
  return call(true)
}
