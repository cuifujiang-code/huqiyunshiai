import { createClient } from '@supabase/supabase-js'

export function getSupabaseUrl() {
  return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
}

export function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function isSupabaseAdminConfigured() {
  return Boolean(getSupabaseUrl() && getServiceRoleKey())
}

export function getSupabaseAdmin() {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) {
    throw new Error('Supabase 未配置：请设置 VITE_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
