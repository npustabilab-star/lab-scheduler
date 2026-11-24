import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  bookings: [] as unknown[],
  availableSlots: vi.fn(),
  createBooking: vi.fn(),
  respondBooking: vi.fn(),
  cancelBooking: vi.fn(),
  auth: { profile: { id: 'me', role: 'teacher' } },
}))

vi.mock('../lib/api', async () => {
  const { rpcErrorMessage } = await import('../lib/errors')
  class AppError extends Error {
    code: string
    constructor(code: string) {
      super(rpcErrorMessage(code))
      this.code = code
    }
  }
  return { AppError, ...h }
})
vi.mock('../lib/supabase', () => {
  const q: Record<string, unknown> = {}
  const chain = () => q
  for (const m of ['select', 'eq', 'in', 'or', 'order']) q[m] = chain
  q.then = (res: (v: unknown) => unknown) => res({ data: h.bookings, error: null })
  return { supabase: { from: () => q } }
})
vi.mock('../lib/semester', () => ({
  loadSemesterAndPeriods: async () => ({ semesterId: 1, times: { 3: { start: '10:10', end: '11:00' } } }),
}))
vi.mock('../hooks/useTableChanges', () => ({ useTableChanges: () => undefined }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => h.auth }))

import { AppError } from '../lib/api'
import BookingPage from './BookingPage'
import RequestsPage from './RequestsPage'

beforeEach(() => {
  vi.clearAllMocks()
  h.bookings = []
})

describe('BookingPage', () => {
  it('keeps SLOT_UNAVAILABLE visible after the reload', async () => {
    // far-future Monday so it is always selectable
    h.availableSlots.mockResolvedValue([{ date: '2099-03-09', period: 3 }])
    h.createBooking.mockRejectedValue(new AppError('SLOT_UNAVAILABLE'))
    const user = userEvent.setup()
    const { container } = render(<BookingPage />)
    await waitFor(() => expect(container.querySelector('[data-cell="1-3"]')?.textContent).toBe('○'))
    await user.click(container.querySelector('[data-cell="1-3"]')!)
    await user.click(screen.getByRole('button', { name: '送出預約' }))
    await waitFor(() => expect(h.createBooking).toHaveBeenCalled())
    await waitFor(() => expect(h.availableSlots).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('這個時段已被預約或不再開放，請重新選擇')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('alert').textContent).toContain('這個時段已被預約')
  })
})

describe('RequestsPage', () => {
  it('keeps the action error visible after the reload', async () => {
    h.bookings = [
      {
        id: 'b1', date: '2099-03-09', period: 3, note: 'hi', status: 'pending',
        teacher_ok: false, grad_ok: false, reason: null,
        teacher_id: 'me', grad_id: 'g', undergrad_id: 'u',
        undergrad: { display_name: '小明' }, teacher: null, grad: null,
      },
    ]
    h.respondBooking.mockRejectedValue(new AppError('NOT_PENDING'))
    const user = userEvent.setup()
    render(<RequestsPage />)
    await user.click(await screen.findByRole('button', { name: '同意' }))
    expect(await screen.findByText('這筆預約已經不是待確認狀態')).toBeTruthy()
    // reload finished (button still rendered from the reloaded list) and error persists
    await screen.findByRole('button', { name: '同意' })
    expect(screen.getByRole('alert').textContent).toContain('不是待確認狀態')
  })

  it('lists an upcoming pending booking I already accepted as waiting, with a cancel button', async () => {
    h.bookings = [
      {
        id: 'b2', date: '2099-03-09', period: 3, note: null, status: 'pending',
        teacher_ok: true, grad_ok: false, reason: null,
        teacher_id: 'me', grad_id: 'g', undergrad_id: 'u',
        undergrad: { display_name: '小華' }, teacher: null, grad: null,
      },
    ]
    render(<RequestsPage />)
    expect(await screen.findByText('等待另一位確認')).toBeTruthy()
    expect(screen.getByText('沒有待確認的預約')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '同意' })).toBeNull()
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
  })
})
