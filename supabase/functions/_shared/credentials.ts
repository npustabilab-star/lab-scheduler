// Pure helpers shared by Edge Functions and the web app. No Deno APIs, no URL imports.
// normalizeStudentId must match the DB (lower(btrim(...))).

export const LOGIN_DOMAIN = 'users.lab-scheduler.internal'
const PASSWORD_PREFIX = 'lab-scheduler:'

export function normalizeStudentId(s: string): string {
  return s.trim().toLowerCase()
}

export function loginEmail(studentId: string): string {
  return `${normalizeStudentId(studentId)}@${LOGIN_DOMAIN}`
}

/** Auth requires a minimum password length; prefix so a 4-digit initial password is accepted. */
export function toAuthPassword(input: string): string {
  return `${PASSWORD_PREFIX}${input}`
}

/** Initial password = last 4 characters of the (normalized) student id. */
export function initialPassword(studentId: string): string {
  return normalizeStudentId(studentId).slice(-4)
}
