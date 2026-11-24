import { describe, expect, it } from 'vitest'
import { resolveSupabaseConfig } from './supabase'

describe('resolveSupabaseConfig', () => {
  it('throws in production when env is missing or empty', () => {
    expect(() => resolveSupabaseConfig({ PROD: true })).toThrow('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY 設定')
    expect(() => resolveSupabaseConfig({ PROD: true, VITE_SUPABASE_URL: 'https://a.supabase.co', VITE_SUPABASE_ANON_KEY: '' })).toThrow()
  })
  it('uses the given values in production', () => {
    expect(resolveSupabaseConfig({ PROD: true, VITE_SUPABASE_URL: 'https://a.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).toEqual({
      url: 'https://a.supabase.co',
      key: 'k',
    })
  })
  it('falls back to local defaults outside production', () => {
    expect(resolveSupabaseConfig({ PROD: false }).url).toBe('http://127.0.0.1:55321')
  })
})
