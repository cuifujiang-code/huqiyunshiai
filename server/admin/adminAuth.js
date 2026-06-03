import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'

export class AdminAuthError extends Error {
  constructor(message, status = 403) {
    super(message)
    this.name = 'AdminAuthError'
    this.status = status
  }
}

/**
 * 从 Authorization: Bearer <jwt> 校验管理员身份
 * @returns {Promise<string>} admin user id
 */
export async function requireAdmin(req) {
  if (!isSupabaseAdminConfigured()) {
    throw new AdminAuthError('服务端未配置 Supabase', 503)
  }

  const authHeader = req.headers.authorization || req.headers.Authorization || ''
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    throw new AdminAuthError('缺少登录令牌', 401)
  }

  const admin = getSupabaseAdmin()
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user?.id) {
    throw new AdminAuthError('登录已失效，请重新登录', 401)
  }

  const userId = userData.user.id
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (profileErr) {
    throw new AdminAuthError(`读取用户资料失败：${profileErr.message}`, 500)
  }
  if (profile?.role !== 'admin') {
    throw new AdminAuthError('无管理员权限', 403)
  }

  return userId
}
