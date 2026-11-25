import { describe, expect, it } from 'vitest'
import type { Profile } from './supabase'
import { homeFor, routesFor } from './routes'

const base: Profile = {
  id: 'u1',
  email: 'a@b.c',
  display_name: 'A',
  role: 'grad',
  status: 'active',
  is_admin: false,
  mentor_id: null,
  student_id: 'b1234',
  notify_email: null,
  must_change_password: false,
  created_at: '2026-01-01T00:00:00Z',
}
const p = (o: Partial<Profile>): Profile => ({ ...base, ...o })

describe('routesFor', () => {
  it('teacher admin', () => {
    expect(routesFor(p({ role: 'teacher', is_admin: true }))).toEqual([
      'calendar', 'my-grid', 'master', 'requests', 'admin',
    ])
  })
  it('grad', () => {
    expect(routesFor(p({ role: 'grad' }))).toEqual(['calendar', 'my-grid', 'master', 'requests'])
  })
  it('undergrad', () => {
    expect(routesFor(p({ role: 'undergrad' }))).toEqual(['booking', 'calendar'])
  })
  it('null / inactive -> none', () => {
    expect(routesFor(null)).toEqual([])
    expect(routesFor(p({ status: 'pending', role: null }))).toEqual([])
  })
})

describe('homeFor', () => {
  it('null -> /login', () => expect(homeFor(null)).toBe('/login'))
  it('pending -> /pending', () => expect(homeFor(p({ status: 'pending', role: null }))).toBe('/pending'))
  it('disabled -> /pending', () => expect(homeFor(p({ status: 'disabled' }))).toBe('/pending'))
  it('active without role -> /pending', () =>
    expect(homeFor(p({ status: 'active', role: null }))).toBe('/pending'))
  it('active must-change -> /change-password', () =>
    expect(homeFor(p({ must_change_password: true }))).toBe('/change-password'))
  it('grad -> /calendar', () => expect(homeFor(p({}))).toBe('/calendar'))
  it('undergrad -> /booking', () => expect(homeFor(p({ role: 'undergrad' }))).toBe('/booking'))
})
