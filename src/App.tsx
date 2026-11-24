import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import { homeFor, routesFor } from './lib/routes'
import type { RouteKey } from './lib/routes'
import LoginPage from './pages/LoginPage'
import PendingPage from './pages/PendingPage'

function Placeholder({ name }: { name: string }) {
  return <h1 className="text-xl font-bold">{name}</h1>
}

function Guard({ need, children }: { need: 'anon' | 'pending' | 'active'; children: ReactNode }) {
  const { profile, session, loading } = useAuth()
  if (loading) return <p className="p-4">載入中…</p>
  const home = homeFor(session ? profile : null)
  const state = !session || !profile ? 'anon' : profile.status === 'active' ? 'active' : 'pending'
  if (state !== need) return <Navigate to={state === 'anon' && need !== 'anon' ? '/login' : home} replace />
  return <>{children}</>
}

function Home() {
  const { profile, session } = useAuth()
  return <Navigate to={homeFor(session ? profile : null)} replace />
}

function RouteGate({ k, children }: { k: RouteKey; children: ReactNode }) {
  const { profile } = useAuth()
  return routesFor(profile).includes(k) ? <>{children}</> : <Navigate to={homeFor(profile)} replace />
}

const PAGES: [RouteKey, string][] = [
  ['calendar', '行事曆'],
  ['my-grid', '我的值班'],
  ['master', '總表'],
  ['booking', '預約'],
  ['requests', '預約申請'],
  ['admin', '管理'],
]

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Guard need="anon"><LoginPage /></Guard>} />
          <Route path="/pending" element={<Guard need="pending"><PendingPage /></Guard>} />
          <Route element={<Guard need="active"><Layout /></Guard>}>
            {PAGES.map(([k, label]) => (
              <Route key={k} path={`/${k}`} element={<RouteGate k={k}><Placeholder name={label} /></RouteGate>} />
            ))}
          </Route>
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
