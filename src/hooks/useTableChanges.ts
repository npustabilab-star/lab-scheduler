import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useTableChanges(tables: string[], onChange: () => void): void {
  const cb = useRef(onChange)
  useEffect(() => {
    cb.current = onChange
  })
  const key = tables.join(',')
  useEffect(() => {
    const channel = supabase.channel(`changes:${key}:${Math.random().toString(36).slice(2)}`)
    for (const table of key.split(',').filter(Boolean)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => cb.current())
    }
    channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [key])
}
