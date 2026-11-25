import { DEFAULT_ERROR_MESSAGE, rpcErrorMessage } from './errors'
import { supabase } from './supabase'
import type { ChangeResult } from './supabase'
import type { Database } from './database.types'
import type { CreateInput } from '../../supabase/functions/admin-members/logic.ts'

export class AppError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message ?? rpcErrorMessage(code))
    this.name = 'AppError'
    this.code = code
  }
}

type Fns = Database['public']['Functions']

async function call<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new AppError(error.message)
  return data as T
}

const change = async (p: PromiseLike<{ data: unknown; error: { message: string } | null }>) =>
  (await call(p)) as ChangeResult

/** `date` = the date being viewed; that week's per-period exception is dropped so it follows the template. */
export const setWeeklySlot = (weekday: number, period: number, on: boolean, confirm: boolean, date?: string) =>
  change(
    supabase.rpc('set_weekly_slot', { p_weekday: weekday, p_period: period, p_on: on, p_confirm: confirm, p_date: date }),
  )

export const setDaySlot = (date: string, period: number, on: boolean, confirm: boolean) =>
  change(supabase.rpc('set_day_slot', { p_date: date, p_period: period, p_on: on, p_confirm: confirm }))

export const clearDaySlot = (date: string, period: number, confirm: boolean) =>
  change(supabase.rpc('clear_day_slot', { p_date: date, p_period: period, p_confirm: confirm }))

export const addException = (date: string, period: number | null, confirm: boolean) =>
  change(supabase.rpc('add_exception', { p_date: date, p_period: period as number, p_confirm: confirm }))

export const removeException = (date: string, period: number | null) =>
  call(supabase.rpc('remove_exception', { p_date: date, p_period: period as number })).then(() => undefined)

export const addNoClassDay = (date: string, note: string, confirm: boolean) =>
  change(supabase.rpc('add_no_class_day', { p_date: date, p_note: note, p_confirm: confirm }))

export const removeNoClassDay = (date: string) =>
  call(supabase.rpc('remove_no_class_day', { p_date: date })).then(() => undefined)

export const setMentor = (undergrad: string, grad: string, confirm: boolean) =>
  change(supabase.rpc('set_mentor', { p_undergrad: undergrad, p_grad: grad, p_confirm: confirm }))

export const setAccountStatus = (
  user: string,
  status: Database['public']['Enums']['account_status'],
  confirm: boolean,
) => change(supabase.rpc('set_account_status', { p_user: user, p_status: status, p_confirm: confirm }))

export const setAdmin = (user: string, isAdmin: boolean) =>
  call(supabase.rpc('set_admin', { p_user: user, p_is_admin: isAdmin })).then(() => undefined)

export const availableSlots = (): Promise<Fns['available_slots']['Returns']> =>
  call(supabase.rpc('available_slots')).then((d) => d ?? [])

export const createBooking = (date: string, period: number, note: string) =>
  call(supabase.rpc('create_booking', { p_date: date, p_period: period, p_note: note }))

export const respondBooking = (id: string, accept: boolean, reason?: string) =>
  call(supabase.rpc('respond_booking', { p_booking: id, p_accept: accept, p_reason: reason })).then(
    () => undefined,
  )

export const cancelBooking = (id: string, reason?: string) =>
  call(supabase.rpc('cancel_booking', { p_booking: id, p_reason: reason })).then(() => undefined)

export const roster = (from: string, to: string): Promise<Fns['roster']['Returns']> =>
  call(supabase.rpc('roster', { p_from: from, p_to: to })).then((d) => d ?? [])

export const uncoveredDays = (from: string, to: string): Promise<string[]> =>
  call(supabase.rpc('uncovered_days', { p_from: from, p_to: to })).then((d) => d ?? [])

export const markNotificationsRead = (ids?: number[]) =>
  call(supabase.rpc('mark_notifications_read', { p_ids: ids })).then(() => undefined)

export type { CreateInput }

/** Calls the admin-members Edge Function; a non-2xx reply carries the Chinese message in its JSON body. */
async function adminMembers(body: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-members', { body })
  if (error) {
    let message = DEFAULT_ERROR_MESSAGE
    try {
      const j = await (error as { context?: Response }).context?.json()
      if (j && typeof j.message === 'string' && j.message) message = j.message
    } catch {
      // body was not JSON: keep the default message
    }
    throw new AppError('ADMIN_MEMBERS', message)
  }
  if (data && (data as { ok?: boolean }).ok === false) {
    throw new AppError('ADMIN_MEMBERS', (data as { message?: string }).message || DEFAULT_ERROR_MESSAGE)
  }
}

export const createMember = (input: CreateInput) => adminMembers({ action: 'create', ...input })

export const resetMemberPassword = (userId: string) => adminMembers({ action: 'reset_password', user_id: userId })

export const setNotifyEmail = (userId: string, email: string) =>
  call(supabase.rpc('set_notify_email', { p_user: userId, p_email: email })).then(() => undefined)

/** Public (no login): grads in the lab per date/period, names only. At most 14 days per call. */
export const publicBoard = (from: string, to: string): Promise<Fns['public_board']['Returns']> =>
  call(supabase.rpc('public_board', { p_from: from, p_to: to }))

/** Public (no login): periods in start-time order. */
export const publicPeriods = (): Promise<Fns['public_periods']['Returns']> => call(supabase.rpc('public_periods'))

export const setDisplayName = (userId: string, name: string) =>
  call(supabase.rpc('set_display_name', { p_user: userId, p_name: name }))

/** Teacher only: who leads a weekly slot with several grads (null clears). */
export const setDutyLead = (weekday: number, period: number, userId: string | null) =>
  call(supabase.rpc('set_duty_lead', { p_weekday: weekday, p_period: period, p_user: userId as string }))
