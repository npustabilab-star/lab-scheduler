import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { routesFor } from '../lib/routes'
import type { RouteKey } from '../lib/routes'
import { supabase } from '../lib/supabase'
import NotificationBell from './NotificationBell'

export const ROUTE_LABELS: Record<RouteKey, string> = {
  calendar: '行事曆',
  'my-grid': '我的值班',
  master: '總表',
  booking: '預約',
  requests: '預約申請',
  admin: '管理',
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 text-sm ${isActive ? 'font-bold text-blue-700' : 'text-gray-700'}`

export default function Layout() {
  const { profile } = useAuth()
  const routes = routesFor(profile)
  return (
    <div className="flex min-h-screen flex-col pb-14 md:pb-0">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-4">
          <NavLink to="/" className="font-bold">研究室排班</NavLink>
          <nav className="hidden md:flex">
            {routes.map((r) => (
              <NavLink key={r} to={`/${r}`} className={linkClass}>
                {ROUTE_LABELS[r]}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <span className="hidden text-sm sm:inline">{profile?.display_name}</span>
          <button type="button" className="text-sm text-gray-600 underline" onClick={() => void supabase.auth.signOut()}>
            登出
          </button>
        </div>
      </header>
      <main className="min-w-0 flex-1 p-3">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t bg-white md:hidden">
        {routes.map((r) => (
          <NavLink key={r} to={`/${r}`} className={linkClass}>
            {ROUTE_LABELS[r]}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
