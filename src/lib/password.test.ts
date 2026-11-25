import { describe, expect, it } from 'vitest'
import { validateNewPassword } from './password'

describe('validateNewPassword', () => {
  it('rejects short passwords', () => expect(validateNewPassword('1234567', '1234567')).toBe('新密碼至少 8 碼'))
  it('rejects mismatch', () => expect(validateNewPassword('abcdefgh', 'abcdefgx')).toBe('兩次輸入的密碼不一致'))
  it('accepts a valid pair', () => expect(validateNewPassword('abcdefgh', 'abcdefgh')).toBeNull())
})
