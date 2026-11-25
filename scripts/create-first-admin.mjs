// Usage: node scripts/create-first-admin.mjs <代碼> <姓名> <Email> <密碼>
// Env:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js'
import { isValidEmail, loginEmail, normalizeStudentId, toAuthPassword } from './credentials.mjs'

const [studentId, name, email, password] = process.argv.slice(2)
if (!studentId || !name || !email || !password) {
  console.error('用法：node scripts/create-first-admin.mjs <代碼> <姓名> <Email> <密碼>')
  process.exit(1)
}
if (password.length < 8) {
  console.error('密碼至少 8 碼')
  process.exit(1)
}
if (!isValidEmail(email)) {
  console.error('Email 格式不正確')
  process.exit(1)
}
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('請設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const { data, error } = await db.auth.admin.createUser({
  email: loginEmail(studentId),
  password: toAuthPassword(password),
  email_confirm: true,
})
if (error || !data.user) {
  console.error('建立帳號失敗：', error?.message ?? 'unknown')
  process.exit(1)
}
const id = data.user.id

const rollback = async (msg) => {
  console.error(msg)
  const { error: dErr } = await db.auth.admin.deleteUser(id)
  if (dErr) console.error(`rollback deleteUser failed，請手動刪除殘留的 auth user：${id}（${dErr.message}）`)
  process.exit(1)
}

const { error: sErr } = await db.rpc('admin_setup_member', {
  p_user: id, p_student_id: normalizeStudentId(studentId), p_display_name: name, p_role: 'teacher',
  p_mentor: null, p_notify_email: email.trim(), p_is_admin: true,
})
if (sErr) await rollback(`設定成員失敗：${sErr.message}`)

// the teacher chose their own password, so no forced change
const { error: fErr } = await db.from('profiles').update({ must_change_password: false }).eq('id', id)
if (fErr) await rollback(`更新失敗：${fErr.message}`)

console.log(`已建立管理者（老師）：${studentId}`)
