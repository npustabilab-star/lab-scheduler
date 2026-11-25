import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  createMember: vi.fn(),
  resetMemberPassword: vi.fn(),
  setNotifyEmail: vi.fn(),
  setMentor: vi.fn(),
  setAccountStatus: vi.fn(),
  setAdmin: vi.fn(),
  addNoClassDay: vi.fn(),
  removeNoClassDay: vi.fn(),
  failPeriod: 0,
  semesterInsertError: null as { message: string; code: string } | null,
  periodUpdates: [] as number[],
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
  return { ...h, AppError }
})
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let updating = false
      let failed = false
      const q: Record<string, unknown> = {}
      const chain = () => q
      for (const m of ['select', 'order', 'delete', 'neq']) q[m] = chain
      let insertError: unknown = null
      q.insert = () => ((insertError = table === 'semesters' ? h.semesterInsertError : null), q)
      q.update = () => ((updating = true), q)
      q.eq = (_c: string, v: unknown) => {
        if (table === 'periods' && updating) {
          h.periodUpdates.push(v as number)
          failed = v === h.failPeriod
        }
        return q
      }
      q.then = (res: (v: unknown) => unknown) =>
        res(insertError ? { data: null, error: insertError } : failed ? { data: null, error: { message: 'boom' } } : { data: h.tables[table] ?? [], error: null })
      return q
    },
  },
}))
vi.mock('../hooks/useTableChanges', () => ({ useTableChanges: () => undefined }))

import { AppError } from '../lib/api'
import AdminPage from './AdminPage'

const grad = { id: 'g1', email: 'g@x', display_name: '學長', role: 'grad', status: 'active', is_admin: false, mentor_id: null, student_id: 'b100', notify_email: null, must_change_password: false }

beforeEach(() => {
  vi.clearAllMocks()
  h.tables = { profiles: [grad], semesters: [], periods: [], no_class_days: [] }
  h.createMember.mockResolvedValue(undefined)
  h.resetMemberPassword.mockResolvedValue(undefined)
  h.failPeriod = 0
  h.semesterInsertError = null
  h.periodUpdates = []
})

describe('AdminPage member creation', () => {
  const open = async () => {
    const user = userEvent.setup()
    render(<AdminPage />)
    await screen.findByRole('button', { name: '新增成員' })
    return user
  }

  it('requires a mentor for an undergrad and does not call createMember without one', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('學號'), 'B11234568')
    await user.type(screen.getByLabelText('姓名'), '小明')
    await user.selectOptions(screen.getByLabelText('身分'), 'undergrad')
    expect(screen.getByLabelText('指導研究生')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '新增成員' }))
    expect(screen.getByRole('alert').textContent).toContain('請選擇指導研究生')
    expect(h.createMember).not.toHaveBeenCalled()
  })

  it('creates a grad without a mentor dropdown', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('學號'), 'B11234567')
    await user.type(screen.getByLabelText('姓名'), '王小明')
    await user.selectOptions(screen.getByLabelText('身分'), 'grad')
    expect(screen.queryByLabelText('指導研究生')).toBeNull()
    await user.click(screen.getByRole('button', { name: '新增成員' }))
    await waitFor(() =>
      expect(h.createMember).toHaveBeenCalledWith({
        student_id: 'B11234567', display_name: '王小明', role: 'grad', mentor_id: null, notify_email: null,
      }),
    )
  })

  it('shows the friendly message when the student id already exists', async () => {
    h.createMember.mockRejectedValue(new AppError('STUDENT_ID_EXISTS'))
    const user = await open()
    await user.type(screen.getByLabelText('學號'), 'B11234567')
    await user.type(screen.getByLabelText('姓名'), '王小明')
    await user.selectOptions(screen.getByLabelText('身分'), 'grad')
    await user.click(screen.getByRole('button', { name: '新增成員' }))
    expect((await screen.findByRole('alert')).textContent).toContain('這個學號已經在名單中')
  })
})

describe('AdminPage reset password', () => {
  it('asks for confirmation then calls resetMemberPassword', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<AdminPage />)
    await user.click(await screen.findByRole('button', { name: '重設密碼' }))
    expect(confirm).toHaveBeenCalledWith('確定要把 學長 的密碼重設為學號後四碼？')
    await waitFor(() => expect(h.resetMemberPassword).toHaveBeenCalledWith('g1'))
    confirm.mockRestore()
  })

  it('does nothing when the confirmation is declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<AdminPage />)
    await user.click(await screen.findByRole('button', { name: '重設密碼' }))
    expect(h.resetMemberPassword).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
})

describe('AdminPage period times', () => {
  const periods = [
    { period: 1, start_time: '08:10:00', end_time: '09:00:00' },
    { period: 2, start_time: '09:10:00', end_time: '10:00:00' },
  ]
  const open = async () => {
    h.tables.periods = periods
    const user = userEvent.setup()
    render(<AdminPage />)
    await user.click(await screen.findByRole('tab', { name: '節次時間' }))
    return user
  }

  it('rejects end <= start and saves nothing', async () => {
    const user = await open()
    fireEvent.change(screen.getByLabelText('第2節結束'), { target: { value: '09:10' } })
    await user.click(screen.getByRole('button', { name: '儲存節次時間' }))
    expect(screen.getByRole('alert').textContent).toContain('第 2 節結束時間必須晚於開始時間')
    expect(h.periodUpdates).toEqual([])
  })

  it('rejects a period that starts before the previous one ends', async () => {
    const user = await open()
    fireEvent.change(screen.getByLabelText('第2節開始'), { target: { value: '08:30' } })
    await user.click(screen.getByRole('button', { name: '儲存節次時間' }))
    expect(screen.getByRole('alert').textContent).toContain('第 2 節不能早於第 1 節結束')
    expect(h.periodUpdates).toEqual([])
  })

  it('names the failed period and says earlier ones were saved', async () => {
    h.failPeriod = 2
    const user = await open()
    await user.click(screen.getByRole('button', { name: '儲存節次時間' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('第 2 節儲存失敗：boom（前面的節次已儲存）'))
    expect(h.periodUpdates).toEqual([1, 2])
  })
})

describe('AdminPage semesters', () => {
  it('maps the overlap exclusion violation (23P01) to a friendly message', async () => {
    h.semesterInsertError = { message: 'conflicting key value violates exclusion constraint', code: '23P01' }
    const user = userEvent.setup()
    render(<AdminPage />)
    await user.click(await screen.findByRole('tab', { name: '學期' }))
    await user.type(screen.getByLabelText('學期名稱'), '115-2')
    fireEvent.change(screen.getByLabelText('開始日'), { target: { value: '2026-02-16' } })
    fireEvent.change(screen.getByLabelText('結束日'), { target: { value: '2026-06-30' } })
    await user.click(screen.getByRole('button', { name: '新增學期' }))
    expect((await screen.findByRole('alert')).textContent).toContain('學期日期與現有學期重疊，請調整起訖日期')
  })
})
