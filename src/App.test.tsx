import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Profile } from './lib/supabase'

let profile: Profile = {
  id: 'u1',
  email: 'a@b.c',
  display_name: 'A',
  role: null,
  status: 'active',
  is_admin: false,
  mentor_id: null,
  student_id: 'b1234',
  notify_email: null,
  must_change_password: false,
  created_at: '2026-01-01T00:00:00Z',
}

vi.mock('./auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: { user: { id: 'u1' } }, profile, loading: false, refresh: async () => {} }),
}))

import { AppRoutes } from './App'
import { beforeEach } from 'vitest'

const base = profile
beforeEach(() => {
  profile = base
})

describe('active user without a role', () => {
  for (const path of ['/pending', '/calendar']) {
    it(`renders the unassigned message at ${path} without looping`, () => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>,
      )
      expect(screen.getByText('尚未指派身分，請聯絡管理者')).toBeInTheDocument()
    })
  }
})

describe('must change password', () => {
  for (const path of ['/change-password', '/calendar', '/pending', '/login']) {
    it(`only ever lands on /change-password (from ${path})`, () => {
      profile = { ...base, role: 'grad', must_change_password: true }
      render(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>,
      )
      expect(screen.getByText('請設定新密碼')).toBeInTheDocument()
    })
  }
})
