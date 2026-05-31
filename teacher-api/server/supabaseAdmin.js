import { createClient } from '@supabase/supabase-js'

/** 仅使用 service_role URL/key，禁止 anon key */
export function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
}

export function getServiceRoleKey() {
  // 支持多种常见拼写变体
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  )
}

function decodeJwtRole(key) {
  try {
    const parts = String(key).split('.')
    if (parts.length < 2) return null
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
    return json?.role ?? null
  } catch {
    return null
  }
}

/** 确保 key 为 service_role，拒绝 ANON_KEY / VITE_SUPABASE_ANON_KEY */
export function assertServiceRoleKey(key = getServiceRoleKey()) {
  if (!key) {
    throw new Error(
      'Supabase 未配置：请设置 SUPABASE_SERVICE_ROLE_KEY（service_role secret，非 anon key）' +
      '。已检查变量名：SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY'
    )
  }
  // 支持多种 anon key 拼写变体
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  if (anonKey && key === anonKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 与 ANON_KEY 相同，请使用 Settings → API → service_role secret')
  }
  const role = decodeJwtRole(key)
  if (role === 'anon') {
    throw new Error('当前 key 为 anon 角色，无法绕过 RLS，请改用 SUPABASE_SERVICE_ROLE_KEY')
  }
  return role
}

export function isSupabaseAdminConfigured() {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) return false
  try {
    assertServiceRoleKey(key)
    return true
  } catch {
    return false
  }
}

/** 唯一 Supabase 客户端入口：SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY */
export function createServiceRoleClient() {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) {
    throw new Error('Supabase 未配置：请设置 SUPABASE_URL（或 VITE_SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY')
  }
  assertServiceRoleKey(key)
  // 打印客户端配置（脱敏），便于排查
  const logUrl = String(url).replace(/\/\/.*?@/, '//***@')
  console.log('[Supabase] 创建 service_role 客户端', { url: logUrl, keyLen: String(key).length })
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** @deprecated 别名，与 createServiceRoleClient 相同 */
export function getSupabaseAdmin() {
  return createServiceRoleClient()
}
