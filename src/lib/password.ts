export function validateNewPassword(pw: string, confirm: string): string | null {
  if (pw.length < 8) return '新密碼至少 8 碼'
  if (pw !== confirm) return '兩次輸入的密碼不一致'
  return null
}
