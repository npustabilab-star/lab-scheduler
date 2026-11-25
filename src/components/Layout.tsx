import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { routesFor } from '../lib/routes'
import type { RouteKey } from '../lib/routes'
import { supabase } from '../lib/supabase'
import { LAB_NAME, LabLogo } from './Brand'
import NotificationBell from './NotificationBell'

export const ROUTE_ICONS: Record<RouteKey, string> = {
  calendar: '📅',
  'my-grid': '🕘',
  master: '📋',
  booking: '📝',
  requests: '📨',
  admin: '⚙️',
}

export const ROUTE_LABELS: Record<RouteKey, string> = {
  calendar: '行事曆',
  'my-grid': '我的值班',
  master: '總表',
  booking: '預約',
  requests: '預約申請',
  admin: '管理',
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 text-sm transition ${isActive ? 'bg-white font-bold text-indigo-700 shadow' : 'text-indigo-50 hover:bg-white/15'}`
const bottomClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center py-1.5 text-[11px] ${isActive ? 'font-bold text-indigo-700' : 'text-slate-500'}`

export default function Layout() {
  const { profile } = useAuth()
  const routes = routesFor(profile)
  return (
    <div className="flex min-h-screen flex-col pb-16 lg:pb-0">
      <header className="brand-gradient flex items-center justify-between gap-2 px-3 py-2 text-white shadow-md">
        <div className="flex min-w-0 items-center gap-4">
          <NavLink to="/" className="flex min-w-0 items-center gap-2">
            <LabLogo className="h-9 w-9 shrink-0 rounded-xl ring-2 ring-white/40" />
            <span className="min-w-0 text-sm leading-tight font-bold sm:text-base">
              {LAB_NAME}
              <span className="block text-xs font-normal text-indigo-100">排班系統</span>
            </span>
          </NavLink>
          <nav className="hidden gap-1 lg:flex">
            {routes.map((r) => (
              <NavLink key={r} to={`/${r}`} className={linkClass}>
                {ROUTE_ICONS[r]} {ROUTE_LABELS[r]}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <span className="hidden rounded-full bg-white/15 px-3 py-1 text-sm sm:inline">{profile?.display_name}</span>
          <button type="button" className="rounded-full border border-white/40 px-3 py-1 text-sm text-white" onClick={() => void supabase.auth.signOut()}>
            登出
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 p-3">
        <div className="card p-2 sm:p-4">
          <Outlet />
        </div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-indigo-100 bg-white/95 shadow-[0_-4px_12px_rgb(79_70_229/0.08)] backdrop-blur lg:hidden">
        {routes.map((r) => (
          <NavLink key={r} to={`/${r}`} className={bottomClass}>
            <span className="text-lg leading-none">{ROUTE_ICONS[r]}</span>
            {ROUTE_LABELS[r]}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
