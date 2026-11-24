// Pure email-building logic: no Deno APIs, so Vitest can import it.

export type EmailInput = {
  type: 'booking_requested' | 'booking_confirmed' | 'booking_rejected' | 'booking_cancelled' | 'booking_expired'
  recipientName: string
  undergradName: string
  date: string // YYYY-MM-DD
  period: number
  startTime: string // HH:MM
  endTime: string
  note: string
  reason: string | null
  appUrl: string
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

// Parse 'YYYY-MM-DD' as a calendar date; independent of machine timezone.
function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${m}/${d}（${WEEKDAYS[wd]}）`
}

export function buildEmail(i: EmailInput): { subject: string; text: string } {
  const when = `${dateLabel(i.date)}第${i.period}節`
  const subject = {
    booking_requested: `【研究室】${i.undergradName} 預約 ${when}，待你確認`,
    booking_confirmed: `【研究室】預約已成立：${i.undergradName} ${when}`,
    booking_rejected: `【研究室】預約被婉拒：${i.undergradName} ${when}`,
    booking_cancelled: `【研究室】預約已取消：${i.undergradName} ${when}`,
    booking_expired: `【研究室】預約已逾期：${i.undergradName} ${when}`,
  }[i.type]

  const intro = {
    booking_requested: `${i.undergradName} 提出了一筆預約，需要你確認。`,
    booking_confirmed: `${i.undergradName} 的預約已經成立。`,
    booking_rejected: `${i.undergradName} 的預約被婉拒了。`,
    booking_cancelled: `${i.undergradName} 的預約已取消。`,
    booking_expired: `${i.undergradName} 的預約因未在期限內確認而逾期。`,
  }[i.type]

  const lines = [
    `${i.recipientName} 您好，`,
    '',
    intro,
    '',
    `時間：${i.date} ${when} ${i.startTime}–${i.endTime}`,
    `學生：${i.undergradName}`,
  ]
  if (i.note) lines.push(`備註：${i.note}`)
  if (i.reason) lines.push(`原因：${i.reason}`)
  lines.push('', `前往系統：${i.appUrl}`)
  return { subject, text: lines.join('\n') }
}
