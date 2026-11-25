// Node-20-safe copy of the helpers in supabase/functions/_shared/credentials.ts.
// MUST match that file exactly (a Vitest test asserts identical output).
export const LOGIN_DOMAIN = 'users.lab-scheduler.internal'

export function normalizeStudentId(s) {
  return s.trim().toLowerCase()
}

export function loginEmail(studentId) {
  return `${normalizeStudentId(studentId)}@${LOGIN_DOMAIN}`
}

// Must match EMAIL_RE in supabase/functions/admin-members/logic.ts.
export function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

export function toAuthPassword(input) {
  return `lab-scheduler:${input}`
}
