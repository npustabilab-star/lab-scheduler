import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  bookings: [] as unknown[],
  availableSlots: vi.fn(),
  createBooking: vi.fn(),
  respondBooking: vi.fn(),
  cancelBooking: vi.fn(),
  auth: { profile: { id: 'me', role: 'teacher' }, refresh: vi.fn() },
  signIn: vi.fn(),
  updateUser: vi.fn(),
  rpc: vi.fn(),
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
  return {
    supabase: {
      from: () => q,
      rpc: (...a: unknown[]) => h.rpc(...a),
      auth: {
        signInWithPassword: (...a: unknown[]) => h.signIn(...a),
        updateUser: (...a: unknown[]) => h.updateUser(...a),
      },
    },
  }
})
vi.mock('../lib/semester', () => ({
  loadSemesterAndPeriods: async () => ({ semesterId: 1, times: { 3: { start: '10:10', end: '11:00' } } }),
}))
vi.mock('../hooks/useTableChanges', () => ({ useTableChanges: () => undefined }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => h.auth }))

import { AppError } from '../lib/api'
import BookingPage from './BookingPage'
import ChangePasswordPage from './ChangePasswordPage'
import LoginPage from './LoginPage'
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

describe('LoginPage', () => {
  it('shows a generic error when sign-in fails', async () => {
    h.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const user = userEvent.setup()
    render(<LoginPage />)
    await user.type(screen.getByLabelText('學號'), 'B11234567')
    await user.type(screen.getByLabelText('密碼'), '4567')
    await user.click(screen.getByRole('button', { name: '登入' }))
    expect(await screen.findByText('學號或密碼錯誤')).toBeTruthy()
    expect(h.signIn).toHaveBeenCalledWith({
      email: 'b11234567@users.lab-scheduler.internal',
      password: 'lab-scheduler:4567',
    })
  })
})

describe('ChangePasswordPage', () => {
  it('rejects mismatching passwords without calling updateUser', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordPage />)
    await user.type(screen.getByLabelText('新密碼'), 'abcdefgh')
    await user.type(screen.getByLabelText('確認新密碼'), 'abcdefgx')
    await user.click(screen.getByRole('button', { name: '更改密碼' }))
    expect((await screen.findByRole('alert')).textContent).toContain('兩次輸入的密碼不一致')
    expect(h.updateUser).not.toHaveBeenCalled()
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('updates the password, then marks it changed and refreshes', async () => {
    h.updateUser.mockResolvedValue({ error: null })
    h.rpc.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<ChangePasswordPage />)
    await user.type(screen.getByLabelText('新密碼'), 'abcdefgh')
    await user.type(screen.getByLabelText('確認新密碼'), 'abcdefgh')
    await user.click(screen.getByRole('button', { name: '更改密碼' }))
    await waitFor(() => expect(h.auth.refresh).toHaveBeenCalled())
    expect(h.updateUser).toHaveBeenCalledWith({ password: 'lab-scheduler:abcdefgh' })
    expect(h.rpc).toHaveBeenCalledWith('password_changed')
  })

  it('does not call password_changed when updateUser fails', async () => {
    h.updateUser.mockResolvedValue({ error: { message: 'weak' } })
    const user = userEvent.setup()
    render(<ChangePasswordPage />)
    await user.type(screen.getByLabelText('新密碼'), 'abcdefgh')
    await user.type(screen.getByLabelText('確認新密碼'), 'abcdefgh')
    await user.click(screen.getByRole('button', { name: '更改密碼' }))
    expect((await screen.findByRole('alert')).textContent).toContain('密碼更新失敗，請再試一次')
    expect(h.rpc).not.toHaveBeenCalled()
  })
})
