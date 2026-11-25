import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  publicBoard: vi.fn(),
  publicPeriods: vi.fn(),
  publicSemester: vi.fn(async () => '115-1'),
  auth: { session: null as unknown, profile: null as unknown },
}))
vi.mock('../lib/api', () => ({ publicBoard: h.publicBoard, publicPeriods: h.publicPeriods, publicSemester: h.publicSemester }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => h.auth }))
vi.mock('../lib/week', async (orig) => ({ ...(await orig<typeof import('../lib/week')>()), taipeiToday: () => '2026-11-25' }))

import PublicBoardPage from './PublicBoardPage'

describe('PublicBoardPage', () => {
  it('shows grad names for this week without login, plus a login link', async () => {
    h.publicBoard.mockResolvedValue([
      { date: '2026-11-23', period: 3, display_name: '小明' },
      { date: '2026-11-23', period: 3, display_name: '小華' },
      { date: '2026-11-24', period: 8, display_name: '徐明龍', is_teacher: true },
    ])
    h.publicPeriods.mockResolvedValue([
      { period: 3, label: '第3節', start_time: '10:15:00', end_time: '11:05:00' },
      { period: 8, label: '午休', start_time: '13:00:00', end_time: '13:20:00' },
    ])
    render(
      <MemoryRouter>
        <PublicBoardPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('小明、小華')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '115-1學期ABI Lab班表' })).toBeInTheDocument()
    expect(screen.getByText('徐明龍老師')).toBeInTheDocument()
    expect(h.publicBoard).toHaveBeenCalledWith('2026-11-23', '2026-11-27')
    expect(screen.getAllByText('午休').length).toBeGreaterThan(0)
    expect(screen.getByText((_, el) => el?.textContent === '13:00–13:20')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '登入' })).toHaveAttribute('href', '/login')
  })
})
