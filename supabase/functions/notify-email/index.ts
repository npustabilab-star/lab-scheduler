// Supabase Edge Function (Deno): sends the email for one notification row.
// Called by the DB trigger queue_notification_email() with the service role key.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { buildEmail, type EmailInput } from './email.ts'

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
    .from('notifications').select('id, user_id, type, booking_id, emailed_at').eq('id', id).maybeSingle()
  if (nErr) return json({ error: 'lookup failed' }, 500)
  if (!n) return json({ error: 'notification not found' }, 404)
  if (n.emailed_at) return json({ skipped: 'already emailed' })

  const { data: b, error: bErr } = await db
    .from('bookings').select('undergrad_id, date, period, note, reason').eq('id', n.booking_id).single()
  if (bErr || !b) return json({ error: 'booking not found' }, 404)

  const [{ data: recipient }, { data: undergrad }, { data: period }] = await Promise.all([
    db.from('profiles').select('email, display_name').eq('id', n.user_id).single(),
    db.from('profiles').select('display_name').eq('id', b.undergrad_id).single(),
    db.from('periods').select('start_time, end_time').eq('period', b.period).single(),
  ])
  if (!recipient?.email || !undergrad || !period) return json({ error: 'missing related rows' }, 500)

  const input: EmailInput = {
    type: n.type,
    recipientName: recipient.display_name,
    undergradName: undergrad.display_name,
    date: b.date,
    period: b.period,
    startTime: hhmm(period.start_time),
    endTime: hhmm(period.end_time),
    note: b.note ?? '',
    reason: b.reason,
    appUrl: Deno.env.get('APP_URL') ?? '',
  }
  const { subject, text } = buildEmail(input)

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
    await smtp.send({ from: user, to: recipient.email, subject, content: text })
  } catch (e) {
    console.error('send failed:', e instanceof Error ? e.message : 'unknown error')
    return json({ error: 'send failed' }, 502)
  } finally {
    await smtp.close().catch(() => {})
  }

  const { error: uErr } = await db
    .from('notifications').update({ emailed_at: new Date().toISOString() }).eq('id', id)
  if (uErr) return json({ error: 'sent but failed to mark emailed_at' }, 500)
  return json({ sent: true })
})
