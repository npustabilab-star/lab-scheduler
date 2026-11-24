import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  approveUser: vi.fn(),
  setMentor: vi.fn(),
  setAccountStatus: vi.fn(),
  setAdmin: vi.fn(),
  addNoClassDay: vi.fn(),
  removeNoClassDay: vi.fn(),
  failPeriod: 0,
  periodUpdates: [] as number[],
}))

vi.mock('../lib/api', () => ({ ...h }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let updating = false
      let failed = false
      const q: Record<string, unknown> = {}
      const chain = () => q
      for (const m of ['select', 'order', 'insert', 'delete', 'neq']) q[m] = chain
      q.update = () => ((updating = true), q)
      q.eq = (_c: string, v: unknown) => {
        if (table === 'periods' && updating) {
          h.periodUpdates.push(v as number)
          failed = v === h.failPeriod
        }
        return q
      }
      q.then = (res: (v: unknown) => unknown) =>
        res(failed ? { data: null, error: { message: 'boom' } } : { data: h.tables[table] ?? [], error: null })
      return q
    },
  },
}))
vi.mock('../hooks/useTableChanges', () => ({ useTableChanges: () => undefined }))

import AdminPage from './AdminPage'

const grad = { id: 'g1', email: 'g@x', display_name: '學長', role: 'grad', status: 'active', is_admin: false, mentor_id: null }
const newbie = { id: 'p1', email: 'n@x', display_name: '新人', role: null, status: 'pending', is_admin: false, mentor_id: null }

beforeEach(() => {
  vi.clearAllMocks()
  h.tables = { profiles: [grad, newbie], semesters: [], periods: [], no_class_days: [] }
  h.approveUser.mockResolvedValue(undefined)
  h.failPeriod = 0
  h.periodUpdates = []
})

describe('AdminPage approval form', () => {
  it('requires a mentor for an undergrad and does not call approveUser without one', async () => {
    const user = userEvent.setup()
    render(<AdminPage />)
    await user.selectOptions(await screen.findByLabelText('角色'), 'undergrad')
    expect(screen.getByLabelText('指導研究生')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '核准' }))
    expect(screen.getByRole('alert').textContent).toContain('請選擇指導研究生')
    expect(h.approveUser).not.toHaveBeenCalled()
  })

  it('approves a grad without a mentor dropdown', async () => {
    const user = userEvent.setup()
    render(<AdminPage />)
    await user.selectOptions(await screen.findByLabelText('角色'), 'grad')
    expect(screen.queryByLabelText('指導研究生')).toBeNull()
    await user.click(screen.getByRole('button', { name: '核准' }))
    await waitFor(() => expect(h.approveUser).toHaveBeenCalledWith('p1', 'grad', undefined))
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
