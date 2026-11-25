import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rows: [] as unknown[] }))

vi.mock('../lib/api', () => ({ markNotificationsRead: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'limit']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown) => res({ data: h.rows, error: null })
      return q
    },
  },
}))
vi.mock('../hooks/useTableChanges', () => ({ useTableChanges: () => undefined }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ profile: { id: 'me' } }) }))

import NotificationBell, { formatNotificationTime } from './NotificationBell'

describe('formatNotificationTime', () => {
  it('uses 24h Asia/Taipei time without 上午/下午', () => {
    // 06:05Z = 14:05 in Taipei; 16:30Z = 00:30 next day in Taipei
    const afternoon = formatNotificationTime('2026-03-09T06:05:00Z')
    const midnight = formatNotificationTime('2026-03-09T16:30:00Z')
    expect(afternoon).toContain('14:05')
    expect(midnight).toContain('00:30')
    for (const s of [afternoon, midnight]) {
      expect(s).not.toMatch(/上午|下午/)
    }
  })
})

describe('NotificationBell', () => {
  it('renders created_at in 24h time', async () => {
    h.rows = [{ id: 1, type: 'booking_confirmed', read_at: '2026-03-09T00:00:00Z', created_at: '2026-03-09T06:05:00Z' }]
    render(<NotificationBell />)
    await userEvent.click(screen.getByRole('button', { name: '通知' }))
    const t = await screen.findByText(/14:05/)
    expect(t.textContent).not.toMatch(/上午|下午/)
  })
})
