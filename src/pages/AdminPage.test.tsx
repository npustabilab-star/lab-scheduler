import { render, screen, waitFor } from '@testing-library/react'
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
}))

vi.mock('../lib/api', () => ({ ...h }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      const chain = () => q
      for (const m of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'neq']) q[m] = chain
      q.then = (res: (v: unknown) => unknown) => res({ data: h.tables[table] ?? [], error: null })
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
