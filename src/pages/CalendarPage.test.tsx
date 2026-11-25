import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  roster: vi.fn(),
  uncoveredDays: vi.fn(),
}))

vi.mock('../lib/api', () => ({ roster: h.roster, uncoveredDays: h.uncoveredDays }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gte', 'lte', 'in']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown) => res({ data: h.tables[table] ?? [], error: null })
      return q
    },
  },
}))
vi.mock('../lib/semester', () => ({
  loadSemesterAndPeriods: async () => ({ semesterId: 1, semester: null, times: {}, periods: [], labels: {} }),
}))
vi.mock('../hooks/useTableChanges', () => ({ useTableChanges: () => undefined }))

import CalendarPage from './CalendarPage'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-25T04:00:00Z'))
  vi.clearAllMocks()
  h.tables = {
    profiles: [
      { id: 'g1', display_name: '阿文' },
      { id: 'g2', display_name: '小華' },
    ],
    bookings: [
      { id: 'b1', date: '2026-11-25', period: 3, status: 'pending', undergrad: { display_name: '王小美' } },
    ],
    no_class_days: [{ date: '2026-11-26', note: '校慶' }],
  }
  h.roster.mockResolvedValue([
    { date: '2026-11-25', user_id: 'g1', period: 3 },
    { date: '2026-11-25', user_id: 'g2', period: 3 },
  ])
  h.uncoveredDays.mockResolvedValue(['2026-11-24'])
})
afterEach(() => vi.useRealTimers())

describe('CalendarPage', () => {
  it('shows the week range, names and the meeting in the right cell', async () => {
    const { container } = render(<CalendarPage />)
    expect(screen.getByTestId('week-range')).toHaveTextContent('2026/11/23（一）～ 11/27（五）')
    await waitFor(() => expect(container.querySelector('[data-cell="3-3"]')).toHaveTextContent('小華、阿文'))
    const cell = container.querySelector('[data-cell="3-3"]')!
    expect(cell).toHaveTextContent('會議：王小美（待確認）')
    expect(container.querySelector('[data-cell="3-4"]')).toHaveTextContent('')
    expect(container.querySelector('[data-cell="2-3"]')).not.toHaveTextContent('阿文')
  })

  it('greys the no-class column with its note and reds an uncovered day', async () => {
    const { container } = render(<CalendarPage />)
    await screen.findByText('校慶')
    expect(container.querySelector('[data-cell="4-3"]')).toHaveAttribute('data-disabled', 'true')
    expect(container.querySelector('[data-cell="2-3"]')).toHaveAttribute('data-uncovered', 'true')
    expect(container.querySelector('[data-cell="3-3"]')).not.toHaveAttribute('data-uncovered')
  })

  it('has no click actions on cells and navigates weeks', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    const { container } = render(<CalendarPage />)
    await waitFor(() => expect(h.roster).toHaveBeenCalledWith('2026-11-23', '2026-11-27'))
    await user.click(container.querySelector('[data-cell="3-3"]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: '下一週' }))
    expect(screen.getByTestId('week-range')).toHaveTextContent('2026/11/30（一）～ 12/4（五）')
    await waitFor(() => expect(h.roster).toHaveBeenCalledWith('2026-11-30', '2026-12-04'))
    await user.click(screen.getByRole('button', { name: '本週' }))
    expect(screen.getByTestId('week-range')).toHaveTextContent('2026/11/23（一）')
  })
})
