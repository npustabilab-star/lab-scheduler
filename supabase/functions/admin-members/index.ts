// Supabase Edge Function (Deno): admin creates members / resets passwords.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { initialPassword, loginEmail, toAuthPassword } from '../_shared/credentials.ts'
import { checkStudentId, dbErrorMessage, GENERIC_ERROR, requireAdmin, validateCreateInput } from './logic.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const fail = (message: string, status = 400) => json({ ok: false, message }, status)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail('Method not allowed', 405)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u } = token ? await db.auth.getUser(token) : { data: { user: null } }
  if (!u.user) return fail('需要管理者權限', 403)
  const { data: caller } = await db
    .from('profiles').select('status, is_admin, must_change_password, role').eq('id', u.user.id).maybeSingle()
  if (!requireAdmin(caller)) return fail('需要管理者權限', 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('請求格式不正確')
  }

  if (body.action === 'create') {
    const v = validateCreateInput(body)
    if (!v.ok) return fail(v.message)
    const m = v.value
    const { data: created, error: cErr } = await db.auth.admin.createUser({
      email: loginEmail(m.student_id),
      password: toAuthPassword(initialPassword(m.student_id)),
      email_confirm: true,
    })
    if (cErr || !created.user) {
      const dup = cErr?.code === 'email_exists' || /already|registered/i.test(cErr?.message ?? '')
      if (!dup) console.error('createUser failed:', cErr?.message)
      return fail(dup ? '這個學號已經在名單中' : GENERIC_ERROR)
    }
    const { error: sErr } = await db.rpc('admin_setup_member', {
      p_user: created.user.id,
      p_student_id: m.student_id,
      p_display_name: m.display_name,
      p_role: m.role,
      p_mentor: m.mentor_id,
      p_notify_email: m.notify_email,
      p_is_admin: false,
    })
    if (sErr) {
      const { error: dErr } = await db.auth.admin.deleteUser(created.user.id)
      if (dErr) {
        console.error('rollback deleteUser failed', created.user.id, dErr.message)
        return fail('建立失敗，且無法自動清除，請聯絡系統維護者')
      }
      return fail(dbErrorMessage(sErr))
    }
    return json({ ok: true })
  }

  if (body.action === 'reset_password') {
    const userId = typeof body.user_id === 'string' ? body.user_id : ''
    if (!userId) return fail('請求格式不正確')
    const { data: p } = await db.from('profiles').select('student_id').eq('id', userId).maybeSingle()
    if (!p?.student_id) return fail('找不到這位成員')
    const { error: uErr } = await db.auth.admin.updateUserById(userId, {
      password: toAuthPassword(initialPassword(p.student_id)),
    })
    if (uErr) {
      console.error('updateUserById failed:', uErr.message)
      return fail(GENERIC_ERROR)
    }
    const { error: fErr } = await db.rpc('admin_reset_flag', { p_user: userId })
    if (fErr) {
      console.error('admin_reset_flag failed after password update', userId, fErr.message)
      return fail(dbErrorMessage(fErr))
    }
    return json({ ok: true })
  }

  if (body.action === 'change_student_id') {
    const userId = typeof body.user_id === 'string' ? body.user_id : ''
    const v = checkStudentId(body.student_id)
    if (!userId) return fail('請求格式不正確')
    if (!v.ok) return fail(v.message)
    const { data: p } = await db.from('profiles').select('student_id, role').eq('id', userId).maybeSingle()
    if (!p) return fail('找不到這位成員')
    if (p.role === 'teacher' && caller?.role !== 'teacher') return fail('只有老師可以修改老師的資料', 403)
    if (p.student_id === v.value) return json({ ok: true })
    const { data: dup } = await db.from('profiles').select('id').eq('student_id', v.value).maybeSingle()
    if (dup) return fail('這個學號已經在名單中')
    // login email follows the student id; password is unchanged
    const { error: uErr } = await db.auth.admin.updateUserById(userId, { email: loginEmail(v.value), email_confirm: true })
    if (uErr) {
      const taken = uErr.code === 'email_exists' || /already|registered/i.test(uErr.message ?? '')
      if (!taken) console.error('updateUserById(email) failed:', uErr.message)
      return fail(taken ? '這個學號已經在名單中' : GENERIC_ERROR)
    }
    const { error: pErr } = await db.from('profiles').update({ student_id: v.value }).eq('id', userId)
    if (pErr) {
      const { error: rErr } = p.student_id
        ? await db.auth.admin.updateUserById(userId, { email: loginEmail(p.student_id), email_confirm: true })
        : { error: null }
      if (rErr) console.error('rollback email failed', userId, rErr.message)
      return fail(dbErrorMessage(pErr))
    }
    return json({ ok: true })
  }

  return fail('未知的操作')
})
