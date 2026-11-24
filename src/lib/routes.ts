import type { Profile } from './supabase'

export type RouteKey = 'my-grid' | 'master' | 'calendar' | 'booking' | 'requests' | 'admin'

export function routesFor(p: Profile | null): RouteKey[] {
  if (!p || p.status !== 'active') return []
  if (p.role === 'undergrad') return ['booking', 'calendar']
  if (p.role === 'grad' || p.role === 'teacher') {
    const r: RouteKey[] = ['calendar', 'my-grid', 'master', 'requests']
    if (p.is_admin) r.push('admin')
    return r
  }
  return []
}

export function homeFor(p: Profile | null): string {
  if (!p) return '/login'
  if (p.status !== 'active') return '/pending'
  const first = routesFor(p)[0]
  return first ? '/' + first : '/pending'
}
