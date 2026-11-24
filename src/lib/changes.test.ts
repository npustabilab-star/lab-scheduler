import { describe, expect, it, vi } from 'vitest'
import { runWithImpact } from './changes'
import type { ChangeResult } from './supabase'

const affected = [{ id: 'b1', date: '2026-03-09', period: 3, undergrad_name: '王小美', status: 'confirmed' as const }]

describe('runWithImpact', () => {
  it('does not ask when applied', async () => {
    const call = vi.fn(async (): Promise<ChangeResult> => ({ applied: true, affected: [] }))
    const ask = vi.fn(async () => true)
    const r = await runWithImpact(call, ask)
    expect(r).toEqual({ applied: true, affected: [] })
    expect(ask).not.toHaveBeenCalled()
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('confirms when user agrees', async () => {
    const call = vi.fn(async (c: boolean): Promise<ChangeResult> => ({ applied: c, affected }))
    const ask = vi.fn(async () => true)
    const r = await runWithImpact(call, ask)
    expect(ask).toHaveBeenCalledWith(affected)
    expect(call.mock.calls.map((c) => c[0])).toEqual([false, true])
    expect(r?.applied).toBe(true)
  })
  it('returns null when user declines', async () => {
    const call = vi.fn(async (): Promise<ChangeResult> => ({ applied: false, affected }))
    const r = await runWithImpact(call, async () => false)
    expect(r).toBeNull()
    expect(call).toHaveBeenCalledTimes(1)
  })
})
