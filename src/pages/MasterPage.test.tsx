import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  setDutyLead: vi.fn(async () => undefined),
  auth: { profile: { id: 't', role: 'teacher' } },
  tables: {
    weekly_slots: [
      { user_id: 'a', weekday: 1, period: 3 },
      { user_id: 'b', weekday: 1, period: 3 },
      { user_id: 't', weekday: 1, period: 3 },
    ],
    profiles: [
      { id: 'a', display_name: '甲', role: 'grad' },
      { id: 'b', display_name: '乙', role: 'grad' },
      { id: 't', display_name: '徐', role: 'teacher' },
    ],
    duty_leads: [] as unknown[],
  } as Record<string, unknown[]>,
}))
vi.mock('../lib/api', () => ({ setDutyLead: h.setDutyLead }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => h.auth }))
vi.mock('../hooks/useTableChanges', () => ({ useTableChanges: () => undefined }))
vi.mock('../lib/semester', () => ({
  loadSemesterAndPeriods: async () => ({
    semesterId: 1,
    periods: [{ period: 3, label: '第3節', start: '10:15', end: '11:05' }],
    labels: { 3: '第3節' },
  }),
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown) => res({ data: h.tables[t], error: null })
      return q
    },
  },
}))

import MasterPage from './MasterPage'

describe('MasterPage 主值', () => {
  it('flags slots with several grads and lets the teacher pick the lead', async () => {
    render(<MasterPage />)
    expect(await screen.findByText(/請點格子設定主值/)).toBeInTheDocument()
    expect(screen.getByText('徐老師')).toBeInTheDocument()
    await userEvent.click(screen.getByText(/^(甲、乙|乙、甲)$/))
    await userEvent.selectOptions(screen.getByLabelText('主值'), 'b')
    expect(h.setDutyLead).toHaveBeenCalledWith(1, 3, 'b')
  })
})
