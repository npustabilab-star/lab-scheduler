import { normalizeStudentId } from '../_shared/credentials.ts'

export type Role = 'teacher' | 'grad' | 'undergrad'

export type CreateInput = {
  student_id: string
  display_name: string
  role: Role
  mentor_id: string | null
  notify_email: string | null
}

export type ValidateResult = { ok: true; value: CreateInput } | { ok: false; message: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Must match the check in admin_setup_member (DB).
export const STUDENT_ID_RE = /^[a-z0-9._-]{4,}$/
const ROLES: Role[] = ['teacher', 'grad', 'undergrad']

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function validateCreateInput(x: unknown): ValidateResult {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const student_id = normalizeStudentId(str(o.student_id))
  if (student_id.length < 4) return { ok: false, message: '學號至少 4 碼' }
  if (!STUDENT_ID_RE.test(student_id)) return { ok: false, message: '學號只能包含英文字母、數字與 . _ -' }
  const display_name = str(o.display_name).trim()
  if (!display_name) return { ok: false, message: '請輸入姓名' }
  const role = o.role as Role
  if (!ROLES.includes(role)) return { ok: false, message: '身分不正確' }
  const mentor_id = role === 'undergrad' ? str(o.mentor_id).trim() || null : null
  if (role === 'undergrad' && !mentor_id) return { ok: false, message: '請選擇指導研究生' }
  const notify_email = str(o.notify_email).trim() || null
  if (role === 'teacher' && !notify_email) return { ok: false, message: '老師必須填寫 Email' }
  if (notify_email && !EMAIL_RE.test(notify_email)) return { ok: false, message: 'Email 格式不正確' }
  return { ok: true, value: { student_id, display_name, role, mentor_id, notify_email } }
}

/** Normalized student id, or a Chinese error message. */
export function checkStudentId(x: unknown): { ok: true; value: string } | { ok: false; message: string } {
  const id = normalizeStudentId(str(x))
  if (id.length < 4) return { ok: false, message: '學號至少 4 碼' }
  if (!STUDENT_ID_RE.test(id)) return { ok: false, message: '學號只能包含英文字母、數字與 . _ -' }
  return { ok: true, value: id }
}

export function requireAdmin(
  profile: { status: string; is_admin: boolean; must_change_password: boolean } | null,
): boolean {
  return !!profile && profile.status === 'active' && profile.is_admin && !profile.must_change_password
}

const DB_MESSAGES: Record<string, string> = {
  STUDENT_ID_EXISTS: '這個學號已經在名單中',
  INVALID_STUDENT_ID: '學號至少 4 碼，只能包含英文字母、數字與 . _ -',
  EMAIL_REQUIRED: '老師必須填寫 Email',
  TEACHER_EXISTS: '系統中已經有一位老師',
  INVALID_MENTOR: '指導研究生必須是已啟用的研究生',
}
export const GENERIC_ERROR = '發生錯誤，請稍後再試'

/** Map a DB exception message (contains one of the codes) to a Chinese message. */
export function dbErrorMessage(err: { message?: string } | null | undefined): string {
  const m = err?.message ?? ''
  for (const [code, msg] of Object.entries(DB_MESSAGES)) if (m.includes(code)) return msg
  return GENERIC_ERROR
}
