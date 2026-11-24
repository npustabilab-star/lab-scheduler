import { rpcErrorMessage } from './errors'
import { supabase } from './supabase'
import type { ChangeResult } from './supabase'
import type { Database } from './database.types'

export class AppError extends Error {
  code: string
  constructor(code: string) {
    super(rpcErrorMessage(code))
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

export const setWeeklySlot = (weekday: number, period: number, on: boolean, confirm: boolean) =>
  change(supabase.rpc('set_weekly_slot', { p_weekday: weekday, p_period: period, p_on: on, p_confirm: confirm }))

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

export const approveUser = (
  user: string,
  role: Database['public']['Enums']['user_role'],
  mentor?: string | null,
) =>
  call(supabase.rpc('approve_user', { p_user: user, p_role: role, p_mentor: mentor ?? undefined })).then(
    () => undefined,
  )

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
