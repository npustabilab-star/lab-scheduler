import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  setDaySlot: vi.fn(),
  clearDaySlot: vi.fn(),
  setWeeklySlot: vi.fn(),
  auth: { profile: { id: 'me', role: 'grad' } },
}))

vi.mock('../lib/api', () => ({ ...h }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gte', 'lte']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown) => res({ data: h.tables[table] ?? [], error: null })
      return q
    },
  },
}))
vi.mock('../lib/semester', () => ({
  loadSemesterAndPeriods: async () => ({
    semesterId: 1,
    semester: { start_date: '2026-09-01', end_date: '2027-01-15' },
    times: {},
    periods: [1, 2, 3, 4, 8, 5, 6, 7].map((p) => ({ period: p, label: p === 8 ? '午休' : `第${p}節` })),
    labels: { 8: '午休' },
  }),
}))
vi.mock('../hooks/useTableChanges', () => ({ useTableChanges: () => undefined }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => h.auth }))

import MyGridPage from './MyGridPage'

// Wednesday 2026-11-25 (Taipei); the displayed week is Mon 11/23 - Fri 11/27.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-25T04:00:00Z'))
  vi.clearAllMocks()
  h.tables = {
    weekly_slots: [
      { user_id: 'me', semester_id: 1, weekday: 3, period: 3 },
      { user_id: 'me', semester_id: 1, weekday: 1, period: 2 },
    ],
    slot_exceptions: [],
    no_class_days: [],
  }
  h.auth.profile = { id: 'me', role: 'grad' }
  h.setDaySlot.mockResolvedValue({ applied: true, affected: [] })
})
afterEach(() => vi.useRealTimers())

const cellOf = (c: HTMLElement, key: string) => c.querySelector(`[data-cell="${key}"]`) as HTMLElement

describe('MyGridPage', () => {
  it('opens the popup for an on cell and sets only this week off via runWithImpact', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    const { container } = render(<MyGridPage />)
    await waitFor(() => expect(cellOf(container, '3-3')).toHaveAttribute('data-on', 'true'))
    await user.click(cellOf(container, '3-3'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '每週這節都不行' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '恢復成每週固定' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '只有這週不行' }))
    await waitFor(() => expect(h.setDaySlot).toHaveBeenCalledWith('2026-11-25', 3, false, false))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('warns first when the change would cancel meetings, and cancels without confirming', async () => {
    h.setDaySlot.mockResolvedValue({
      applied: false,
      affected: [{ id: 'b1', date: '2026-11-25', period: 3, undergrad_name: '小明', status: 'pending' }],
    })
    const user = userEvent.setup({ advanceTimers: () => undefined })
    const { container } = render(<MyGridPage />)
    await waitFor(() => expect(cellOf(container, '3-3')).toHaveAttribute('data-on', 'true'))
    await user.click(cellOf(container, '3-3'))
    await user.click(screen.getByRole('button', { name: '只有這週不行' }))
    await user.click(await screen.findByRole('button', { name: '先不要' }))
    expect(h.setDaySlot).toHaveBeenCalledTimes(1)
  })

  it('offers 只有這週可以 / 每週這節都可以 on an off cell', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    const { container } = render(<MyGridPage />)
    await waitFor(() => expect(cellOf(container, '4-3')).toBeTruthy())
    await user.click(cellOf(container, '4-3'))
    expect(screen.getByRole('button', { name: '只有這週可以' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '每週這節都可以' })).toBeInTheDocument()
  })

  it('marks a template-differing cell 本週調整 and offers 恢復成每週固定', async () => {
    h.tables.slot_exceptions = [{ user_id: 'me', date: '2026-11-26', period: 5, kind: 'extra' }]
    h.clearDaySlot.mockResolvedValue({ applied: true, affected: [] })
    const user = userEvent.setup({ advanceTimers: () => undefined })
    const { container } = render(<MyGridPage />)
    await waitFor(() => expect(cellOf(container, '4-5')).toHaveAttribute('data-on', 'true'))
    expect(cellOf(container, '4-5')).toHaveTextContent('本週調整')
    expect(cellOf(container, '3-3')).not.toHaveTextContent('本週調整')
    await user.click(cellOf(container, '4-5'))
    await user.click(screen.getByRole('button', { name: '恢復成每週固定' }))
    await waitFor(() => expect(h.clearDaySlot).toHaveBeenCalledWith('2026-11-26', 5, false))
  })

  it('does not open a popup for a past date', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    const { container } = render(<MyGridPage />)
    await waitFor(() => expect(cellOf(container, '1-2')).toHaveAttribute('data-on', 'true'))
    expect(cellOf(container, '1-2')).toHaveAttribute('data-disabled', 'true')
    await user.click(cellOf(container, '1-2'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not open a popup on a no-class day', async () => {
    h.tables.no_class_days = [{ date: '2026-11-27', note: '校慶' }]
    const user = userEvent.setup({ advanceTimers: () => undefined })
    const { container } = render(<MyGridPage />)
    await screen.findByText('校慶')
    await user.click(cellOf(container, '5-3'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the action error inline', async () => {
    h.setDaySlot.mockRejectedValue(new Error('這一天不能修改（已過去、停課或不在學期內）'))
    const user = userEvent.setup({ advanceTimers: () => undefined })
    const { container } = render(<MyGridPage />)
    await waitFor(() => expect(cellOf(container, '3-3')).toHaveAttribute('data-on', 'true'))
    await user.click(cellOf(container, '3-3'))
    await user.click(screen.getByRole('button', { name: '只有這週不行' }))
    expect((await screen.findByRole('alert')).textContent).toContain('這一天不能修改')
  })

  it('uses the teacher title', async () => {
    h.auth.profile = { id: 'me', role: 'teacher' }
    render(<MyGridPage />)
    expect(await screen.findByRole('heading', { name: '我的可約時段' })).toBeInTheDocument()
  })
})
