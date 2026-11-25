// Supabase Edge Function (Deno): sends the email for one notification row.
// Called by the DB trigger queue_notification_email() with the service role key.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { buildDutyLeadEmail, buildEmail, type EmailInput } from './email.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const hhmm = (t: string) => t.slice(0, 5)

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!serviceKey || token !== serviceKey) return json({ error: 'unauthorized' }, 401)

  let id: number
  try {
    id = Number((await req.json()).notification_id)
  } catch {
    return json({ error: 'bad request' }, 400)
  }
  if (!Number.isFinite(id)) return json({ error: 'bad request' }, 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  const { data: n, error: nErr } = await db
    .from('notifications').select('id, user_id, type, booking_id, ref_date, detail, emailed_at').eq('id', id).maybeSingle()
  if (nErr) return json({ error: 'lookup failed' }, 500)
  if (!n) return json({ error: 'notification not found' }, 404)
  if (n.emailed_at) return json({ skipped: 'already emailed' })

  const markHandled = async () =>
    (await db.from('notifications').update({ emailed_at: new Date().toISOString() }).eq('id', id)).error

  const send = async (to: string, subject: string, text: string): Promise<Response | null> => {
    const user = Deno.env.get('GMAIL_USER')!
    const smtp = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: user, password: Deno.env.get('GMAIL_APP_PASSWORD')! },
      },
    })
    try {
      await smtp.send({ from: user, to, subject, content: text })
    } catch (e) {
      console.error('send failed:', e instanceof Error ? e.message : 'unknown error')
      return json({ error: 'send failed' }, 502)
    } finally {
      await smtp.close().catch(() => {})
    }
    return null
  }

  if (n.type === 'duty_lead_reminder') {
    const { data: r } = await db.from('profiles').select('notify_email, display_name').eq('id', n.user_id).single()
    if (!r) return json({ error: 'missing related rows' }, 500)
    if (r.notify_email && n.ref_date) {
      const { subject, text } = buildDutyLeadEmail({
        recipientName: r.display_name,
        date: n.ref_date,
        detail: n.detail ?? '',
        appUrl: Deno.env.get('APP_URL') ?? '',
      })
      const failed = await send(r.notify_email, subject, text)
      if (failed) return failed
    }
    if (await markHandled()) return json({ error: 'failed to mark emailed_at' }, 500)
    return json({ sent: !!r.notify_email })
  }

  const { data: b, error: bErr } = await db
    .from('bookings').select('undergrad_id, date, period, note, reason').eq('id', n.booking_id).single()
  if (bErr || !b) return json({ error: 'booking not found' }, 404)

  const [{ data: recipient }, { data: undergrad }, { data: period }] = await Promise.all([
    db.from('profiles').select('notify_email, display_name').eq('id', n.user_id).single(),
    db.from('profiles').select('display_name').eq('id', b.undergrad_id).single(),
    db.from('periods').select('start_time, end_time, label').eq('period', b.period).single(),
  ])
  if (!recipient || !undergrad || !period) return json({ error: 'missing related rows' }, 500)
  if (!recipient.notify_email) {
    // No address on file: nothing to send, but mark handled so it is not retried.
    const { error: sErr } = await db
      .from('notifications').update({ emailed_at: new Date().toISOString() }).eq('id', id)
    if (sErr) return json({ error: 'failed to mark emailed_at' }, 500)
    return json({ skipped: 'no email' })
  }

  const input: EmailInput = {
    type: n.type as EmailInput['type'],
    recipientName: recipient.display_name,
    undergradName: undergrad.display_name,
    date: b.date,
    period: b.period,
    periodLabel: period.label,
    startTime: hhmm(period.start_time),
    endTime: hhmm(period.end_time),
    note: b.note ?? '',
    reason: b.reason,
    appUrl: Deno.env.get('APP_URL') ?? '',
  }
  const { subject, text } = buildEmail(input)

  const failed = await send(recipient.notify_email, subject, text)
  if (failed) return failed

  const { error: uErr } = await db
    .from('notifications').update({ emailed_at: new Date().toISOString() }).eq('id', id)
  if (uErr) return json({ error: 'sent but failed to mark emailed_at' }, 500)
  return json({ sent: true })
})
