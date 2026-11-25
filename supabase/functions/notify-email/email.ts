// Pure email-building logic: no Deno APIs, so Vitest can import it.

export type EmailInput = {
  type:
    | 'booking_requested'
    | 'booking_confirmed'
    | 'booking_rejected'
    | 'booking_cancelled'
    | 'booking_expired'
    | 'booking_reminder'
  recipientName: string
  undergradName: string
  date: string // YYYY-MM-DD
  period: number
  periodLabel?: string // periods.label (e.g. '第3節', '午休'); falls back to 第N節
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
  const when = `${dateLabel(i.date)}${i.periodLabel || `第${i.period}節`}`
  const subject = {
    booking_requested: `【研究室】${i.undergradName} 預約 ${when}，待你確認`,
    booking_confirmed: `【研究室】預約已成立：${i.undergradName} ${when}`,
    booking_rejected: `【研究室】預約被婉拒：${i.undergradName} ${when}`,
    booking_cancelled: `【研究室】預約已取消：${i.undergradName} ${when}`,
    booking_expired: `【研究室】預約已逾期：${i.undergradName} ${when}`,
    booking_reminder: `【研究室】提醒：${i.undergradName} 預約 ${when} 尚未確認，明天到期`,
  }[i.type]

  const intro = {
    booking_requested: `${i.undergradName} 提出了一筆預約，需要你確認。`,
    booking_confirmed: `${i.undergradName} 的預約已經成立。`,
    booking_rejected: `${i.undergradName} 的預約被婉拒了。`,
    booking_cancelled: `${i.undergradName} 的預約已取消。`,
    booking_expired: `${i.undergradName} 的預約因未在期限內確認而逾期。`,
    booking_reminder: `${i.undergradName} 的預約你還沒有確認。預約需在會議日前 3 天確認，明天就會自動失效，請盡快到系統確認或婉拒。`,
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

/** Reminder to the teacher: tomorrow has periods with 2+ grads and no 主值. */
export function buildDutyLeadEmail(i: { recipientName: string; date: string; detail: string; appUrl: string }): {
  subject: string
  text: string
} {
  const day = dateLabel(i.date)
  return {
    subject: `【研究室】提醒：${day} 有時段尚未設定主值`,
    text: [
      `${i.recipientName} 您好，`,
      '',
      `明天 ${day} 以下時段有兩位以上研究生值班，但還沒有設定主值：`,
      i.detail,
      '',
      '請到系統的「總表」點選該時段設定主值。',
      '',
      `前往系統：${i.appUrl}`,
    ].join('\n'),
  }
}
