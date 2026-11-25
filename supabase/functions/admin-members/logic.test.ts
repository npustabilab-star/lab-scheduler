import { describe, expect, it } from 'vitest'
import { initialPassword, loginEmail, normalizeStudentId, toAuthPassword } from '../_shared/credentials'
import { dbErrorMessage, requireAdmin, validateCreateInput } from './logic'

describe('credentials', () => {
  it('normalizes, derives email, password', () => {
    expect(normalizeStudentId(' B11234567 ')).toBe('b11234567')
    expect(initialPassword('B11234567')).toBe('4567')
    expect(loginEmail('B11234567')).toBe('b11234567@users.lab-scheduler.internal')
    expect(toAuthPassword('4567')).toBe('lab-scheduler:4567')
  })
})

describe('validateCreateInput', () => {
  it('rejects short student id', () => {
    expect(validateCreateInput({ student_id: '123', display_name: 'a', role: 'grad' })).toEqual({
      ok: false, message: '學號至少 4 碼',
    })
  })
  it('requires display name', () => {
    expect(validateCreateInput({ student_id: 'b1234', display_name: ' ', role: 'grad' })).toEqual({
      ok: false, message: '請輸入姓名',
    })
  })
  it('requires mentor for undergrad', () => {
    expect(validateCreateInput({ student_id: 'b1234', display_name: 'a', role: 'undergrad' })).toEqual({
      ok: false, message: '請選擇指導研究生',
    })
  })
  it('requires email for teacher', () => {
    expect(validateCreateInput({ student_id: 't1234', display_name: 'a', role: 'teacher' })).toEqual({
      ok: false, message: '老師必須填寫 Email',
    })
  })
  it('rejects malformed email', () => {
    expect(validateCreateInput({ student_id: 'b1234', display_name: 'a', role: 'grad', notify_email: 'abc' })).toEqual({
      ok: false, message: 'Email 格式不正確',
    })
  })
  it('normalizes a valid grad', () => {
    expect(validateCreateInput({ student_id: ' B11234567 ', display_name: '王', role: 'grad', notify_email: '' })).toEqual({
      ok: true,
      value: { student_id: 'b11234567', display_name: '王', role: 'grad', mentor_id: null, notify_email: null },
    })
  })
})

describe('requireAdmin', () => {
  it('only passes active admins who changed password', () => {
    expect(requireAdmin(null)).toBe(false)
    expect(requireAdmin({ status: 'active', is_admin: true, must_change_password: true })).toBe(false)
    expect(requireAdmin({ status: 'active', is_admin: false, must_change_password: false })).toBe(false)
    expect(requireAdmin({ status: 'pending', is_admin: true, must_change_password: false })).toBe(false)
    expect(requireAdmin({ status: 'active', is_admin: true, must_change_password: false })).toBe(true)
  })
})

describe('dbErrorMessage', () => {
  it('maps codes and falls back', () => {
    expect(dbErrorMessage({ message: 'STUDENT_ID_EXISTS' })).toBe('這個學號已經在名單中')
    expect(dbErrorMessage({ message: 'boom' })).toBe('發生錯誤，請稍後再試')
    expect(dbErrorMessage(null)).toBe('發生錯誤，請稍後再試')
  })
})

describe('scripts/credentials.mjs matches shared credentials.ts', () => {
  it.each([' B11234567 ', 'teacher', 'S100X'])('same output for %j', async (input) => {
    const m = await import('../../../scripts/credentials.mjs')
    expect(m.normalizeStudentId(input)).toBe(normalizeStudentId(input))
    expect(m.loginEmail(input)).toBe(loginEmail(input))
    expect(m.toAuthPassword(initialPassword(input))).toBe(toAuthPassword(initialPassword(input)))
  })
})

describe('isValidEmail (scripts) agrees with logic.ts', () => {
  it.each([
    ['npustabilab@gmail.com', true],
    ['students@x.edu', true],
    ['abc', false],
    ['a@bXc', false],
  ])('%s -> %s', async (email, expected) => {
    const m = await import('../../../scripts/credentials.mjs')
    expect(m.isValidEmail(email)).toBe(expected)
    const r = validateCreateInput({ student_id: 'b1234', display_name: 'a', role: 'grad', notify_email: email })
    expect(r.ok).toBe(expected)
  })
})
