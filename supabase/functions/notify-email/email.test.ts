import { describe, expect, it } from 'vitest'
import { buildDutyLeadEmail, buildEmail, type EmailInput } from './email'

const base: EmailInput = {
  type: 'booking_requested',
  recipientName: '陳老師',
  undergradName: '王小美',
  date: '2026-03-09',
  period: 3,
  startTime: '10:10',
  endTime: '11:00',
  note: '討論專題進度',
  reason: null,
  appUrl: 'https://lab.example.com',
}

describe('buildEmail', () => {
  it('requested subject', () => {
    const { subject, text } = buildEmail(base)
    expect(subject).toBe('【研究室】王小美 預約 3/9（一）第3節，待你確認')
    expect(text).toContain('10:10–11:00')
    expect(text).toContain('討論專題進度')
    expect(text).toContain('https://lab.example.com')
  })

  it('lunch slot uses the period label, not 第8節', () => {
    const { subject, text } = buildEmail({ ...base, period: 8, periodLabel: '午休', startTime: '13:00', endTime: '13:20' })
    expect(subject).toBe('【研究室】王小美 預約 3/9（一）午休，待你確認')
    expect(subject).not.toContain('第8節')
    expect(text).toContain('2026-03-09 3/9（一）午休 13:00–13:20')
  })

  it('weekday label', () => {
    expect(buildEmail({ ...base, date: '2026-03-13' }).subject).toContain('3/13（五）')
  })

  it('rejected includes reason', () => {
    const r = buildEmail({ ...base, type: 'booking_rejected', reason: '那天要考試' })
    expect(r.text).toContain('原因：那天要考試')
    expect(buildEmail({ ...base, type: 'booking_rejected', reason: null }).text).not.toContain('原因：')
  })

  it('other types have expected subject prefixes', () => {
    expect(buildEmail({ ...base, type: 'booking_confirmed' }).subject.startsWith('【研究室】預約已成立')).toBe(true)
    expect(buildEmail({ ...base, type: 'booking_cancelled' }).subject.startsWith('【研究室】預約已取消')).toBe(true)
    expect(buildEmail({ ...base, type: 'booking_expired' }).subject.startsWith('【研究室】預約已逾期')).toBe(true)
  })
})

describe('reminders', () => {
  it('booking reminder mentions the deadline', () => {
    expect(buildEmail({ ...base, type: 'booking_reminder' }).subject).toContain('尚未確認')
  })
  it('duty lead reminder lists the periods', () => {
    const e = buildDutyLeadEmail({ recipientName: '老師', date: '2026-03-03', detail: '第3節（甲、乙）', appUrl: 'x' })
    expect(e.subject).toContain('3/3（二）')
    expect(e.text).toContain('第3節（甲、乙）')
  })
})
